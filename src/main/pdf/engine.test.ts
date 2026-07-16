import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { applyCommands } from './engine'
import type { SignatureImages, SourceBytes } from './engine'

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pageCount; i++) doc.addPage([300, 400])
  return doc.save()
}

async function pageCountOf(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount()
}

/** Un PNG 1×1 valido, per i test di firma. */
const PNG_1x1 = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  ),
  (c) => c.charCodeAt(0)
)

const asLatin1 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('latin1')

describe('applyCommands', () => {
  it('senza comandi restituisce un PDF valido con le stesse pagine', async () => {
    const sources: SourceBytes = { A: await makePdf(3) }
    const out = await applyCommands(sources, 'A', [])
    expect(await pageCountOf(out)).toBe(3)
  })

  it('elimina una pagina', async () => {
    const sources: SourceBytes = { A: await makePdf(3) }
    const out = await applyCommands(sources, 'A', [{ type: 'delete-page', pageIndex: 0 }])
    expect(await pageCountOf(out)).toBe(2)
  })

  it('fonde le pagine di un secondo documento (merge)', async () => {
    const sources: SourceBytes = { A: await makePdf(2), B: await makePdf(3) }
    const out = await applyCommands(sources, 'A', [
      { type: 'insert-pages', at: 1, sourceId: 'B', sourceIndexes: [0, 1, 2] }
    ])
    expect(await pageCountOf(out)).toBe(5)
  })

  it('estrae solo le posizioni selezionate (split)', async () => {
    const sources: SourceBytes = { A: await makePdf(5) }
    const out = await applyCommands(sources, 'A', [], { select: [1, 3] })
    expect(await pageCountOf(out)).toBe(2)
  })

  it('fast-path rotazioni: resta un PDF valido con le stesse pagine', async () => {
    const sources: SourceBytes = { A: await makePdf(2) }
    const out = await applyCommands(sources, 'A', [
      { type: 'rotate-page', pageIndex: 0, degrees: 90 }
    ])
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(0).getRotation().angle).toBe(90)
  })

  it('inserisce testo senza alterare il numero di pagine (in-place)', async () => {
    const sources: SourceBytes = { A: await makePdf(1) }
    const out = await applyCommands(sources, 'A', [
      {
        type: 'add-text',
        box: { id: 't1', pageKey: 'A#0', x: 50, y: 300, text: 'Ciao', fontSize: 14 }
      }
    ])
    expect(await pageCountOf(out)).toBe(1)
  })

  it('mantiene il testo sulla pagina anche dopo un riordino (copyPages)', async () => {
    const sources: SourceBytes = { A: await makePdf(3) }
    const out = await applyCommands(sources, 'A', [
      {
        type: 'add-text',
        box: { id: 't1', pageKey: 'A#2', x: 50, y: 300, text: 'Ultima', fontSize: 14 }
      },
      { type: 'move-page', from: 2, to: 0 }
    ])
    expect(await pageCountOf(out)).toBe(3)
  })

  it('incorpora una firma PNG senza cambiare il numero di pagine', async () => {
    const sources: SourceBytes = { A: await makePdf(1) }
    const signatureImages: SignatureImages = { img1: PNG_1x1 }
    const out = await applyCommands(
      sources,
      'A',
      [
        {
          type: 'add-signature',
          sig: { id: 's1', pageKey: 'A#0', imageId: 'img1', x: 20, y: 120, width: 80, height: 40 }
        }
      ],
      { signatureImages }
    )
    expect(await pageCountOf(out)).toBe(1)
  })

  it('compila un campo modulo di testo senza appiattirlo', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 400])
    const tf = doc.getForm().createTextField('nome')
    tf.addToPage(page, { x: 20, y: 300, width: 200, height: 20 })
    const sources: SourceBytes = { A: await doc.save() }

    const out = await applyCommands(sources, 'A', [
      { type: 'set-field-value', field: 'nome', value: 'Mario' }
    ])
    const reloaded = await PDFDocument.load(out)
    // Il campo esiste ancora (non appiattito) e ha il valore impostato.
    expect(reloaded.getForm().getTextField('nome').getText()).toBe('Mario')
  })

  it('export PDF/A: aggiunge XMP pdfaid + OutputIntent e incorpora il font', async () => {
    const pdfa = {
      fontBytes: new Uint8Array(
        readFileSync(join(process.cwd(), 'resources/fonts/LiberationSans-Regular.ttf'))
      ),
      iccBytes: new Uint8Array(readFileSync(join(process.cwd(), 'resources/icc/sRGB-v2-micro.icc')))
    }
    const sources: SourceBytes = { A: await makePdf(1) }
    const out = await applyCommands(
      sources,
      'A',
      [{ type: 'add-text', box: { id: 't1', pageKey: 'A#0', x: 40, y: 300, text: 'Archivio', fontSize: 12 } }],
      { pdfa }
    )
    const text = asLatin1(out)
    expect(text).toContain('pdfaid')
    expect(text).toContain('OutputIntent')
    expect(await pageCountOf(out)).toBe(1)
  })
})
