/**
 * Wrapper pdf.js: caricamento documenti con worker dedicato.
 * pdf.js gira SOLO nel renderer (rendering read-only); ogni mutazione
 * del documento passa dal main via command-log.
 */
import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  // Copia: getDocument trasferisce (detach) il buffer al worker.
  const bytes = new Uint8Array(data.slice(0))
  return pdfjs.getDocument({ data: bytes }).promise
}

export function isRenderCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'RenderingCancelledException'
  )
}
