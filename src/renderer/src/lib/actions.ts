/**
 * Azioni applicative condivise tra Toolbar, EmptyState e scorciatoie.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { loadPdf } from '@/pdf-render/engine'
import { setPdf, destroyPdfs } from '@/pdf-render/current'
import { destroyFormScripting } from '@/pdf-render/formScripting'
import { setSignatureImage } from '@/pdf-render/signatures'
import { useDocumentStore } from '@/stores/documentStore'
import type { GalleryImage, PageSize } from '@/stores/documentStore'
import type {
  BatchExportResult,
  ImageExportOptions,
  OpenedDocument,
  OpenedFiles,
  OpenedImage,
  OpenedMarkdown,
  SaveResult
} from '@shared/ipc/contracts'

/** Dimensioni base di ogni pagina, indicizzate per chiave `sourceId#index`. */
async function sizesFor(
  pdf: PDFDocumentProxy,
  sourceId: string
): Promise<Record<string, PageSize>> {
  const entries = await Promise.all(
    Array.from({ length: pdf.numPages }, (_, i) =>
      pdf.getPage(i + 1).then((page) => {
        const { width, height } = page.getViewport({ scale: 1 })
        return [`${sourceId}#${i}`, { width, height }] as const
      })
    )
  )
  return Object.fromEntries(entries)
}

/** Carica un documento (già registrato nel main) come NUOVA tab, attivandola. */
async function openInNewTab(opened: OpenedDocument): Promise<void> {
  const pdf = await loadPdf(opened.data)
  const sizes = await sizesFor(pdf, opened.sourceId)

  setPdf(opened.sourceId, pdf)
  useDocumentStore.getState().addDocument({
    docId: opened.docId,
    fileName: opened.fileName,
    filePath: opened.filePath,
    base: { sourceId: opened.sourceId, pageCount: pdf.numPages },
    sizes
  })
}

/** Apre in sequenza una lista di documenti: ognuno in una nuova tab. */
export async function openDocuments(list: OpenedDocument[]): Promise<void> {
  for (const opened of list) await openInNewTab(opened)
}

/** Converte un OpenedImage in GalleryImage, costruendo l'object URL dell'anteprima. */
function toGalleryImage(img: OpenedImage): GalleryImage {
  const url = URL.createObjectURL(new Blob([img.preview.data], { type: img.preview.mime }))
  return {
    imageId: img.docId,
    fileName: img.fileName,
    filePath: img.filePath,
    preview: {
      url,
      naturalWidth: img.width,
      naturalHeight: img.height,
      previewWidth: img.preview.width,
      previewHeight: img.preview.height,
      format: img.format,
      byteSize: img.byteSize
    }
  }
}

/** Apre più immagini come UNA sola tab galleria. */
export function openImages(list: OpenedImage[]): void {
  if (list.length === 0) return
  useDocumentStore.getState().addImages(list.map(toGalleryImage))
}

/** Aggiunge immagini (drop sulla sidebar) alla galleria attiva, o ne crea una nuova. */
export function addImagesToGalleryAction(list: OpenedImage[]): void {
  if (list.length === 0) return
  useDocumentStore.getState().addImagesToGallery(list.map(toGalleryImage))
}

/**
 * Drop di file sulla sidebar galleria: le immagini si aggiungono alla galleria
 * attiva; eventuali PDF/testi trascinati aprono comunque nuove tab.
 */
export async function dropIntoGalleryAction(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  const result = await window.smartpdf.openFilesByPath(filePaths)
  addImagesToGalleryAction(result.images)
  await openDocuments(result.documents)
  openMarkdownDocs(result.texts)
}

/** Apre una tab Markdown per ciascun file di testo aperto. */
export function openMarkdownDocs(list: OpenedMarkdown[]): void {
  const store = useDocumentStore.getState()
  for (const md of list) {
    store.openMarkdownFile({
      docId: md.docId,
      fileName: md.fileName,
      filePath: md.filePath,
      content: md.content
    })
  }
}

/** Apre il risultato misto (PDF + immagini + testi). */
async function openResult(result: OpenedFiles): Promise<void> {
  await openDocuments(result.documents)
  openImages(result.images)
  openMarkdownDocs(result.texts)
}

/** Dialogo di apertura unico (PDF + immagini). */
export async function openFilesAction(): Promise<void> {
  await openResult(await window.smartpdf.openFiles())
}

/** Apre per path (drag&drop): un file → una tab, PDF o immagine. */
export async function openFilePathsAction(filePaths: string[]): Promise<void> {
  if (filePaths.length === 0) return
  await openResult(await window.smartpdf.openFilesByPath(filePaths))
}

/** true se la tab (attiva o snapshot) ha modifiche non salvate. */
function isDocDirty(state: ReturnType<typeof useDocumentStore.getState>, docId: string): boolean {
  if (docId === state.docId) {
    if (state.kind === 'pdf') return state.commands.length > 0 && !state.savedPath
    if (state.kind === 'markdown') return state.mdSource !== state.mdSavedSource
    return false
  }
  const tab = state.tabs.find((t) => t.docId === docId)
  if (!tab) return false
  if (tab.kind === 'pdf') return tab.commands.length > 0 && !tab.savedPath
  if (tab.kind === 'markdown') return tab.source !== tab.savedSource
  return false
}

/** true se ESISTE almeno una tab (attiva o inattiva) con modifiche non salvate. */
export function hasUnsavedTabs(state: ReturnType<typeof useDocumentStore.getState>): boolean {
  const activeDirty = state.docId ? isDocDirty(state, state.docId) : false
  const othersDirty = state.tabs.some(
    (t) =>
      t.docId !== state.docId &&
      (t.kind === 'pdf'
        ? t.commands.length > 0 && !t.savedPath
        : t.kind === 'markdown'
          ? t.source !== t.savedSource
          : false)
  )
  return activeDirty || othersDirty
}

/** Salva la tab ATTIVA secondo il suo kind. Ritorna true se salvata, false se annullata/fallita. */
async function saveActiveTab(): Promise<boolean> {
  const kind = useDocumentStore.getState().kind
  const result =
    kind === 'markdown' ? await saveMarkdownAction() : kind === 'pdf' ? await saveDocumentAction() : null
  return result?.ok ?? true // le tab immagine non hanno salvataggio: nulla da bloccare
}

/** Esegue la chiusura vera e propria della tab (dopo eventuale conferma). */
function performCloseTab(docId: string): void {
  const state = useDocumentStore.getState()
  const tab = state.tabs.find((t) => t.docId === docId)
  const closing =
    docId === state.docId && state.kind === 'image'
      ? state.imageItems
      : tab?.kind === 'image'
        ? tab.images
        : undefined
  // Galleria: revoca tutti gli object URL e libera ogni immagine nel main.
  if (closing) {
    for (const item of closing) {
      URL.revokeObjectURL(item.preview.url)
      void window.smartpdf.closeDocument(item.imageId)
    }
  }
  const removed = useDocumentStore.getState().closeTab(docId)
  for (const sourceId of removed) destroyFormScripting(sourceId)
  destroyPdfs(removed)
  void window.smartpdf.closeDocument(docId)
}

/**
 * Chiude una tab. Se ha modifiche non salvate chiede conferma (Salva / Non
 * salvare / Annulla) prima di procedere; su "Salva" salva e solo se riesce
 * chiude. Libera i proxy pdf.js / l'object URL dell'anteprima e i byte nel main.
 */
export async function closeTabAction(docId: string): Promise<void> {
  const state = useDocumentStore.getState()
  if (isDocDirty(state, docId)) {
    const fileName =
      docId === state.docId
        ? state.fileName
        : (state.tabs.find((t) => t.docId === docId)?.fileName ?? 'documento')
    const choice = await window.smartpdf.confirmDiscard(fileName)
    if (choice === 'cancel') return
    if (choice === 'save') {
      // Il salvataggio opera sulla tab attiva: attivala se sta chiudendo un'altra.
      if (useDocumentStore.getState().docId !== docId) useDocumentStore.getState().activateTab(docId)
      if (!(await saveActiveTab())) return // salvataggio annullato/fallito → non chiudere
    }
  }
  performCloseTab(docId)
}

export async function mergeDocumentAction(): Promise<void> {
  const { docId, kind, selected } = useDocumentStore.getState()
  if (!docId || kind !== 'pdf') return

  const imported = await window.smartpdf.importDocument(docId)
  if (!imported) return

  const pdf = await loadPdf(imported.data)
  const sizes = await sizesFor(pdf, imported.sourceId)

  setPdf(imported.sourceId, pdf)
  const store = useDocumentStore.getState()
  store.registerSizes(sizes)
  store.pushCommand({
    type: 'insert-pages',
    at: selected + 1,
    sourceId: imported.sourceId,
    sourceIndexes: Array.from({ length: pdf.numPages }, (_, i) => i)
  })
}

/** Salva con nome: dialogo nativo, poi il documento adotta il nuovo path. */
export async function saveAsDocumentAction(): Promise<SaveResult | null> {
  const { docId, kind, commands, fileName } = useDocumentStore.getState()
  if (!docId || kind !== 'pdf') return null

  const result = await window.smartpdf.saveDocumentAs({
    docId,
    commands,
    suggestedName: fileName || 'documento.pdf'
  })
  if (result.ok) useDocumentStore.getState().markSaved(result.filePath)
  return result
}

/** Salva: sovrascrive il path noto (guardia mtime nel main); senza path → Salva con nome. */
export async function saveDocumentAction(): Promise<SaveResult | null> {
  const { docId, kind, commands, filePath } = useDocumentStore.getState()
  if (!docId || kind !== 'pdf') return null
  if (!filePath) return saveAsDocumentAction()

  const result = await window.smartpdf.saveDocument({ docId, commands })
  if (result.ok) useDocumentStore.getState().markSaved(result.filePath)
  return result
}

/** Salva l'immagine CORRENTE della galleria col formato/compressione scelti nel popup. */
export async function exportImageAction(options: ImageExportOptions): Promise<SaveResult | null> {
  const { kind, imageItems, imageIndex } = useDocumentStore.getState()
  if (kind !== 'image') return null
  const current = imageItems[imageIndex]
  if (!current) return null
  return window.smartpdf.exportImage({ docId: current.imageId, options })
}

/**
 * Ritaglia l'immagine corrente al rettangolo dato (in pixel dell'immagine reale).
 * Il main produce una nuova anteprima; qui sostituiamo l'immagine corrente della
 * galleria revocandone il vecchio object URL.
 */
export async function cropImageAction(rect: {
  left: number
  top: number
  width: number
  height: number
}): Promise<void> {
  const { kind, imageItems, imageIndex } = useDocumentStore.getState()
  if (kind !== 'image') return
  const current = imageItems[imageIndex]
  if (!current) return
  const opened = await window.smartpdf.cropImage({ docId: current.imageId, rect })
  if (!opened) return
  URL.revokeObjectURL(current.preview.url)
  useDocumentStore.getState().replaceCurrentImage(toGalleryImage(opened))
}

/** Esporta in batch le immagini selezionate (payload in imageBatchIds). */
export async function exportImageBatchAction(
  options: ImageExportOptions
): Promise<BatchExportResult | null> {
  const { imageBatchIds } = useDocumentStore.getState()
  if (imageBatchIds.length === 0) return null
  return window.smartpdf.exportImageBatch({ docIds: imageBatchIds, options })
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`

/** Sceglie un'immagine di firma e la piazza al centro della pagina selezionata. */
export async function pickAndPlaceSignatureAction(): Promise<void> {
  const state = useDocumentStore.getState()
  if (!state.docId || state.kind !== 'pdf') return

  const picked = await window.smartpdf.pickSignature()
  if (!picked) return

  const url = URL.createObjectURL(new Blob([picked.data], { type: 'image/png' }))
  setSignatureImage(picked.imageId, { url, width: picked.width, height: picked.height })

  const { pages, selected, sizes } = useDocumentStore.getState()
  const page = pages[selected]
  if (!page) return
  const size = sizes[page.key]
  const pageW = size?.width ?? 612
  const pageH = size?.height ?? 792
  const aspect = picked.width > 0 ? picked.height / picked.width : 0.4
  const width = Math.min(200, pageW * 0.4)
  const height = width * aspect
  // (x, y) = angolo in alto a sinistra nello spazio PDF (origine in basso a sinistra).
  useDocumentStore.getState().addSignature({
    id: newId(),
    pageKey: page.key,
    imageId: picked.imageId,
    x: (pageW - width) / 2,
    y: (pageH + height) / 2,
    width,
    height
  })
}

const MD_EXT = /\.(md|markdown|txt)$/i

/** Salva con nome un file Markdown. */
export async function saveMarkdownAsAction(): Promise<SaveResult | null> {
  const { docId, kind, fileName, mdSource } = useDocumentStore.getState()
  if (!docId || kind !== 'markdown') return null
  const base = fileName.replace(MD_EXT, '') || 'documento'
  const result = await window.smartpdf.saveMarkdownAs({
    content: mdSource,
    suggestedName: `${base}.md`
  })
  if (result.ok) useDocumentStore.getState().markSavedMarkdown(result.filePath)
  return result
}

/** Salva il Markdown sul path noto; senza path → Salva con nome. */
export async function saveMarkdownAction(): Promise<SaveResult | null> {
  const { docId, kind, filePath, mdSource } = useDocumentStore.getState()
  if (!docId || kind !== 'markdown') return null
  if (!filePath) return saveMarkdownAsAction()
  const result = await window.smartpdf.saveMarkdown({ filePath, content: mdSource })
  if (result.ok) useDocumentStore.getState().markSavedMarkdown(result.filePath)
  return result
}

/** Esporta l'anteprima Markdown (HTML già sanitizzato) come PDF. */
export async function exportMarkdownPdfAction(html: string): Promise<SaveResult | null> {
  const { docId, kind, fileName } = useDocumentStore.getState()
  if (!docId || kind !== 'markdown') return null
  const base = fileName.replace(MD_EXT, '') || 'documento'
  return window.smartpdf.exportMarkdownPdf({ html, suggestedName: `${base}.pdf` })
}

/** Esporta il documento come PDF/A-2b. */
export async function exportPdfAAction(): Promise<SaveResult | null> {
  const { docId, kind, commands, fileName } = useDocumentStore.getState()
  if (!docId || kind !== 'pdf') return null
  const base = fileName.replace(/\.pdf$/i, '')
  return window.smartpdf.exportPdfA({
    docId,
    commands,
    suggestedName: `${base} — PDF-A.pdf`
  })
}

export async function extractSelectionAction(): Promise<SaveResult | null> {
  const { docId, kind, commands, fileName, selected } = useDocumentStore.getState()
  if (!docId || kind !== 'pdf') return null

  const base = fileName.replace(/\.pdf$/i, '')
  return window.smartpdf.exportPages({
    docId,
    commands,
    positions: [selected],
    suggestedName: `${base} — pagina ${selected + 1}.pdf`
  })
}
