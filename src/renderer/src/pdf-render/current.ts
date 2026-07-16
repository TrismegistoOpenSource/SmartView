/**
 * Registro dei PDFDocumentProxy correnti (uno per sorgente), tenuto FUORI
 * dallo store Zustand: sono oggetti non serializzabili con lifecycle proprio.
 * Dalla Milestone 2 un documento può avere più sorgenti (merge), quindi si
 * risolve il proxy per `sourceId`.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'

const proxies = new Map<string, PDFDocumentProxy>()

export function setPdf(sourceId: string, doc: PDFDocumentProxy): void {
  const previous = proxies.get(sourceId)
  if (previous && previous !== doc) void previous.destroy()
  proxies.set(sourceId, doc)
}

export function getPdf(sourceId: string): PDFDocumentProxy | null {
  return proxies.get(sourceId) ?? null
}

/** Distrugge e dimentica i proxy delle sorgenti indicate (chiusura di una tab). */
export function destroyPdfs(sourceIds: string[]): void {
  for (const id of sourceIds) {
    const doc = proxies.get(id)
    if (doc) {
      void doc.destroy()
      proxies.delete(id)
    }
  }
}

/** Distrugge e dimentica tutti i proxy. */
export function clearPdfs(): void {
  for (const doc of proxies.values()) void doc.destroy()
  proxies.clear()
}
