/**
 * Motore di manipolazione PDF — puro TypeScript, zero dipendenze da Electron.
 * Prende i byte di uno o più documenti sorgente + il command-log, e
 * restituisce i byte del PDF risultante. Testabile senza GUI.
 */
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  StandardFonts,
  degrees,
  rgb
} from 'pdf-lib'
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { randomBytes } from 'node:crypto'
import { reduceDocument } from '@shared/domain/commands'
import type { EditCommand, FieldValue, Signature, TextBox } from '@shared/domain/commands'

/** Byte dei documenti sorgente, indicizzati per sourceId. */
export type SourceBytes = Record<string, Uint8Array>

/** Byte PNG delle immagini di firma, indicizzati per imageId. */
export type SignatureImages = Record<string, Uint8Array>

/** Asset per l'export PDF/A: profilo ICC di output e font da incorporare. */
export interface PdfAAssets {
  iccBytes: Uint8Array
  fontBytes: Uint8Array
}

/**
 * Diagnostica dell'export PDF/A, popolata in-place dal motore. Serve al gate:
 * comunicare all'utente quando la piena conformità NON è garantita per via del
 * documento sorgente (non per il testo/le firme che l'app aggiunge, sempre OK).
 */
export interface PdfADiagnostics {
  /** true se il sorgente conteneva contenuto proibito (JS, azioni, XFA, allegati) poi RIMOSSO. */
  strippedProhibited: boolean
  /** Nomi dei font usati dal sorgente ma NON incorporati (classe B, non riparabile senza rasterizzare). */
  unembeddedFonts: string[]
}

interface ApplyOptions {
  /**
   * Se presente, esporta solo le posizioni indicate dell'arrangiamento
   * finale (nell'ordine dato). Usato dallo split/estrazione.
   */
  select?: number[]
  /** Byte PNG delle firme referenziate dai comandi. */
  signatureImages?: SignatureImages
  /** Se presente, produce un export PDF/A-2b (metadati XMP + OutputIntent + font incorporato). */
  pdfa?: PdfAAssets
  /** Se presente (e con pdfa), il motore lo popola con l'esito della bonifica/analisi. */
  pdfaDiagnostics?: PdfADiagnostics
}

/** Helvetica standard usa la codifica WinAnsi (~Latin-1): sostituisco il resto. */
function sanitizeWinAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')
}

async function drawTextBoxes(
  target: PDFDocument,
  pageByKey: Map<string, PDFPage>,
  texts: TextBox[],
  font: PDFFont
): Promise<void> {
  for (const box of texts) {
    const page = pageByKey.get(box.pageKey)
    if (!page) continue
    // (x, y) è l'angolo in alto a sinistra; drawText posiziona la baseline,
    // quindi scendo dell'altezza dell'ascendente.
    const ascent = font.heightAtSize(box.fontSize, { descender: false })
    // rotation è oraria a schermo; nello spazio PDF (y verso l'alto) è l'opposto.
    const beta = (-(box.rotation ?? 0) * Math.PI) / 180
    // Rotazione attorno all'angolo in alto a sinistra (origine trasformazione
    // coerente con la UI, .text-box ha transform-origin 0 0).
    const ox = box.x + ascent * Math.sin(beta)
    const oy = box.y - ascent * Math.cos(beta)
    page.drawText(sanitizeWinAnsi(box.text), {
      x: ox,
      y: oy,
      size: box.fontSize,
      font,
      color: rgb(0, 0, 0),
      rotate: degrees(-(box.rotation ?? 0))
    })
  }
}

async function drawSignatures(
  target: PDFDocument,
  pageByKey: Map<string, PDFPage>,
  signatures: Signature[],
  images: SignatureImages
): Promise<void> {
  if (signatures.length === 0) return
  const embedded = new Map<string, PDFImage>()
  for (const sig of signatures) {
    const page = pageByKey.get(sig.pageKey)
    if (!page) continue
    let img = embedded.get(sig.imageId)
    if (!img) {
      const bytes = images[sig.imageId]
      if (!bytes) continue
      img = await target.embedPng(bytes)
      embedded.set(sig.imageId, img)
    }
    // (x, y) è l'angolo in alto a sinistra; drawImage ancora in basso a sinistra.
    const w = sig.width
    const h = sig.height
    // rotation è oraria a schermo; nello spazio PDF (y verso l'alto) è l'opposto.
    const beta = (-(sig.rotation ?? 0) * Math.PI) / 180
    // Rotazione attorno al CENTRO: pdf-lib ruota attorno all'ancora (x,y), quindi
    // sposto l'ancora così che il centro resti fermo. anchor = C - R(β)·(w/2,h/2).
    const cx = sig.x + w / 2
    const cy = sig.y - h / 2
    const cos = Math.cos(beta)
    const sin = Math.sin(beta)
    const ax = cx - (cos * (w / 2) - sin * (h / 2))
    const ay = cy - (sin * (w / 2) + cos * (h / 2))
    page.drawImage(img, {
      x: ax,
      y: ay,
      width: w,
      height: h,
      rotate: degrees(-(sig.rotation ?? 0))
    })
  }
}

/**
 * Bonifica PDF/A "classe A": rimuove dal documento il contenuto che PDF/A vieta
 * e che il sorgente potrebbe portarsi dietro — JavaScript, azioni (OpenAction,
 * additional actions), form XFA, file allegati. Sono tutte voci di dizionario,
 * quindi rimovibili con pdf-lib senza rasterizzare. Ritorna true se ha rimosso
 * qualcosa (per avvisare l'utente). NON tocca font/colori/trasparenze (classe B).
 */
function stripProhibitedContent(doc: PDFDocument): boolean {
  const catalog = doc.catalog
  let removed = false
  const drop = (dict: PDFDict, key: string): void => {
    if (dict.has(PDFName.of(key))) {
      dict.delete(PDFName.of(key))
      removed = true
    }
  }

  // Catalogo: azione all'apertura + additional actions.
  drop(catalog, 'OpenAction')
  drop(catalog, 'AA')

  // Name tree: JavaScript a livello di documento + file incorporati.
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict)
  if (names) {
    drop(names, 'JavaScript')
    drop(names, 'EmbeddedFiles')
  }
  // Associated files a livello di catalogo (PDF 2.0 / PDF/A-3).
  drop(catalog, 'AF')

  // AcroForm: XFA proibito; le apparenze le rigeneriamo comunque.
  const acro = catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)
  if (acro) drop(acro, 'XFA')

  // Pagine: additional actions + azioni/AA su ogni annotazione (incluse le widget).
  for (const page of doc.getPages()) {
    drop(page.node, 'AA')
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    if (!annots) continue
    for (let i = 0; i < annots.size(); i++) {
      const annot = annots.lookupMaybe(i, PDFDict)
      if (!annot) continue
      drop(annot, 'A')
      drop(annot, 'AA')
      drop(annot, 'AF')
    }
  }
  return removed
}

/** true se il FontDescriptor incorpora il programma del font (FontFile/2/3). */
function descriptorHasEmbeddedProgram(descriptor: PDFDict): boolean {
  return (
    descriptor.has(PDFName.of('FontFile')) ||
    descriptor.has(PDFName.of('FontFile2')) ||
    descriptor.has(PDFName.of('FontFile3'))
  )
}

/**
 * Elenca i font usati dalle pagine del sorgente ma NON incorporati (font
 * standard-14 o descrittori senza programma). PDF/A li vieta e pdf-lib non può
 * incorporarli a posteriori (serve il file del font e la riscrittura del content
 * stream): è quindi una non-conformità di "classe B" che possiamo solo segnalare.
 * Best-effort: guarda le risorse /Font di pagina + i DescendantFonts dei Type0.
 */
function collectUnembeddedFonts(doc: PDFDocument): string[] {
  const names = new Set<string>()
  const inspect = (font: PDFDict): void => {
    let descriptor = font.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    if (!descriptor) {
      // Type0 composito: il descrittore è nel DescendantFont.
      const descendants = font.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
      const child = descendants?.lookupMaybe(0, PDFDict)
      descriptor = child?.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    }
    const embedded = descriptor ? descriptorHasEmbeddedProgram(descriptor) : false
    if (!embedded) {
      const base = font.lookupMaybe(PDFName.of('BaseFont'), PDFName)
      names.add(base ? base.asString().replace(/^\//, '') : 'font sconosciuto')
    }
  }
  for (const page of doc.getPages()) {
    const resources = page.node.lookupMaybe(PDFName.of('Resources'), PDFDict)
    const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict)
    if (!fonts) continue
    for (const [, value] of fonts.entries()) {
      const font = fonts.context.lookupMaybe(value, PDFDict)
      // Type3 usa glifi come content stream: nessun programma font da incorporare, conforme.
      if (font && font.lookupMaybe(PDFName.of('Subtype'), PDFName)?.asString() !== '/Type3') {
        inspect(font)
      }
    }
  }
  return [...names]
}

/** Costruisce il packet XMP con l'identificazione PDF/A-2b + i metadati di base. */
function buildXmp(title: string, date: Date): string {
  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>2</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
      <xmp:CreatorTool>SmartView</xmp:CreatorTool>
      <xmp:CreateDate>${iso}</xmp:CreateDate>
      <xmp:ModifyDate>${iso}</xmp:ModifyDate>
    </rdf:Description>
    <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
      <pdf:Producer>SmartView</pdf:Producer>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
}

/**
 * Applica i requisiti strutturali PDF/A-2b: XMP conforme (stream Metadata NON
 * compresso), OutputIntent con profilo ICC sRGB incorporato, Info allineato.
 * Best-effort: i font del testo inserito sono incorporati a monte (Liberation
 * via fontkit); eventuali non-conformità EREDITATE dal PDF sorgente non vengono
 * rimosse (validazione veraPDF prevista solo in CI).
 */
function addPdfAMetadata(doc: PDFDocument, iccBytes: Uint8Array): void {
  const context = doc.context
  const now = new Date()

  const xmpBytes = new TextEncoder().encode(buildXmp(doc.getTitle() ?? '', now))
  const metaDict = context.obj({ Type: 'Metadata', Subtype: 'XML', Length: xmpBytes.length })
  const metaRef = context.register(PDFRawStream.of(metaDict, xmpBytes))
  doc.catalog.set(PDFName.of('Metadata'), metaRef)

  const iccDict = context.obj({ N: 3, Length: iccBytes.length })
  const iccRef = context.register(PDFRawStream.of(iccDict, iccBytes))
  const outputIntent = context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: iccRef
  })
  doc.catalog.set(PDFName.of('OutputIntents'), context.obj([context.register(outputIntent)]))

  doc.setProducer('SmartView')
  doc.setCreator('SmartView')
  if (!doc.getCreationDate()) doc.setCreationDate(now)
  doc.setModificationDate(now)

  // PDF/A-2b, ISO 19005-2 §6.1.3: il trailer DEVE contenere l'array ID (due
  // File Identifiers). pdf-lib non lo scrive di default, quindi lo generiamo.
  // Elemento 0 = ID permanente del documento; elemento 1 = ID della revisione
  // corrente. Per un file d'archivio appena prodotto i due coincidono. Riusiamo
  // un eventuale ID permanente già presente nel sorgente per non perderne la
  // continuità tra revisioni.
  const existing = context.trailerInfo.ID
  const permanent =
    existing instanceof PDFArray && existing.get(0) instanceof PDFHexString
      ? (existing.get(0) as PDFHexString)
      : PDFHexString.of(randomBytes(16).toString('hex'))
  const revision = PDFHexString.of(randomBytes(16).toString('hex'))
  context.trailerInfo.ID = context.obj([permanent, revision])
}

/**
 * PDF/A-2b (§6.3.3): il dizionario /AP di un'annotazione widget deve contenere
 * solo la voce N (Normal). pdf-lib genera anche l'apparenza D (Down) per
 * checkbox/pulsanti; la rimuoviamo (con R, Rollover) da tutti i widget del form.
 */
function stripNonNormalAppearances(target: PDFDocument): void {
  for (const field of target.getForm().getFields()) {
    for (const widget of field.acroField.getWidgets()) {
      const ap = widget.dict.lookupMaybe(PDFName.of('AP'), PDFDict)
      if (!ap) continue
      ap.delete(PDFName.of('D'))
      ap.delete(PDFName.of('R'))
    }
  }
}

/**
 * Compila i campi AcroForm SENZA appiattirli (restano widget editabili). Applica
 * solo dove il modulo è preservato (fast-path in-place); nel caso generale
 * (copyPages) l'AcroForm non viene ricollegato, quindi il loop non trova campi.
 */
function applyFormValues(target: PDFDocument, formValues: Record<string, FieldValue>): void {
  const entries = Object.entries(formValues)
  if (entries.length === 0) return
  const form = target.getForm()
  const byName = new Map(form.getFields().map((f) => [f.getName(), f]))
  for (const [name, value] of entries) {
    const field = byName.get(name)
    if (!field) continue
    try {
      if (field instanceof PDFTextField) field.setText(String(value))
      else if (field instanceof PDFCheckBox) value ? field.check() : field.uncheck()
      else if (field instanceof PDFDropdown) field.select(String(value))
      else if (field instanceof PDFOptionList) field.select(String(value))
      else if (field instanceof PDFRadioGroup) field.select(String(value))
    } catch {
      // Valore non valido per quel campo (es. opzione inesistente): lo si ignora.
    }
  }
}

function applyRotation(page: PDFPage, extra: number): void {
  if (extra !== 0) page.setRotation(degrees((page.getRotation().angle + extra) % 360))
}

export async function applyCommands(
  sources: SourceBytes,
  baseSourceId: string,
  commands: readonly EditCommand[],
  options: ApplyOptions = {}
): Promise<Uint8Array> {
  const baseBytes = sources[baseSourceId]
  if (!baseBytes) throw new Error(`Documento base mancante: ${baseSourceId}`)

  const cache = new Map<string, PDFDocument>()
  const load = async (sourceId: string): Promise<PDFDocument> => {
    const cached = cache.get(sourceId)
    if (cached) return cached
    const bytes = sources[sourceId]
    if (!bytes) throw new Error(`Documento sorgente mancante: ${sourceId}`)
    const doc = await PDFDocument.load(bytes)
    cache.set(sourceId, doc)
    return doc
  }

  const baseDoc = await load(baseSourceId)
  const base = { sourceId: baseSourceId, pageCount: baseDoc.getPageCount() }

  const { pages: fullArrangement, texts, signatures, formValues } = reduceDocument(base, commands)
  const arrangement = options.select
    ? options.select
        .map((i) => fullArrangement[i])
        .filter((p): p is (typeof fullArrangement)[number] => p !== undefined)
    : fullArrangement

  const structural = commands.some(
    (c) => c.type === 'move-page' || c.type === 'delete-page' || c.type === 'insert-pages'
  )

  const images = options.signatureImages ?? {}

  /** Incorpora il font per il testo: Liberation (subset) in PDF/A, altrimenti Helvetica standard. */
  const embedTextFont = async (target: PDFDocument): Promise<PDFFont> => {
    if (options.pdfa) {
      target.registerFontkit(fontkit)
      return target.embedFont(options.pdfa.fontBytes, { subset: true })
    }
    return target.embedFont(StandardFonts.Helvetica)
  }

  /** Passo comune: testo + firme + (eventuali) metadati PDF/A sul documento risultante. */
  const decorate = async (target: PDFDocument, pageByKey: Map<string, PDFPage>): Promise<void> => {
    // Font incorporato condiviso (una sola volta) tra testo e apparenze dei campi.
    let embedded: PDFFont | undefined
    const font = async (): Promise<PDFFont> => (embedded ??= await embedTextFont(target))

    applyFormValues(target, formValues)
    // PDF/A (§6.2.11.4.1): le apparenze dei campi generate da pdf-lib usano
    // Helvetica standard, NON incorporata. Se il documento ha un AcroForm le
    // rigeneriamo col font incorporato così che il font program sia presente.
    if (options.pdfa) {
      const form = target.getForm()
      if (form.getFields().length > 0) {
        try {
          form.updateFieldAppearances(await font())
        } catch {
          // Tipi di campo che pdf-lib non sa rigenerare: si lasciano invariati.
        }
        stripNonNormalAppearances(target)
      }
    }
    if (texts.length > 0) await drawTextBoxes(target, pageByKey, texts, await font())
    await drawSignatures(target, pageByKey, signatures, images)
    if (options.pdfa) {
      // Bonifica del proibito ereditato + analisi font non incorporati (gate onesto).
      const stripped = stripProhibitedContent(target)
      const unembedded = collectUnembeddedFonts(target)
      if (options.pdfaDiagnostics) {
        options.pdfaDiagnostics.strippedProhibited = stripped
        options.pdfaDiagnostics.unembeddedFonts = unembedded
      }
      addPdfAMetadata(target, options.pdfa.iccBytes)
    }
  }

  // Fast-path in-place: nessuna modifica strutturale né selezione.
  // Muta il documento base (rotazioni + testi + firme) preservandone integralmente
  // struttura, AcroForm, outline e metadati.
  if (!structural && !options.select) {
    const pages = baseDoc.getPages()
    const pageByKey = new Map<string, PDFPage>()
    for (const ref of arrangement) {
      const page = pages[ref.sourceIndex]
      if (!page) continue
      applyRotation(page, ref.rotation)
      pageByKey.set(ref.key, page)
    }
    await decorate(baseDoc, pageByKey)
    // PDF/A: niente object streams → struttura più conservativa e ispezionabile.
    return baseDoc.save(options.pdfa ? { useObjectStreams: false } : undefined)
  }

  // Caso generale (riordino / eliminazione / merge / estrazione):
  // copia delle pagine nell'ordine finale, da qualunque sorgente, poi decorazioni.
  // Nota (v0.3): gli AcroForm a livello di catalogo non vengono ricollegati
  // dopo copyPages; verrà affrontato con la mutazione in-place del page tree.
  const out = await PDFDocument.create()
  const pageByKey = new Map<string, PDFPage>()
  for (const ref of arrangement) {
    const srcDoc = await load(ref.sourceId)
    const [page] = await out.copyPages(srcDoc, [ref.sourceIndex])
    if (!page) continue
    applyRotation(page, ref.rotation)
    out.addPage(page)
    pageByKey.set(ref.key, page)
  }

  const title = baseDoc.getTitle()
  if (title !== undefined) out.setTitle(title)

  await decorate(out, pageByKey)

  return out.save(options.pdfa ? { useObjectStreams: false } : undefined)
}
