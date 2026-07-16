import type { EditCommand } from '../domain/commands'
import type {
  BatchExportResult,
  CropRect,
  DiscardChoice,
  ExportProgress,
  FileStat,
  ImageExportOptions,
  ImportedSource,
  OpenedDocument,
  OpenedFiles,
  OpenedImage,
  PickedSignature,
  RecentFile,
  SaveResult
} from './contracts'

/**
 * API esposta dal preload su `window.smartpdf`.
 * È l'UNICA superficie che il renderer vede del mondo Node/Electron.
 */
export interface SmartPdfApi {
  /** Dialogo di apertura unico (PDF + immagini, multi-selezione); il main classifica. */
  openFiles(): Promise<OpenedFiles>
  /** Apre i file indicati per path (drag&drop), classificati per estensione. */
  openFilesByPath(filePaths: string[]): Promise<OpenedFiles>
  /** Percorso reale di un File trascinato (Electron `webUtils.getPathForFile`). */
  pathForFile(file: File): string
  /** Documenti aperti dall'esterno ("Apri con…" del sistema): push dal main. */
  onDocumentOpened(handler: (doc: OpenedDocument) => void): () => void
  /** Immagini aperte dall'esterno ("Apri con…" del sistema): push dal main, già raggruppate in una galleria. */
  onImageOpened(handler: (images: OpenedImage[]) => void): () => void
  /** Sceglie un altro PDF e ne registra i byte come nuova sorgente del docId. */
  importDocument(docId: string): Promise<ImportedSource | null>
  /** Salva sovrascrivendo il filePath noto del documento (guardia mtime nel main). */
  saveDocument(args: { docId: string; commands: EditCommand[] }): Promise<SaveResult>
  saveDocumentAs(args: {
    docId: string
    commands: EditCommand[]
    suggestedName: string
  }): Promise<SaveResult>
  /** Esporta il documento come PDF/A-2b (archiviazione a norma). */
  exportPdfA(args: {
    docId: string
    commands: EditCommand[]
    suggestedName: string
  }): Promise<SaveResult>
  /** Sceglie un'immagine di firma (PNG/SVG) e ne registra i byte per l'inserimento. */
  pickSignature(): Promise<PickedSignature | null>
  /** Salva il Markdown su un path noto. */
  saveMarkdown(args: { filePath: string; content: string }): Promise<SaveResult>
  /** Salva il Markdown con nome (dialogo .md). */
  saveMarkdownAs(args: { content: string; suggestedName: string }): Promise<SaveResult>
  /** Esporta l'anteprima Markdown (HTML sanitizzato) come PDF via printToPDF. */
  exportMarkdownPdf(args: { html: string; suggestedName: string }): Promise<SaveResult>
  /** Esporta solo le posizioni indicate dell'arrangiamento (split/estrazione). */
  exportPages(args: {
    docId: string
    commands: EditCommand[]
    positions: number[]
    suggestedName: string
  }): Promise<SaveResult>
  /** Ri-encoda e salva l'immagine attiva col formato/compressione scelti nel popup. */
  exportImage(args: { docId: string; options: ImageExportOptions }): Promise<SaveResult>
  /** Esporta un batch di immagini verso una cartella (stesse opzioni). */
  exportImageBatch(args: {
    docIds: string[]
    options: ImageExportOptions
  }): Promise<BatchExportResult>
  /** Ritaglia l'immagine (non distruttivo sul file originale); ritorna la nuova anteprima. */
  cropImage(args: { docId: string; rect: CropRect }): Promise<OpenedImage | null>
  /** Avanzamento dell'export batch (sottoscrivi mentre l'operazione è in corso). */
  onExportProgress(handler: (p: ExportProgress) => void): () => void
  closeDocument(docId: string): Promise<void>
  /** Metadati di sistema del file (dimensione, date) per il pannello proprietà. */
  statFile(filePath: string): Promise<FileStat | null>
  /** Prompt nativo a 3 vie (Salva / Non salvare / Annulla) prima di chiudere una tab dirty. */
  confirmDiscard(fileName: string): Promise<DiscardChoice>
  /** Notifica al main se esistono tab con modifiche non salvate (guardia alla chiusura app). */
  setDirty(dirty: boolean): void
  /** File aperti di recente (per la home). */
  listRecents(): Promise<RecentFile[]>
  clearRecents(): Promise<void>
  /** 'darwin' | 'win32' | 'linux' — per adattamenti UI (traffic lights, ecc.) */
  platform: string
}
