/**
 * Calcolo automatico dei moduli AcroForm che contengono JavaScript (es. la
 * scheda D&D: modificatori, tiri salvezza…). Usa la VERA sandbox di pdf.js
 * (`pdf.sandbox` + `PDFScriptingManager`) come Acrobat, NON un motore fatto a
 * mano: il JS del PDF gira isolato in QuickJS/wasm, senza toccare il sistema.
 *
 * Integrazione compute-only: non usiamo l'AnnotationLayer di pdf.js (abbiamo un
 * overlay custom). Diamo al manager uno shim di "viewer"; quando l'utente
 * modifica un campo dispacciamo l'evento Keystroke-commit alla sandbox, che
 * ricalcola e restituisce i valori via evento `updatefromsandbox`: li riflettiamo
 * nello store. TUTTO è avvolto in try/catch — se lo scripting non parte, la
 * compilazione manuale continua a funzionare identica (nessuna regressione).
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { EventBus, PDFScriptingManager } from 'pdfjs-dist/web/pdf_viewer.mjs'
import sandboxSrc from 'pdfjs-dist/build/pdf.sandbox.min.mjs?url'

/** pdf.js RenderingStates.FINISHED (evita di importare l'intero viewer per una costante). */
const RENDER_FINISHED = 3

/** Aggiornamento di un campo calcolato: nome campo → nuovo valore. */
export type ComputedUpdate = { field: string; value: string }

interface Controller {
  commitText(elementId: string, value: string): void
  commitCheckbox(elementId: string, checked: boolean): void
  commitChoice(elementId: string, value: string): void
  destroy(): void
}

/** Un controller per sorgente PDF (documento). Promise per deduplicare l'init concorrente. */
const controllers = new Map<string, Promise<Controller | null>>()

/**
 * Prepara (una sola volta per sourceId) lo scripting del documento. `onComputed`
 * riceve i campi ricalcolati dalla sandbox (init + a ogni modifica). Ritorna
 * silenziosamente se il documento non ha campi/JS o se qualcosa fallisce.
 */
export function ensureFormScripting(
  sourceId: string,
  pdf: PDFDocumentProxy,
  onComputed: (updates: ComputedUpdate[]) => void
): void {
  if (controllers.has(sourceId)) return
  controllers.set(sourceId, buildController(pdf, onComputed))
}

/** Conferma alla sandbox un campo di TESTO (→ ricalcolo). */
export async function commitFormField(sourceId: string, elementId: string, value: string): Promise<void> {
  const ctrl = await controllers.get(sourceId)
  ctrl?.commitText(elementId, value)
}

/** Conferma alla sandbox una CHECKBOX (es. competenza in abilità/tiri salvezza). */
export async function commitFormCheckbox(sourceId: string, elementId: string, checked: boolean): Promise<void> {
  const ctrl = await controllers.get(sourceId)
  ctrl?.commitCheckbox(elementId, checked)
}

/** Conferma alla sandbox un menu a tendina (choice). */
export async function commitFormChoice(sourceId: string, elementId: string, value: string): Promise<void> {
  const ctrl = await controllers.get(sourceId)
  ctrl?.commitChoice(elementId, value)
}

/** Distrugge lo scripting di un documento chiuso. */
export function destroyFormScripting(sourceId: string): void {
  const pending = controllers.get(sourceId)
  controllers.delete(sourceId)
  void pending?.then((c) => c?.destroy())
}

async function buildController(
  pdf: PDFDocumentProxy,
  onComputed: (updates: ComputedUpdate[]) => void
): Promise<Controller | null> {
  try {
    const [objects, actions] = await Promise.all([pdf.getFieldObjects(), pdf.getJSActions()])
    // Nessun campo con oggetti/azioni JS → niente da calcolare: non attiviamo lo scripting.
    if (!objects && !actions) return null

    // Mappa elementId → nome campo, per tradurre i risultati della sandbox.
    const idToName = new Map<string, string>()
    if (objects) {
      for (const [name, list] of Object.entries(objects)) {
        for (const obj of list as { id: string }[]) idToName.set(obj.id, name)
      }
    }

    const eventBus = new EventBus()

    // Shim minimale di "viewer": solo ciò che PDFScriptingManager tocca.
    const viewerShim = {
      isInPresentationMode: false,
      isChangingPresentationMode: false,
      currentPageNumber: 1,
      pagesCount: pdf.numPages,
      // FINISHED così il PageOpen iniziale parte; pdfPage null = nessuna azione di pagina.
      getPageView: () => ({ renderingState: RENDER_FINISHED, pdfPage: null }),
      nextPage: () => {},
      previousPage: () => {},
      increaseScale: () => {},
      decreaseScale: () => {}
    }

    // Risultati della sandbox: riflette i valori calcolati nello store.
    eventBus._on('updatefromsandbox', (event: { detail?: { id?: string; value?: unknown } }) => {
      const detail = event?.detail
      if (!detail?.id || detail.value === undefined || detail.value === null) return
      const field = idToName.get(detail.id)
      if (!field) return
      onComputed([{ field, value: String(detail.value) }])
    })

    const manager = new PDFScriptingManager({ eventBus, sandboxBundleSrc: sandboxSrc })
    manager.setViewer(viewerShim)
    await manager.setDocument(pdf)

    const storage = pdf.annotationStorage
    // Sandbox non pronta/errore: il valore manuale è già nello store → si ignora.
    const safe = (fn: () => void): void => {
      try {
        fn()
      } catch {
        /* no-op */
      }
    }
    const dispatch = (detail: Record<string, unknown>): void =>
      eventBus.dispatch('dispatcheventinsandbox', { source: {}, detail })

    return {
      // Campo di testo: Keystroke con willCommit (come pdf.js su blur/Enter).
      commitText(elementId, value) {
        safe(() => {
          storage.setValue(elementId, { value })
          dispatch({
            id: elementId,
            name: 'Keystroke',
            value,
            willCommit: true,
            commitKey: 1,
            selStart: value.length,
            selEnd: value.length
          })
        })
      },
      // Checkbox: valore booleano nello storage + evento Action (come pdf.js).
      commitCheckbox(elementId, checked) {
        safe(() => {
          storage.setValue(elementId, { value: checked })
          dispatch({ id: elementId, name: 'Action', value: checked })
        })
      },
      // Menu a tendina: valore stringa + Action + Validate.
      commitChoice(elementId, value) {
        safe(() => {
          storage.setValue(elementId, { value })
          dispatch({ id: elementId, name: 'Action', value })
          dispatch({ id: elementId, name: 'Validate', value })
        })
      },
      destroy() {
        void manager.setDocument(null)
      }
    }
  } catch (error) {
    console.warn('Scripting moduli non attivato:', error)
    return null
  }
}
