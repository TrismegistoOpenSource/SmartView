/**
 * Command-log delle operazioni di edit (modello multi-sorgente).
 *
 * Il renderer accumula comandi (mai i byte modificati); il main li applica
 * con pdf-lib solo al salvataggio. I reducer puri di questo file sono
 * condivisi da entrambi i processi.
 *
 * Due dimensioni indipendenti nell'arrangiamento finale:
 *  - le PAGINE (ordine, rotazione, eliminazione, merge multi-sorgente);
 *  - le ANNOTAZIONI di testo "PDF-native" ancorate a una pagina.
 *
 * Gli indici posizionali (`from`, `to`, `pageIndex`, `at`) si riferiscono
 * all'arrangiamento corrente al momento in cui il comando è emesso. Le
 * annotazioni sono invece ancorate alla CHIAVE stabile della pagina, così
 * restano attaccate alla pagina giusta anche dopo riordino o merge.
 */

/** Dimensione predefinita del testo inserito (punti PDF). */
export const DEFAULT_TEXT_SIZE = 14

/** Documento sorgente: identità stabile + numero di pagine. */
export interface SourceRef {
  sourceId: string
  pageCount: number
}

/** Una pagina nell'arrangiamento corrente. */
export interface PageRef {
  /** Chiave stabile e unica (`sourceId#sourceIndex`): React key + id dnd. */
  key: string
  /** Documento sorgente di provenienza. */
  sourceId: string
  /** Indice della pagina nel documento sorgente. */
  sourceIndex: number
  /** Rotazione aggiuntiva rispetto all'originale: 0 | 90 | 180 | 270. */
  rotation: number
}

/**
 * Annotazione di testo inserita dall'utente. Le coordinate (x, y) sono
 * l'angolo in alto a sinistra del testo nello spazio-pagina PDF NON ruotato
 * (origine in basso a sinistra, unità in punti). Ancorare le annotazioni
 * allo spazio PDF le rende robuste a zoom e rotazione della vista.
 */
export interface TextBox {
  id: string
  /** Chiave della pagina (`sourceId#sourceIndex`) a cui è ancorata. */
  pageKey: string
  x: number
  y: number
  text: string
  fontSize: number
  /** Rotazione oraria in gradi attorno all'angolo in alto a sinistra (default 0). */
  rotation?: number
}

/**
 * Firma inserita come layer: un'immagine (PNG, già rasterizzata dal main)
 * ancorata a una pagina. (x, y) è l'angolo in alto a sinistra nello spazio-pagina
 * PDF NON ruotato (origine in basso a sinistra); width/height in punti. Resta un
 * oggetto discreto nel command-log: riposizionabile, ridimensionabile, eliminabile.
 */
export interface Signature {
  id: string
  /** Chiave della pagina (`sourceId#sourceIndex`) a cui è ancorata. */
  pageKey: string
  /** Riferimento ai byte PNG dell'immagine (registrati nel main). */
  imageId: string
  x: number
  y: number
  width: number
  height: number
  /** Rotazione oraria in gradi attorno al centro (default 0). */
  rotation?: number
}

/** Valore di un campo modulo (AcroForm): testo/scelta = string, checkbox = boolean. */
export type FieldValue = string | boolean

export interface DocModel {
  pages: PageRef[]
  texts: TextBox[]
  signatures: Signature[]
  /** Valori dei campi AcroForm compilati, per nome campo. */
  formValues: Record<string, FieldValue>
}

export type EditCommand =
  | { type: 'move-page'; from: number; to: number }
  | { type: 'rotate-page'; pageIndex: number; degrees: 90 | -90 }
  | { type: 'delete-page'; pageIndex: number }
  | { type: 'insert-pages'; at: number; sourceId: string; sourceIndexes: number[] }
  | { type: 'add-text'; box: TextBox }
  | { type: 'edit-text'; id: string; text: string }
  | { type: 'move-text'; id: string; x: number; y: number }
  | { type: 'resize-text'; id: string; fontSize: number }
  | { type: 'rotate-text'; id: string; rotation: number }
  | { type: 'remove-text'; id: string }
  | { type: 'add-signature'; sig: Signature }
  | { type: 'move-signature'; id: string; x: number; y: number }
  | { type: 'resize-signature'; id: string; x: number; y: number; width: number; height: number }
  | { type: 'rotate-signature'; id: string; rotation: number }
  | { type: 'remove-signature'; id: string }
  | { type: 'set-field-value'; field: string; value: FieldValue }

function pageKey(sourceId: string, sourceIndex: number): string {
  return `${sourceId}#${sourceIndex}`
}

function makePage(sourceId: string, sourceIndex: number): PageRef {
  return { key: pageKey(sourceId, sourceIndex), sourceId, sourceIndex, rotation: 0 }
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

function assertNever(value: never): never {
  throw new Error(`Comando non gestito: ${JSON.stringify(value)}`)
}

/** Arrangiamento iniziale: tutte le pagine del documento base, in ordine. */
export function initialPages(base: SourceRef): PageRef[] {
  return Array.from({ length: base.pageCount }, (_, i) => makePage(base.sourceId, i))
}

/** Riduce i soli comandi strutturali → ordine/rotazione delle pagine. */
export function reduceCommands(
  base: SourceRef,
  commands: readonly EditCommand[]
): PageRef[] {
  const pages = initialPages(base)

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'move-page': {
        const [moved] = pages.splice(cmd.from, 1)
        if (moved) pages.splice(cmd.to, 0, moved)
        break
      }
      case 'rotate-page': {
        const page = pages[cmd.pageIndex]
        if (page) page.rotation = (((page.rotation + cmd.degrees) % 360) + 360) % 360
        break
      }
      case 'delete-page': {
        if (pages.length > 1) pages.splice(cmd.pageIndex, 1)
        break
      }
      case 'insert-pages': {
        const inserted = cmd.sourceIndexes.map((i) => makePage(cmd.sourceId, i))
        pages.splice(clamp(cmd.at, 0, pages.length), 0, ...inserted)
        break
      }
      case 'add-text':
      case 'edit-text':
      case 'move-text':
      case 'resize-text':
      case 'rotate-text':
      case 'remove-text':
      case 'add-signature':
      case 'move-signature':
      case 'resize-signature':
      case 'rotate-signature':
      case 'remove-signature':
      case 'set-field-value':
        break // non influiscono sull'arrangiamento delle pagine
      default:
        assertNever(cmd)
    }
  }

  return pages
}

/** Riduce i soli comandi di testo → annotazioni correnti (per id). */
export function reduceTexts(commands: readonly EditCommand[]): TextBox[] {
  const byId = new Map<string, TextBox>()

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'add-text':
        byId.set(cmd.box.id, cmd.box)
        break
      case 'edit-text': {
        const box = byId.get(cmd.id)
        if (box) byId.set(cmd.id, { ...box, text: cmd.text })
        break
      }
      case 'move-text': {
        const box = byId.get(cmd.id)
        if (box) byId.set(cmd.id, { ...box, x: cmd.x, y: cmd.y })
        break
      }
      case 'resize-text': {
        const box = byId.get(cmd.id)
        if (box) byId.set(cmd.id, { ...box, fontSize: cmd.fontSize })
        break
      }
      case 'rotate-text': {
        const box = byId.get(cmd.id)
        if (box) byId.set(cmd.id, { ...box, rotation: cmd.rotation })
        break
      }
      case 'remove-text':
        byId.delete(cmd.id)
        break
      default:
        break // comandi di pagina: ignorati qui
    }
  }

  return [...byId.values()]
}

/** Riduce i soli comandi di firma → firme correnti (per id). */
export function reduceSignatures(commands: readonly EditCommand[]): Signature[] {
  const byId = new Map<string, Signature>()

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'add-signature':
        byId.set(cmd.sig.id, cmd.sig)
        break
      case 'move-signature': {
        const sig = byId.get(cmd.id)
        if (sig) byId.set(cmd.id, { ...sig, x: cmd.x, y: cmd.y })
        break
      }
      case 'resize-signature': {
        const sig = byId.get(cmd.id)
        if (sig) byId.set(cmd.id, { ...sig, x: cmd.x, y: cmd.y, width: cmd.width, height: cmd.height })
        break
      }
      case 'rotate-signature': {
        const sig = byId.get(cmd.id)
        if (sig) byId.set(cmd.id, { ...sig, rotation: cmd.rotation })
        break
      }
      case 'remove-signature':
        byId.delete(cmd.id)
        break
      default:
        break // comandi di pagina/testo: ignorati qui
    }
  }

  return [...byId.values()]
}

/** Riduce i comandi di compilazione modulo → valori correnti, per nome campo. */
export function reduceFormValues(commands: readonly EditCommand[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = {}
  for (const cmd of commands) {
    if (cmd.type === 'set-field-value') values[cmd.field] = cmd.value
  }
  return values
}

/**
 * Modello completo: pagine + annotazioni di testo + firme + valori modulo. Le
 * annotazioni ancorate a pagine non più presenti (eliminate) vengono scartate.
 */
export function reduceDocument(
  base: SourceRef,
  commands: readonly EditCommand[]
): DocModel {
  const pages = reduceCommands(base, commands)
  const liveKeys = new Set(pages.map((p) => p.key))
  const texts = reduceTexts(commands).filter((t) => liveKeys.has(t.pageKey))
  const signatures = reduceSignatures(commands).filter((s) => liveKeys.has(s.pageKey))
  const formValues = reduceFormValues(commands)
  return { pages, texts, signatures, formValues }
}
