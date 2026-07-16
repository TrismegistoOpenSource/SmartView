/**
 * Validazione PDF/A REALE tramite veraPDF (ISO 19005-2, profilo 2b).
 *
 * Genera un PDF/A per ciascun percorso d'export dell'engine e lo passa alla CLI
 * veraPDF, asserendo la conformità. NON è un mock: è la certificazione vera.
 *
 * Il test si AUTO-SALTA se la CLI veraPDF non è installata, così `npm test` gira
 * ovunque. Per abilitarlo installa veraPDF (vedi ARCHITECTURE.md) — di default in
 * `tools/verapdf/verapdf` — oppure imposta la variabile d'ambiente VERAPDF_CLI.
 */
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib'
import { applyCommands } from './engine'
import type { PdfAAssets, PdfADiagnostics, SignatureImages, SourceBytes } from './engine'
import type { EditCommand } from '@shared/domain/commands'

const VERAPDF_CLI =
  process.env.VERAPDF_CLI ?? join(process.cwd(), 'tools', 'verapdf', 'verapdf')

const available = existsSync(VERAPDF_CLI)

const pdfa: PdfAAssets = {
  fontBytes: new Uint8Array(
    readFileSync(join(process.cwd(), 'resources/fonts/LiberationSans-Regular.ttf'))
  ),
  iccBytes: new Uint8Array(readFileSync(join(process.cwd(), 'resources/icc/sRGB-v2-micro.icc')))
}

const PNG_1x1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0)
)

const tmp = mkdtempSync(join(tmpdir(), 'smartview-pdfa-'))

/** true se veraPDF certifica il PDF conforme al profilo PDF/A-2b. */
function isCompliant2b(bytes: Uint8Array, name: string): boolean {
  const file = join(tmp, `${name}.pdf`)
  writeFileSync(file, bytes)
  // veraPDF esce con codice 1 sui file non conformi: cattura sempre l'output XML.
  let out = ''
  try {
    out = execFileSync(VERAPDF_CLI, ['-f', '2b', '--format', 'xml', file], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    })
  } catch (e) {
    out = String((e as { stdout?: Buffer }).stdout ?? '')
  }
  return /isCompliant="true"/.test(out)
}

describe.skipIf(!available)('export PDF/A certificato da veraPDF (2b)', () => {
  it('fast-path in-place con testo incorporato', async () => {
    const blank = await PDFDocument.create()
    blank.addPage([595, 842])
    const sources: SourceBytes = { A: await blank.save() }
    const out = await applyCommands(
      sources,
      'A',
      [{ type: 'add-text', box: { id: 't1', pageKey: 'A#0', x: 60, y: 760, text: 'Archivio PDF/A', fontSize: 14 } }],
      { pdfa }
    )
    expect(isCompliant2b(out, 'inplace')).toBe(true)
  })

  it('percorso copyPages (riordino) con testo', async () => {
    const two = await PDFDocument.create()
    two.addPage([595, 842])
    two.addPage([595, 842])
    const sources: SourceBytes = { A: await two.save() }
    const cmds: EditCommand[] = [
      { type: 'add-text', box: { id: 't2', pageKey: 'A#1', x: 60, y: 760, text: 'Seconda', fontSize: 14 } },
      { type: 'move-page', from: 1, to: 0 }
    ]
    const out = await applyCommands(sources, 'A', cmds, { pdfa })
    expect(isCompliant2b(out, 'copypages')).toBe(true)
  })

  it('firma PNG incorporata', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const sources: SourceBytes = { A: await doc.save() }
    const images: SignatureImages = { img1: PNG_1x1 }
    const out = await applyCommands(
      sources,
      'A',
      [{ type: 'add-signature', sig: { id: 's1', pageKey: 'A#0', imageId: 'img1', x: 60, y: 200, width: 120, height: 60 } }],
      { pdfa, signatureImages: images }
    )
    expect(isCompliant2b(out, 'signature')).toBe(true)
  })

  it('AcroForm campo testo compilato (non appiattito)', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    const tf = doc.getForm().createTextField('nome')
    tf.addToPage(page, { x: 60, y: 700, width: 200, height: 20 })
    const sources: SourceBytes = { A: await doc.save() }
    const out = await applyCommands(
      sources,
      'A',
      [{ type: 'set-field-value', field: 'nome', value: 'Mario Rossi' }],
      { pdfa }
    )
    expect(isCompliant2b(out, 'acroform')).toBe(true)
  })

  it('AcroForm checkbox spuntata', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    const cb = doc.getForm().createCheckBox('accetto')
    cb.addToPage(page, { x: 60, y: 700, width: 20, height: 20 })
    const sources: SourceBytes = { A: await doc.save() }
    const out = await applyCommands(
      sources,
      'A',
      [{ type: 'set-field-value', field: 'accetto', value: true }],
      { pdfa }
    )
    expect(isCompliant2b(out, 'checkbox')).toBe(true)
  })

  it('bonifica: un sorgente con JavaScript proibito diventa conforme', async () => {
    // Sorgente con OpenAction JavaScript + name tree JavaScript: PDF/A lo vieta.
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const ctx = doc.context
    const jsAction = ctx.obj({ Type: 'Action', S: 'JavaScript', JS: PDFString.of('app.alert("x");') })
    const jsRef = ctx.register(jsAction)
    doc.catalog.set(PDFName.of('OpenAction'), jsRef)
    const names = ctx.obj({
      JavaScript: ctx.obj({ Names: ctx.obj([PDFString.of('script'), jsRef]) })
    })
    doc.catalog.set(PDFName.of('Names'), ctx.register(names))
    const sources: SourceBytes = { A: await doc.save() }

    const diagnostics: PdfADiagnostics = { strippedProhibited: false, unembeddedFonts: [] }
    const out = await applyCommands(sources, 'A', [], { pdfa, pdfaDiagnostics: diagnostics })

    expect(diagnostics.strippedProhibited).toBe(true)
    expect(isCompliant2b(out, 'sanitized-js')).toBe(true)
  })

  it('diagnostica: rileva i font non incorporati del sorgente', async () => {
    // Testo del SORGENTE con Helvetica standard (programma NON incorporato).
    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    const helv = await doc.embedFont(StandardFonts.Helvetica)
    page.drawText('Testo non incorporato', { x: 60, y: 760, size: 14, font: helv })
    const sources: SourceBytes = { A: await doc.save() }

    const diagnostics: PdfADiagnostics = { strippedProhibited: false, unembeddedFonts: [] }
    await applyCommands(sources, 'A', [], { pdfa, pdfaDiagnostics: diagnostics })

    expect(diagnostics.unembeddedFonts).toContain('Helvetica')
  })
})
