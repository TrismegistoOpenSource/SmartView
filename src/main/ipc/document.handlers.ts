import { dialog, BrowserWindow } from 'electron'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { cpus } from 'node:os'
import { randomUUID } from 'node:crypto'
import { PDFDocument } from 'pdf-lib'
import { handle } from './registry'
import { applyCommands } from '../pdf/engine'
import type { SourceBytes, SignatureImages } from '../pdf/engine'
import {
  openImageFiles,
  isImagePath,
  SUPPORTED_IMAGE_EXTS,
  encodeImage,
  cropImage,
  getImagePath,
  forgetImage,
  loadSignaturePng
} from '../image/engine'
import { loadPdfAAssets } from '../assets'
import { listRecents, addRecent, clearRecents } from '../recents'
import type { OpenedDocument, OpenedFiles } from '@shared/ipc/contracts'

/**
 * Source of truth dei documenti aperti: il main detiene i byte di TUTTE
 * le sorgenti di ogni documento (l'originale + quelle importate via merge).
 * Al salvataggio riapplica l'intero command-log ai byte originali.
 */
interface OpenDoc {
  baseSourceId: string
  sources: Map<string, Uint8Array>
  /** Path corrente su disco (aggiornato da "Salva con nome"); null se mai salvato/senza origine. */
  filePath: string | null
  /** mtime del file quando è stato aperto o salvato l'ultima volta: guardia anti-sovrascrittura. */
  mtimeMs: number | null
}

/** mtime del file su disco, o null se non leggibile. */
async function mtimeOf(filePath: string): Promise<number | null> {
  try {
    return (await stat(filePath)).mtimeMs
  } catch {
    return null
  }
}

const openDocuments = new Map<string, OpenDoc>()

/**
 * Byte PNG delle immagini di firma, per imageId. Globali (una firma può essere
 * riusata su più pagine/documenti). Vivono per l'intera sessione.
 */
const signatureImages = new Map<string, SignatureImages[string]>()

function sourcesRecord(doc: OpenDoc): SourceBytes {
  const record: SourceBytes = {}
  for (const [id, bytes] of doc.sources) record[id] = bytes
  return record
}

function signatureImagesRecord(): SignatureImages {
  const record: SignatureImages = {}
  for (const [id, bytes] of signatureImages) record[id] = bytes
  return record
}

/** Copia indipendente in ArrayBuffer per il structured clone verso il renderer. */
function toTransferable(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer
}

/** Legge un PDF da disco, lo registra come documento aperto e lo prepara per il renderer. */
async function openAndRegister(filePath: string): Promise<OpenedDocument> {
  const bytes = new Uint8Array(await readFile(filePath))
  const pageCount = (await PDFDocument.load(bytes)).getPageCount()

  const docId = randomUUID()
  const sourceId = randomUUID()
  openDocuments.set(docId, {
    baseSourceId: sourceId,
    sources: new Map([[sourceId, bytes]]),
    filePath,
    mtimeMs: await mtimeOf(filePath)
  })
  void addRecent({ path: filePath, name: basename(filePath), kind: 'pdf' })

  return {
    docId,
    fileName: basename(filePath),
    filePath,
    sourceId,
    pageCount,
    data: toTransferable(bytes)
  }
}

/**
 * Apre e registra più file per path, saltando quelli illeggibili/non validi.
 * Percorso unico usato dal dialogo, dal drag&drop e dall'"Apri con…" del sistema.
 */
export async function openFiles(filePaths: string[]): Promise<OpenedDocument[]> {
  const opened: OpenedDocument[] = []
  for (const filePath of filePaths) {
    try {
      opened.push(await openAndRegister(filePath))
    } catch (error) {
      console.error(`Impossibile aprire ${filePath}:`, messageOf(error))
    }
  }
  return opened
}

const MARKDOWN_EXTS = ['md', 'markdown', 'txt']
const isPdfPath = (p: string): boolean => /\.pdf$/i.test(p)

/**
 * Euristica "è binario": presenza di un byte NUL nei primi 8 KB. Evita di aprire
 * come testo file binari (eseguibili, archivi) con estensione qualsiasi.
 */
function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

/**
 * Legge i file di testo indicati, saltando binari e illeggibili. Come CotEditor,
 * apre QUALSIASI estensione (non solo .md/.txt): la classificazione avviene sul
 * contenuto, non sul suffisso.
 */
async function openTextFiles(paths: string[]): Promise<OpenedFiles['texts']> {
  const out: OpenedFiles['texts'] = []
  for (const filePath of paths) {
    try {
      const buf = await readFile(filePath)
      if (looksBinary(buf)) {
        console.error(`File binario, non apribile come testo: ${filePath}`)
        continue
      }
      out.push({ docId: randomUUID(), fileName: basename(filePath), filePath, content: buf.toString('utf8') })
      void addRecent({ path: filePath, name: basename(filePath), kind: 'markdown' })
    } catch (error) {
      console.error(`Impossibile aprire il testo ${filePath}:`, messageOf(error))
    }
  }
  return out
}

/** Classifica i path e apre PDF, immagini e testi con i rispettivi motori. */
async function openMixed(filePaths: string[]): Promise<OpenedFiles> {
  const imagePaths = filePaths.filter(isImagePath)
  const pdfPaths = filePaths.filter(isPdfPath)
  // Tutto ciò che non è PDF né immagine viene tentato come testo (qualsiasi estensione).
  const textPaths = filePaths.filter((p) => !isImagePath(p) && !isPdfPath(p))
  const [documents, images, texts] = await Promise.all([
    openFiles(pdfPaths),
    openImageFiles(imagePaths),
    openTextFiles(textPaths)
  ])
  for (const img of images) void addRecent({ path: img.filePath, name: img.fileName, kind: 'image' })
  return { documents, images, texts }
}

export function registerDocumentHandlers(): void {
  handle('files:open', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Tutti i file', extensions: ['*'] },
        {
          name: 'PDF, immagini e testo',
          extensions: ['pdf', ...SUPPORTED_IMAGE_EXTS, ...MARKDOWN_EXTS]
        },
        { name: 'Documenti PDF', extensions: ['pdf'] },
        { name: 'Immagini', extensions: [...SUPPORTED_IMAGE_EXTS] },
        { name: 'Testo / Markdown', extensions: [...MARKDOWN_EXTS] }
      ]
    })
    if (result.canceled) return { documents: [], images: [], texts: [] }
    return openMixed(result.filePaths)
  })

  handle('files:openPaths', ({ filePaths }) => openMixed(filePaths))

  handle('document:import', async ({ docId }) => {
    const doc = openDocuments.get(docId)
    if (!doc) return null

    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Documenti PDF', extensions: ['pdf'] }]
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null

    const bytes = new Uint8Array(await readFile(filePath))
    const pageCount = (await PDFDocument.load(bytes)).getPageCount()

    const sourceId = randomUUID()
    doc.sources.set(sourceId, bytes)

    return {
      sourceId,
      fileName: basename(filePath),
      pageCount,
      data: toTransferable(bytes)
    }
  })

  handle('document:save', async ({ docId, commands }) => {
    const doc = openDocuments.get(docId)
    if (!doc) return errorResult('Documento non trovato in sessione')
    if (!doc.filePath) return errorResult('Il documento non ha un percorso su disco')

    // Guardia anti-sovrascrittura: se il file è cambiato fuori dall'app, chiedi conferma.
    const current = await mtimeOf(doc.filePath)
    if (doc.mtimeMs !== null && current !== null && current > doc.mtimeMs) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Sovrascrivi', 'Annulla'],
        defaultId: 1,
        cancelId: 1,
        message: 'Il file è stato modificato fuori da SmartView.',
        detail: `${basename(doc.filePath)} è cambiato sul disco dall'apertura. Sovrascriverlo perderebbe quelle modifiche.`
      })
      if (response !== 0) return { ok: false as const, reason: 'cancelled' as const }
    }

    try {
      const output = await applyCommands(sourcesRecord(doc), doc.baseSourceId, commands, {
        signatureImages: signatureImagesRecord()
      })
      await writeFile(doc.filePath, output)
      doc.mtimeMs = await mtimeOf(doc.filePath)
      return { ok: true as const, filePath: doc.filePath }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('document:saveAs', async ({ docId, commands, suggestedName }) => {
    const doc = openDocuments.get(docId)
    if (!doc) {
      return errorResult('Documento non trovato in sessione')
    }
    const target = await promptSavePath(suggestedName)
    if (!target) return { ok: false as const, reason: 'cancelled' as const }

    try {
      const output = await applyCommands(sourcesRecord(doc), doc.baseSourceId, commands, {
        signatureImages: signatureImagesRecord()
      })
      await writeFile(target, output)
      // "Salva con nome" adotta il nuovo path: i Salva successivi vi scrivono sopra.
      doc.filePath = target
      doc.mtimeMs = await mtimeOf(target)
      return { ok: true as const, filePath: target }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('document:exportPdfA', async ({ docId, commands, suggestedName }) => {
    const doc = openDocuments.get(docId)
    if (!doc) return errorResult('Documento non trovato in sessione')
    const target = await promptSavePath(suggestedName)
    if (!target) return { ok: false as const, reason: 'cancelled' as const }

    try {
      const pdfa = await loadPdfAAssets()
      const diagnostics = { strippedProhibited: false, unembeddedFonts: [] as string[] }
      const output = await applyCommands(sourcesRecord(doc), doc.baseSourceId, commands, {
        signatureImages: signatureImagesRecord(),
        pdfa,
        pdfaDiagnostics: diagnostics
      })
      await writeFile(target, output)
      const warning = pdfaWarning(diagnostics)
      if (warning) {
        await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Ho capito'],
          message: 'PDF/A esportato, ma la conformità potrebbe non essere piena',
          detail: warning
        })
      }
      return { ok: true as const, filePath: target, warning }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('signature:pick', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Immagini firma', extensions: ['png', 'svg'] }]
    })
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) return null

    const { data, width, height } = await loadSignaturePng(filePath)
    const imageId = randomUUID()
    signatureImages.set(imageId, data)
    return { imageId, data: toTransferable(data), width, height }
  })

  handle('document:export', async ({ docId, commands, positions, suggestedName }) => {
    const doc = openDocuments.get(docId)
    if (!doc) {
      return errorResult('Documento non trovato in sessione')
    }
    if (positions.length === 0) {
      return errorResult('Nessuna pagina selezionata per l’estrazione')
    }
    const target = await promptSavePath(suggestedName)
    if (!target) return { ok: false as const, reason: 'cancelled' as const }

    try {
      const output = await applyCommands(sourcesRecord(doc), doc.baseSourceId, commands, {
        select: positions,
        signatureImages: signatureImagesRecord()
      })
      await writeFile(target, output)
      return { ok: true as const, filePath: target }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('image:export', async ({ docId, options }) => {
    const filePath = getImagePath(docId)
    if (!filePath) return errorResult('Immagine non trovata in sessione')

    try {
      const { data, ext } = await encodeImage(filePath, options)
      const base = basename(filePath).replace(/\.[^.]+$/, '')
      const result = await dialog.showSaveDialog({
        defaultPath: `${base}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      })
      if (result.canceled || !result.filePath) {
        return { ok: false as const, reason: 'cancelled' as const }
      }
      await writeFile(result.filePath, data)
      return { ok: true as const, filePath: result.filePath }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('image:exportBatch', async ({ docIds, options }) => {
    const jobs = docIds
      .map((id) => getImagePath(id))
      .filter((p): p is string => Boolean(p))
    if (jobs.length === 0) return errorResult('Nessuna immagine da esportare')

    const dirResult = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Scegli la cartella di destinazione'
    })
    const dir = dirResult.filePaths[0]
    if (dirResult.canceled || !dir) return { ok: false as const, reason: 'cancelled' as const }

    const total = jobs.length
    let done = 0
    const notify = (): void => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('image:exportProgress', { done, total })
      }
    }

    try {
      // Coda a concorrenza limitata (~numero di CPU): sharp lavora fuori dal renderer.
      const concurrency = Math.max(1, Math.min(cpus().length, jobs.length))
      let cursor = 0
      const worker = async (): Promise<void> => {
        while (cursor < jobs.length) {
          const filePath = jobs[cursor++]!
          const { data, ext } = await encodeImage(filePath, options)
          const base = basename(filePath).replace(/\.[^.]+$/, '')
          await writeFile(join(dir, `${base}_mod.${ext}`), data)
          done++
          notify()
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => worker()))
      return { ok: true as const, dir, count: total }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('image:crop', ({ docId, rect }) => cropImage(docId, rect))

  handle('document:close', ({ docId }) => {
    openDocuments.delete(docId)
    forgetImage(docId)
  })

  handle('markdown:save', async ({ filePath, content }) => {
    try {
      await writeFile(filePath, content, 'utf8')
      return { ok: true as const, filePath }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('markdown:saveAs', async ({ content, suggestedName }) => {
    const result = await dialog.showSaveDialog({
      defaultPath: suggestedName,
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    })
    if (result.canceled || !result.filePath) {
      return { ok: false as const, reason: 'cancelled' as const }
    }
    try {
      await writeFile(result.filePath, content, 'utf8')
      void addRecent({ path: result.filePath, name: basename(result.filePath), kind: 'markdown' })
      return { ok: true as const, filePath: result.filePath }
    } catch (error) {
      return errorResult(messageOf(error))
    }
  })

  handle('markdown:exportPdf', async ({ html, suggestedName }) => {
    const target = await dialog.showSaveDialog({
      defaultPath: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (target.canceled || !target.filePath) {
      return { ok: false as const, reason: 'cancelled' as const }
    }
    // Finestra offscreen isolata: rende l'HTML (già sanitizzato dal renderer) in PDF
    // con printToPDF (capacità nativa di Electron, resa fedele all'anteprima).
    const printer = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true }
    })
    try {
      await printer.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        margins: { marginType: 'default' }
      })
      await writeFile(target.filePath, pdf)
      return { ok: true as const, filePath: target.filePath }
    } catch (error) {
      return errorResult(messageOf(error))
    } finally {
      printer.destroy()
    }
  })

  handle('file:stat', async ({ filePath }) => {
    try {
      const s = await stat(filePath)
      return {
        size: s.size,
        createdMs: Number.isFinite(s.birthtimeMs) && s.birthtimeMs > 0 ? s.birthtimeMs : null,
        modifiedMs: s.mtimeMs
      }
    } catch {
      return null
    }
  })

  handle('ui:confirmDiscard', async ({ fileName }) => {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Salva', 'Non salvare', 'Annulla'],
      defaultId: 0,
      cancelId: 2,
      message: `Salvare le modifiche a ${fileName}?`,
      detail: 'Se non salvi, le modifiche andranno perse.'
    })
    return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
  })

  handle('recents:list', () => listRecents())
  handle('recents:clear', () => clearRecents())
}

async function promptSavePath(suggestedName: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: [{ name: 'Documenti PDF', extensions: ['pdf'] }]
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
}

function errorResult(message: string): { ok: false; reason: 'error'; message: string } {
  return { ok: false, reason: 'error', message }
}

/**
 * Costruisce l'avviso onesto sul PDF/A quando la piena conformità non è garantita
 * per via del documento sorgente. undefined se non c'è nulla da segnalare.
 */
function pdfaWarning(d: { strippedProhibited: boolean; unembeddedFonts: string[] }): string | undefined {
  const parts: string[] = []
  if (d.unembeddedFonts.length > 0) {
    const list = d.unembeddedFonts.slice(0, 4).join(', ')
    const more = d.unembeddedFonts.length > 4 ? '…' : ''
    parts.push(
      `Il documento originale usa font non incorporati (${list}${more}). ` +
        'PDF/A richiede tutti i font incorporati: la piena conformità non è garantita per queste porzioni.'
    )
  }
  if (d.strippedProhibited) {
    parts.push(
      'Sono stati rimossi contenuti non ammessi da PDF/A presenti nell’originale ' +
        '(JavaScript, azioni, moduli XFA o allegati).'
    )
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
