import { describe, it, expect } from 'vitest'
import {
  reduceCommands,
  reduceTexts,
  reduceSignatures,
  reduceFormValues,
  reduceDocument
} from './commands'
import type { Signature, SourceRef, TextBox } from './commands'

const sig = (id: string, pageKey: string): Signature => ({
  id,
  pageKey,
  imageId: 'img1',
  x: 50,
  y: 100,
  width: 120,
  height: 60
})

const A: SourceRef = { sourceId: 'A', pageCount: 3 }

const box = (id: string, pageKey: string, text = 'ciao'): TextBox => ({
  id,
  pageKey,
  x: 100,
  y: 200,
  text,
  fontSize: 14
})

describe('reduceCommands', () => {
  it('senza comandi restituisce le pagine in ordine originale', () => {
    expect(reduceCommands(A, []).map((p) => p.sourceIndex)).toEqual([0, 1, 2])
  })

  it('assegna chiavi stabili e uniche', () => {
    expect(reduceCommands(A, []).map((p) => p.key)).toEqual(['A#0', 'A#1', 'A#2'])
  })

  it('sposta una pagina', () => {
    const pages = reduceCommands(A, [{ type: 'move-page', from: 0, to: 2 }])
    expect(pages.map((p) => p.sourceIndex)).toEqual([1, 2, 0])
  })

  it('ruota e normalizza oltre 360 e sotto 0', () => {
    const pages = reduceCommands({ sourceId: 'A', pageCount: 1 }, [
      { type: 'rotate-page', pageIndex: 0, degrees: 90 },
      { type: 'rotate-page', pageIndex: 0, degrees: 90 },
      { type: 'rotate-page', pageIndex: 0, degrees: 90 },
      { type: 'rotate-page', pageIndex: 0, degrees: 90 },
      { type: 'rotate-page', pageIndex: 0, degrees: -90 }
    ])
    expect(pages[0]?.rotation).toBe(270)
  })

  it('elimina una pagina e i comandi successivi usano i nuovi indici', () => {
    const pages = reduceCommands(A, [
      { type: 'delete-page', pageIndex: 0 },
      { type: 'rotate-page', pageIndex: 0, degrees: 90 }
    ])
    expect(pages.map((p) => [p.sourceIndex, p.rotation])).toEqual([
      [1, 90],
      [2, 0]
    ])
  })

  it("non elimina mai l'ultima pagina rimasta", () => {
    const pages = reduceCommands({ sourceId: 'A', pageCount: 1 }, [
      { type: 'delete-page', pageIndex: 0 }
    ])
    expect(pages).toHaveLength(1)
  })

  it('inserisce pagine da un altro documento (merge)', () => {
    const pages = reduceCommands(A, [
      { type: 'insert-pages', at: 1, sourceId: 'B', sourceIndexes: [0, 1] }
    ])
    expect(pages.map((p) => p.key)).toEqual(['A#0', 'B#0', 'B#1', 'A#1', 'A#2'])
  })

  it('inserisce in coda se at supera la lunghezza', () => {
    const pages = reduceCommands(A, [
      { type: 'insert-pages', at: 99, sourceId: 'B', sourceIndexes: [0] }
    ])
    expect(pages.map((p) => p.key)).toEqual(['A#0', 'A#1', 'A#2', 'B#0'])
  })

  it('ignora i comandi di testo per l’arrangiamento pagine', () => {
    const pages = reduceCommands(A, [{ type: 'add-text', box: box('t1', 'A#0') }])
    expect(pages.map((p) => p.key)).toEqual(['A#0', 'A#1', 'A#2'])
  })
})

describe('reduceTexts', () => {
  it('aggiunge, modifica, sposta ed elimina annotazioni', () => {
    const texts = reduceTexts([
      { type: 'add-text', box: box('t1', 'A#0', 'primo') },
      { type: 'add-text', box: box('t2', 'A#1', 'secondo') },
      { type: 'edit-text', id: 't1', text: 'modificato' },
      { type: 'move-text', id: 't2', x: 10, y: 20 },
      { type: 'remove-text', id: 't1' }
    ])
    expect(texts).toHaveLength(1)
    expect(texts[0]).toMatchObject({ id: 't2', text: 'secondo', x: 10, y: 20 })
  })
})

describe('reduceSignatures', () => {
  it('aggiunge, sposta, ridimensiona ed elimina le firme', () => {
    const sigs = reduceSignatures([
      { type: 'add-signature', sig: sig('s1', 'A#0') },
      { type: 'add-signature', sig: sig('s2', 'A#1') },
      { type: 'move-signature', id: 's1', x: 10, y: 20 },
      { type: 'resize-signature', id: 's2', x: 5, y: 6, width: 200, height: 100 },
      { type: 'remove-signature', id: 's1' }
    ])
    expect(sigs).toHaveLength(1)
    expect(sigs[0]).toMatchObject({ id: 's2', x: 5, y: 6, width: 200, height: 100 })
  })
})

describe('reduceFormValues', () => {
  it('tiene l’ultimo valore per ogni campo', () => {
    const values = reduceFormValues([
      { type: 'set-field-value', field: 'nome', value: 'Anna' },
      { type: 'set-field-value', field: 'accetto', value: true },
      { type: 'set-field-value', field: 'nome', value: 'Anna Bianchi' }
    ])
    expect(values).toEqual({ nome: 'Anna Bianchi', accetto: true })
  })
})

describe('reduceDocument', () => {
  it('scarta annotazioni e firme ancorate a pagine eliminate', () => {
    const { pages, texts, signatures } = reduceDocument(A, [
      { type: 'add-text', box: box('t1', 'A#0') },
      { type: 'add-text', box: box('t2', 'A#1') },
      { type: 'add-signature', sig: sig('s1', 'A#0') },
      { type: 'add-signature', sig: sig('s2', 'A#2') },
      { type: 'delete-page', pageIndex: 0 }
    ])
    expect(pages.map((p) => p.key)).toEqual(['A#1', 'A#2'])
    expect(texts.map((t) => t.id)).toEqual(['t2'])
    expect(signatures.map((s) => s.id)).toEqual(['s2'])
  })
})
