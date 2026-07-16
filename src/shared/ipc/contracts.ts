import type { EditCommand } from '../domain/commands'

/** Documento aperto dal main e trasferito al renderer. */
export interface OpenedDocument {
  docId: string
  fileName: string
  filePath: string
  /** Identità del documento base tra le sorgenti del docId. */
  sourceId: string
  pageCount: number
  /** Byte del PDF, trasferiti una sola volta all'apertura. */
  data: ArrayBuffer
}

/** Sorgente aggiuntiva importata in un documento esistente (merge). */
export interface ImportedSource {
  sourceId: string
  fileName: string
  pageCount: number
  data: ArrayBuffer
}

/** Immagine aperta dal main: metadati + anteprima raster già browser-friendly. */
export interface OpenedImage {
  docId: string
  fileName: string
  filePath: string
  /** Formato sorgente riconosciuto da libvips (es. 'tiff', 'heif', 'avif'). */
  format: string
  /** Dimensioni reali dell'immagine sorgente (già normalizzate per l'orientamento EXIF). */
  width: number
  height: number
  /** Dimensione del file su disco, in byte. */
  byteSize: number
  /**
   * Anteprima ridimensionata al viewport (shrink-on-load): un raster in un
   * formato che il browser sa mostrare. Evita di trasferire i byte enormi
   * dell'originale (es. BigTIFF gigapixel) al renderer.
   */
  preview: {
    data: ArrayBuffer
    mime: string
    width: number
    height: number
  }
}

/** File di testo/Markdown aperto: contenuto già letto dal main. */
export interface OpenedMarkdown {
  docId: string
  fileName: string
  filePath: string
  content: string
}

/** Esito di un'apertura mista: PDF, immagini e testi classificati per estensione dal main. */
export interface OpenedFiles {
  documents: OpenedDocument[]
  images: OpenedImage[]
  texts: OpenedMarkdown[]
}

/** Formato di export immagine (output supportati dalla build di libvips). */
export type ImageFormat = 'original' | 'jpeg' | 'png' | 'webp' | 'avif' | 'tiff' | 'gif'

/** Opzioni del popup di salvataggio immagine (formato + compressione + resize). */
export interface ImageExportOptions {
  format: ImageFormat
  /** Qualità 1–100 per i formati con perdita. */
  quality: number
  /** Modalità senza perdita (webp/png/avif). */
  lossless: boolean
  /** Compressione per il TIFF. */
  tiffCompression: 'none' | 'lzw' | 'deflate' | 'jpeg'
  /** Ridimensiona il lato lungo a questi px ("fit inside"); null = dimensioni originali. */
  resizeLongestPx: number | null
}

/** Rettangolo di ritaglio in pixel dell'immagine reale (già orientata come a schermo). */
export interface CropRect {
  left: number
  top: number
  width: number
  height: number
}

/** Immagine di firma scelta dall'utente: PNG (per la visualizzazione) + dimensioni naturali. */
export interface PickedSignature {
  imageId: string
  data: ArrayBuffer
  width: number
  height: number
}

/** Voce dei file recenti mostrata nella home. */
export interface RecentFile {
  path: string
  name: string
  kind: 'pdf' | 'image' | 'markdown'
}

export type SaveResult =
  | { ok: true; filePath: string; warning?: string }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'error'; message: string }

/** Esito di un export batch di immagini verso una cartella. */
export type BatchExportResult =
  | { ok: true; dir: string; count: number }
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'error'; message: string }

/** Avanzamento dell'export batch, spinto dal main durante l'elaborazione. */
export interface ExportProgress {
  done: number
  total: number
}

/** Metadati di sistema di un file su disco (per il pannello proprietà). */
export interface FileStat {
  /** Dimensione in byte. */
  size: number
  /** Data di creazione (ms epoch), null se non disponibile. */
  createdMs: number | null
  /** Data di ultima modifica (ms epoch). */
  modifiedMs: number | null
}

/** Scelta dell'utente al prompt di chiusura di una tab con modifiche non salvate. */
export type DiscardChoice = 'save' | 'discard' | 'cancel'

/**
 * Mappa canale → tipi request/response. Unica fonte di verità del confine
 * IPC: main (handle) e preload (invoke) sono entrambi vincolati a questa
 * mappa, quindi qualunque drift è un errore di compilazione.
 */
export interface IpcContracts {
  'files:open': {
    request: undefined
    // Dialogo unico per PDF e immagini (multi-selezione); il main classifica.
    response: OpenedFiles // { documents: [], images: [] } = dialogo annullato
  }
  'files:openPaths': {
    request: { filePaths: string[] }
    // Apertura per path (drag&drop / "Apri con…"): il main classifica per estensione.
    response: OpenedFiles
  }
  'document:import': {
    request: { docId: string }
    response: ImportedSource | null // null = dialogo annullato
  }
  'document:save': {
    // Sovrascrive il filePath già noto del documento, con guardia sulla mtime
    // (se il file è cambiato fuori dall'app, il main chiede conferma).
    request: { docId: string; commands: EditCommand[] }
    response: SaveResult
  }
  'document:saveAs': {
    request: { docId: string; commands: EditCommand[]; suggestedName: string }
    response: SaveResult
  }
  'document:exportPdfA': {
    // Salva un export PDF/A-2b (XMP + OutputIntent sRGB + font incorporato).
    request: { docId: string; commands: EditCommand[]; suggestedName: string }
    response: SaveResult
  }
  'signature:pick': {
    // Sceglie un'immagine di firma (PNG/SVG), la registra e ne ritorna il PNG.
    request: undefined
    response: PickedSignature | null // null = dialogo annullato
  }
  'markdown:save': {
    // Scrive il contenuto su un path già noto.
    request: { filePath: string; content: string }
    response: SaveResult
  }
  'markdown:saveAs': {
    // Dialogo di salvataggio .md, poi scrive il contenuto.
    request: { content: string; suggestedName: string }
    response: SaveResult
  }
  'markdown:exportPdf': {
    // Rende l'HTML dell'anteprima (già sanitizzato) in PDF via printToPDF.
    request: { html: string; suggestedName: string }
    response: SaveResult
  }
  'document:export': {
    request: {
      docId: string
      commands: EditCommand[]
      positions: number[]
      suggestedName: string
    }
    response: SaveResult
  }
  'image:export': {
    // Ri-encoda l'immagine originale (piena qualità) e la salva col dialogo nativo.
    request: { docId: string; options: ImageExportOptions }
    response: SaveResult
  }
  'image:exportBatch': {
    // Esporta più immagini in una cartella scelta, con lo stesso formato/opzioni.
    request: { docIds: string[]; options: ImageExportOptions }
    response: BatchExportResult
  }
  'image:crop': {
    // Ritaglia l'immagine (in-sessione, non distruttivo sul file originale).
    request: { docId: string; rect: CropRect }
    response: OpenedImage | null
  }
  'document:close': {
    request: { docId: string }
    response: void
  }
  'recents:list': {
    request: undefined
    response: RecentFile[]
  }
  'recents:clear': {
    request: undefined
    response: void
  }
  'file:stat': {
    // Metadati di sistema del file (dimensione, date) per il pannello proprietà.
    request: { filePath: string }
    response: FileStat | null // null = file inesistente/illeggibile
  }
  'ui:confirmDiscard': {
    // Prompt nativo a 3 vie prima di chiudere una tab con modifiche non salvate.
    request: { fileName: string }
    response: DiscardChoice
  }
}

export type IpcChannel = keyof IpcContracts
export type IpcRequest<C extends IpcChannel> = IpcContracts[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContracts[C]['response']
