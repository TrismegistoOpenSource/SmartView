import { create } from 'zustand'
import { reduceDocument, DEFAULT_TEXT_SIZE } from '@shared/domain/commands'
import type {
  EditCommand,
  FieldValue,
  PageRef,
  Signature,
  SourceRef,
  TextBox
} from '@shared/domain/commands'

export interface PageSize {
  width: number
  height: number
}

/** Strumento attivo: selezione/manipolazione pagine, oppure inserimento testo. */
export type Tool = 'select' | 'text'

/** Editing transitorio di un'annotazione — FUORI dal command-log finché non si conferma. */
export interface EditingText {
  id: string
  pageKey: string
  x: number
  y: number
  fontSize: number
  text: string
  isNew: boolean
}

/**
 * Stato completo di una tab PDF aperta. Dalla Milestone 4 ogni tab PDF ne
 * possiede uno: i campi top-level dello store sono la copia di lavoro della
 * tab ATTIVA; le tab inattive sono snapshot congelati in `tabs`.
 */
export interface PdfTab {
  kind: 'pdf'
  docId: string
  fileName: string
  filePath: string | null
  base: SourceRef | null
  sizes: Record<string, PageSize>
  commands: EditCommand[]
  redoStack: EditCommand[]
  pages: PageRef[]
  texts: TextBox[]
  signatures: Signature[]
  /** Valori dei campi AcroForm compilati, per nome campo. */
  formValues: Record<string, FieldValue>
  selected: number
  tool: Tool
  selectedTextId: string | null
  selectedSignatureId: string | null
  editing: EditingText | null
  zoom: number
  savedPath: string | null
}

/** Contenuto di una tab immagine: anteprima raster (object URL) + metadati della sorgente. */
export interface ImagePreview {
  /** Object URL del raster WebP di anteprima (revocare alla chiusura della tab). */
  url: string
  /** Dimensioni reali dell'immagine sorgente (già normalizzate per l'orientamento EXIF). */
  naturalWidth: number
  naturalHeight: number
  /** Dimensioni del raster di anteprima: la base del layout a zoom 1. */
  previewWidth: number
  previewHeight: number
  /** Formato sorgente riconosciuto (es. 'tiff', 'heif'). */
  format: string
  /** Dimensione del file su disco, in byte. */
  byteSize: number
}

/** Una singola immagine dentro una tab galleria: identità nel main + anteprima. */
export interface GalleryImage {
  /** docId nel main (mappa per export/forget: getImagePath). */
  imageId: string
  fileName: string
  filePath: string | null
  preview: ImagePreview
}

/**
 * Tab immagine come GALLERIA (v0.4): più immagini in un'unica tab, con indice
 * dell'immagine corrente. Aprendo più file insieme si crea UNA tab con tutte.
 * `docId` è l'identità della TAB (usata da activateTab/closeTab/TabBar); le
 * immagini hanno il proprio `imageId` per l'export nel main.
 */
export interface ImageTab {
  kind: 'image'
  docId: string
  /** Nome dell'immagine corrente (etichetta tab); derivato da images[index]. */
  fileName: string
  filePath: string | null
  images: GalleryImage[]
  index: number
  zoom: number
}

/** Modalità di visualizzazione dell'editor Markdown. */
export type MarkdownViewMode = 'editor' | 'split' | 'preview'

/** Tab Markdown con contenuto reale (M7): sorgente + modalità + dirty. */
export interface MarkdownTab {
  kind: 'markdown'
  docId: string
  fileName: string
  filePath: string | null
  source: string
  /** Sorgente al momento dell'ultimo salvataggio/apertura: base del "dirty". */
  savedSource: string
  viewMode: MarkdownViewMode
}

export type Tab = PdfTab | ImageTab | MarkdownTab

/**
 * Campi per-documento a livello top-level dello store (specchio della tab attiva).
 * Restano sempre PDF-shaped (unica tab con stato reale oggi); solo `kind` è tipizzato
 * sull'intera union, così i dispatcher polimorfici possono confrontarlo con 'image'/'markdown'.
 */
type ActiveFields = Omit<PdfTab, 'kind'> & {
  kind: Tab['kind']
  /** Immagini della galleria attiva (vuoto quando la tab attiva non è un'immagine). */
  imageItems: GalleryImage[]
  /** Indice dell'immagine corrente nella galleria attiva. */
  imageIndex: number
  /** Anteprima dell'immagine CORRENTE (derivata da imageItems[imageIndex]); null se non immagine. */
  imagePreview: ImagePreview | null
  /** Stato della tab Markdown attiva (default innocuo quando non è Markdown). */
  mdSource: string
  mdSavedSource: string
  mdViewMode: MarkdownViewMode
}

interface DocumentState extends ActiveFields {
  /** Ordine e metadati di tutte le tab aperte (l'entry attiva può essere "stale" nei campi pesanti). */
  tabs: Tab[]
  sidebarOpen: boolean
  /** Popup di salvataggio immagine aperto (UI globale, non per-tab). */
  imageExportOpen: boolean
  /** Il popup è in modalità batch (esporta più immagini in una cartella). */
  imageExportBatch: boolean
  /** docId delle immagini da esportare in batch (payload del popup batch). */
  imageBatchIds: string[]
  /** Scala "fit-to-window" dell'immagine attiva: zoom reale = imageFit × zoom. */
  imageFit: number
  /** Pannello proprietà file aperto (metadati della tab attiva). */
  propertiesOpen: boolean
  /** Modalità ritaglio attiva sull'immagine corrente. */
  imageCropMode: boolean

  addDocument(args: {
    docId: string
    fileName: string
    filePath: string | null
    base: SourceRef
    sizes: Record<string, PageSize>
  }): void
  /** Crea e attiva UNA tab galleria con tutte le immagini passate. */
  addImages(images: GalleryImage[]): void
  /** Aggiunge immagini alla galleria attiva (drop sulla sidebar/miniature). */
  addImagesToGallery(images: GalleryImage[]): void
  /** Cambia l'immagine corrente della galleria attiva (indice assoluto, clampato). */
  setImageIndex(index: number): void
  /** Naviga di ±1 nella galleria attiva (frecce). */
  stepImage(delta: number): void
  /** Sostituisce l'immagine corrente della galleria (dopo un ritaglio). */
  replaceCurrentImage(image: GalleryImage): void
  /** Crea e attiva una tab Markdown vuota (untitled). */
  addMarkdown(): void
  /** Apre una tab Markdown da un file già letto dal main. */
  openMarkdownFile(args: {
    docId: string
    fileName: string
    filePath: string | null
    content: string
  }): void
  setMarkdownSource(source: string): void
  setMarkdownViewMode(mode: MarkdownViewMode): void
  /** Dopo un salvataggio Markdown riuscito: adotta il path e azzera il dirty. */
  markSavedMarkdown(filePath: string): void
  activateTab(docId: string): void
  /** Rimuove la tab e restituisce i sourceId da distruggere (proxy pdf.js). */
  closeTab(docId: string): string[]
  closeDocument(): void
  registerSizes(sizes: Record<string, PageSize>): void
  pushCommand(cmd: EditCommand): void
  undo(): void
  redo(): void
  select(index: number): void
  setTool(tool: Tool): void
  toggleSidebar(): void
  openImageExport(): void
  openImageExportBatch(docIds: string[]): void
  closeImageExport(): void
  /** Apre/chiude il pannello proprietà file della tab attiva. */
  toggleProperties(): void
  closeProperties(): void
  /** Attiva/disattiva la modalità ritaglio immagine. */
  setImageCropMode(on: boolean): void
  setZoom(zoom: number): void
  /** Fattore "fit-to-window" corrente dell'immagine attiva (pubblicato da ImageViewer). */
  setImageFit(fit: number): void
  setSavedPath(path: string | null): void
  /** Dopo un salvataggio riuscito: adotta il path e azzera lo stato "dirty". */
  markSaved(filePath: string): void

  // Annotazioni di testo
  selectText(id: string | null): void
  beginText(pageKey: string, x: number, y: number): void
  beginEditText(box: TextBox): void
  setEditingText(text: string): void
  commitEditing(): void
  cancelEditing(): void
  moveText(id: string, x: number, y: number): void
  resizeText(id: string, fontSize: number): void
  rotateText(id: string, rotation: number): void
  removeText(id: string): void

  // Firme (layer immagine)
  selectSignature(id: string | null): void
  addSignature(sig: Signature): void
  moveSignature(id: string, x: number, y: number): void
  resizeSignature(id: string, x: number, y: number, width: number, height: number): void
  rotateSignature(id: string, rotation: number): void
  removeSignature(id: string): void

  // Campi modulo (AcroForm)
  setFieldValue(field: string, value: FieldValue): void
  /** Applica i valori CALCOLATI dalla sandbox pdf.js (solo quelli davvero cambiati). */
  applyComputedFields(updates: { field: string; value: string }[]): void
}

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`

export const DEFAULT_ZOOM = 1.25

/** Stato "nessuna tab attiva" per i campi top-level. */
const emptyActive = (): ActiveFields => ({
  kind: 'pdf',
  docId: '',
  fileName: '',
  filePath: null,
  base: null,
  sizes: {},
  commands: [],
  redoStack: [],
  pages: [],
  texts: [],
  signatures: [],
  formValues: {},
  selected: 0,
  tool: 'select',
  selectedTextId: null,
  selectedSignatureId: null,
  editing: null,
  zoom: DEFAULT_ZOOM,
  savedPath: null,
  imageItems: [],
  imageIndex: 0,
  imagePreview: null,
  mdSource: '',
  mdSavedSource: '',
  mdViewMode: 'editor'
})

/** Estrae dai campi top-level lo snapshot della tab attiva, secondo il suo kind. */
const captureActive = (s: DocumentState): Tab => {
  switch (s.kind) {
    case 'image':
      return {
        kind: 'image',
        docId: s.docId,
        fileName: s.fileName,
        filePath: s.filePath,
        images: s.imageItems,
        index: s.imageIndex,
        zoom: s.zoom
      }
    case 'markdown':
      return {
        kind: 'markdown',
        docId: s.docId,
        fileName: s.fileName,
        filePath: s.filePath,
        source: s.mdSource,
        savedSource: s.mdSavedSource,
        viewMode: s.mdViewMode
      }
    case 'pdf':
    default:
      return {
        kind: 'pdf',
        docId: s.docId,
        fileName: s.fileName,
        filePath: s.filePath,
        base: s.base,
        sizes: s.sizes,
        commands: s.commands,
        redoStack: s.redoStack,
        pages: s.pages,
        texts: s.texts,
        signatures: s.signatures,
        formValues: s.formValues,
        selected: s.selected,
        tool: s.tool,
        selectedTextId: s.selectedTextId,
        selectedSignatureId: s.selectedSignatureId,
        editing: s.editing,
        zoom: s.zoom,
        savedPath: s.savedPath
      }
  }
}

/** Mappa una tab nei campi top-level (copia di lavoro), azzerando quelli non pertinenti al kind. */
const activeFromTab = (tab: Tab): ActiveFields => {
  switch (tab.kind) {
    case 'pdf':
      return {
        ...tab,
        imageItems: [],
        imageIndex: 0,
        imagePreview: null,
        mdSource: '',
        mdSavedSource: '',
        mdViewMode: 'split'
      }
    case 'image': {
      const index = clamp(tab.index, 0, tab.images.length - 1)
      const current = tab.images[index]
      return {
        ...emptyActive(),
        kind: 'image',
        docId: tab.docId,
        fileName: current?.fileName ?? tab.fileName,
        filePath: current?.filePath ?? tab.filePath,
        zoom: tab.zoom,
        imageItems: tab.images,
        imageIndex: index,
        imagePreview: current?.preview ?? null
      }
    }
    case 'markdown':
      return {
        ...emptyActive(),
        kind: 'markdown',
        docId: tab.docId,
        fileName: tab.fileName,
        filePath: tab.filePath,
        mdSource: tab.source,
        mdSavedSource: tab.savedSource,
        mdViewMode: tab.viewMode
      }
    default:
      return assertNever(tab)
  }
}

/** Restituisce `tabs` con l'entry della tab attiva aggiornata all'ultimo stato. */
const syncActive = (s: DocumentState): Tab[] => {
  if (!s.docId) return s.tabs
  const snap = captureActive(s)
  return s.tabs.map((t) => (t.docId === s.docId ? snap : t))
}

function assertNever(value: never): never {
  throw new Error(`Tab kind non gestito: ${JSON.stringify(value)}`)
}

/** Tutti i sourceId referenziati da una tab (base + sorgenti dei merge). Solo le tab PDF ne hanno. */
const collectSourceIds = (tab: Tab): string[] => {
  switch (tab.kind) {
    case 'pdf': {
      const ids = new Set<string>()
      if (tab.base) ids.add(tab.base.sourceId)
      for (const c of [...tab.commands, ...tab.redoStack]) {
        if (c.type === 'insert-pages') ids.add(c.sourceId)
      }
      return [...ids]
    }
    case 'image':
    case 'markdown':
      return []
    default:
      return assertNever(tab)
  }
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  /** Deriva pagine + testi dal command-log e aggiorna lo stato in modo coerente. */
  const applyLog = (commands: EditCommand[], redoStack: EditCommand[]): void => {
    const { base, selected } = get()
    if (!base) return
    const { pages, texts, signatures, formValues } = reduceDocument(base, commands)
    set({
      commands,
      redoStack,
      pages,
      texts,
      signatures,
      formValues,
      selected: clamp(selected, 0, pages.length - 1),
      savedPath: null
    })
  }

  return {
    ...emptyActive(),
    tabs: [],
    sidebarOpen: true,
    imageExportOpen: false,
    imageExportBatch: false,
    imageBatchIds: [],
    imageFit: 1,
    propertiesOpen: false,
    imageCropMode: false,

    addDocument: ({ docId, fileName, filePath, base, sizes }) => {
      const s = get()
      const tabs = syncActive(s)
      const { pages, texts, signatures, formValues } = reduceDocument(base, [])
      const fresh: PdfTab = {
        kind: 'pdf',
        docId,
        fileName,
        filePath,
        base,
        sizes,
        commands: [],
        redoStack: [],
        pages,
        texts,
        signatures,
        formValues,
        selected: 0,
        tool: 'select',
        selectedTextId: null,
        selectedSignatureId: null,
        editing: null,
        zoom: DEFAULT_ZOOM,
        savedPath: null
      }
      set({ tabs: [...tabs, fresh], ...activeFromTab(fresh) })
    },

    addImages: (images) => {
      if (images.length === 0) return
      const s = get()
      const tabs = syncActive(s)
      const first = images[0]!
      // Le immagini partono a zoom 1 = "adatta alla finestra" (fit-to-window).
      const fresh: ImageTab = {
        kind: 'image',
        docId: first.imageId,
        fileName: first.fileName,
        filePath: first.filePath,
        images,
        index: 0,
        zoom: 1
      }
      set({ tabs: [...tabs, fresh], ...activeFromTab(fresh) })
    },

    addImagesToGallery: (images) => {
      if (images.length === 0) return
      const s = get()
      if (s.kind !== 'image') {
        get().addImages(images)
        return
      }
      // Appende alla galleria attiva e va alla prima delle nuove.
      const merged = [...s.imageItems, ...images]
      const newIndex = s.imageItems.length
      set({ tabs: syncActive({ ...s, imageItems: merged }), imageItems: merged })
      get().setImageIndex(newIndex)
    },

    setImageIndex: (index) => {
      const s = get()
      if (s.kind !== 'image') return
      const i = clamp(index, 0, s.imageItems.length - 1)
      const current = s.imageItems[i]
      if (!current) return
      set({
        imageIndex: i,
        imagePreview: current.preview,
        fileName: current.fileName,
        filePath: current.filePath,
        zoom: 1 // ogni immagine riparte da fit-to-window
      })
    },

    stepImage: (delta) => {
      const s = get()
      if (s.kind !== 'image' || s.imageItems.length === 0) return
      const n = s.imageItems.length
      // Navigazione circolare tra le immagini della galleria.
      get().setImageIndex((s.imageIndex + delta + n) % n)
    },

    replaceCurrentImage: (image) => {
      const s = get()
      if (s.kind !== 'image') return
      const items = s.imageItems.map((it, i) => (i === s.imageIndex ? image : it))
      set({
        imageItems: items,
        imagePreview: image.preview,
        fileName: image.fileName,
        filePath: image.filePath,
        imageCropMode: false,
        zoom: 1
      })
    },

    addMarkdown: () => {
      const s = get()
      const tabs = syncActive(s)
      const fresh: MarkdownTab = {
        kind: 'markdown',
        docId: newId(),
        fileName: 'Senza nome.md',
        filePath: null,
        source: '',
        savedSource: '',
        viewMode: 'editor'
      }
      set({ tabs: [...tabs, fresh], ...activeFromTab(fresh) })
    },

    openMarkdownFile: ({ docId, fileName, filePath, content }) => {
      const s = get()
      const tabs = syncActive(s)
      const fresh: MarkdownTab = {
        kind: 'markdown',
        docId,
        fileName,
        filePath,
        source: content,
        savedSource: content,
        viewMode: 'editor'
      }
      set({ tabs: [...tabs, fresh], ...activeFromTab(fresh) })
    },

    setMarkdownSource: (source) => set({ mdSource: source }),
    setMarkdownViewMode: (mode) => set({ mdViewMode: mode }),
    markSavedMarkdown: (filePath) =>
      set((st) => ({
        filePath,
        fileName: filePath.split(/[\\/]/).pop() || filePath,
        mdSavedSource: st.mdSource
      })),

    activateTab: (docId) => {
      const s = get()
      if (docId === s.docId) return
      const tabs = syncActive(s)
      const target = tabs.find((t) => t.docId === docId)
      if (!target) return
      set({ tabs, ...activeFromTab(target) })
    },

    closeTab: (docId) => {
      const s = get()
      const closing: Tab | undefined =
        docId === s.docId ? captureActive(s) : s.tabs.find((t) => t.docId === docId)
      const removed = closing ? collectSourceIds(closing) : []

      if (docId !== s.docId) {
        set({ tabs: s.tabs.filter((t) => t.docId !== docId) })
        return removed
      }

      // Chiusura della tab attiva: attiva una vicina (successiva, poi precedente).
      const idx = s.tabs.findIndex((t) => t.docId === docId)
      const remaining = s.tabs.filter((t) => t.docId !== docId)
      const next = remaining[idx] ?? remaining[idx - 1] ?? null
      if (next) set({ tabs: remaining, ...activeFromTab(next) })
      else set({ tabs: [], ...emptyActive() })
      return removed
    },

    closeDocument: () => set({ tabs: [], ...emptyActive() }),

    registerSizes: (sizes) => set((s) => ({ sizes: { ...s.sizes, ...sizes } })),

    pushCommand: (cmd) => {
      const { base, commands } = get()
      if (!base) return
      applyLog([...commands, cmd], [])
    },

    undo: () => {
      const { commands, redoStack } = get()
      if (commands.length === 0) return
      const undone = commands[commands.length - 1]!
      applyLog(commands.slice(0, -1), [...redoStack, undone])
    },

    redo: () => {
      const { commands, redoStack } = get()
      if (redoStack.length === 0) return
      const redone = redoStack[redoStack.length - 1]!
      applyLog([...commands, redone], redoStack.slice(0, -1))
    },

    select: (index) => set({ selected: index }),
    setTool: (tool) => set({ tool, selectedTextId: null, selectedSignatureId: null, editing: null }),
    toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    openImageExport: () => set({ imageExportOpen: true, imageExportBatch: false, imageBatchIds: [] }),
    openImageExportBatch: (docIds) =>
      set({ imageExportOpen: true, imageExportBatch: true, imageBatchIds: docIds }),
    closeImageExport: () => set({ imageExportOpen: false }),
    toggleProperties: () => set((s) => ({ propertiesOpen: !s.propertiesOpen })),
    closeProperties: () => set({ propertiesOpen: false }),
    setImageCropMode: (on) => set({ imageCropMode: on }),
    setZoom: (zoom) => set({ zoom: clamp(zoom, 0.25, 8) }),
    setImageFit: (fit) => set({ imageFit: fit > 0 ? fit : 1 }),
    setSavedPath: (path) => set({ savedPath: path }),
    markSaved: (filePath) =>
      set({ filePath, fileName: filePath.split(/[\\/]/).pop() || filePath, savedPath: filePath }),

    selectText: (id) => set({ selectedTextId: id }),

    beginText: (pageKey, x, y) =>
      set({
        editing: { id: newId(), pageKey, x, y, fontSize: DEFAULT_TEXT_SIZE, text: '', isNew: true },
        selectedTextId: null
      }),

    beginEditText: (box) =>
      set({
        editing: {
          id: box.id,
          pageKey: box.pageKey,
          x: box.x,
          y: box.y,
          fontSize: box.fontSize,
          text: box.text,
          isNew: false
        },
        selectedTextId: box.id
      }),

    setEditingText: (text) =>
      set((s) => (s.editing ? { editing: { ...s.editing, text } } : {})),

    commitEditing: () => {
      const { editing } = get()
      if (!editing) return
      const text = editing.text.trim()
      if (text.length === 0) {
        // Nuovo box vuoto: si annulla. Box esistente svuotato: si elimina.
        if (!editing.isNew) get().removeText(editing.id)
        set({ editing: null })
        return
      }
      if (editing.isNew) {
        get().pushCommand({
          type: 'add-text',
          box: {
            id: editing.id,
            pageKey: editing.pageKey,
            x: editing.x,
            y: editing.y,
            text,
            fontSize: editing.fontSize
          }
        })
      } else {
        get().pushCommand({ type: 'edit-text', id: editing.id, text })
      }
      set({ editing: null, selectedTextId: editing.id })
    },

    cancelEditing: () => set({ editing: null }),

    moveText: (id, x, y) => get().pushCommand({ type: 'move-text', id, x, y }),

    resizeText: (id, fontSize) => get().pushCommand({ type: 'resize-text', id, fontSize }),

    rotateText: (id, rotation) => get().pushCommand({ type: 'rotate-text', id, rotation }),

    removeText: (id) => {
      get().pushCommand({ type: 'remove-text', id })
      if (get().selectedTextId === id) set({ selectedTextId: null })
    },

    selectSignature: (id) => set({ selectedSignatureId: id }),

    addSignature: (sig) => {
      get().pushCommand({ type: 'add-signature', sig })
      set({ selectedSignatureId: sig.id })
    },

    moveSignature: (id, x, y) => get().pushCommand({ type: 'move-signature', id, x, y }),

    resizeSignature: (id, x, y, width, height) =>
      get().pushCommand({ type: 'resize-signature', id, x, y, width, height }),

    rotateSignature: (id, rotation) =>
      get().pushCommand({ type: 'rotate-signature', id, rotation }),

    removeSignature: (id) => {
      get().pushCommand({ type: 'remove-signature', id })
      if (get().selectedSignatureId === id) set({ selectedSignatureId: null })
    },

    setFieldValue: (field, value) => get().pushCommand({ type: 'set-field-value', field, value }),

    applyComputedFields: (updates) => {
      const { formValues } = get()
      // Applica solo i campi il cui valore calcolato è DIVERSO da quello attuale,
      // per non intasare il command-log a ogni battitura.
      const changed = updates.filter((u) => String(formValues[u.field] ?? '') !== u.value)
      for (const u of changed) get().pushCommand({ type: 'set-field-value', field: u.field, value: u.value })
    }
  }
})
