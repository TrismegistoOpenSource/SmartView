import { contextBridge, ipcRenderer, webUtils, webFrame } from 'electron'
import type { SmartPdfApi } from '@shared/ipc/api'
import type { ExportProgress, OpenedDocument, OpenedImage } from '@shared/ipc/contracts'

// Disabilita il pinch-zoom "visuale" della chrome Chromium: il gesto pinch del
// trackpad deve zoomare il DOCUMENTO, non l'intera GUI. Bloccando lo zoom
// visuale qui, il pinch arriva al renderer come `wheel` con `ctrlKey` e viene
// mappato a mano sullo zoom del documento (vedi useDocumentZoom).
webFrame.setVisualZoomLevelLimits(1, 1)

// Unico ponte tra renderer e main: mai esporre ipcRenderer grezzo.
const api: SmartPdfApi = {
  openFiles: () => ipcRenderer.invoke('files:open'),
  openFilesByPath: (filePaths) => ipcRenderer.invoke('files:openPaths', { filePaths }),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onDocumentOpened: (handler) => {
    const listener = (_e: unknown, doc: OpenedDocument): void => handler(doc)
    ipcRenderer.on('document:opened', listener)
    return () => ipcRenderer.removeListener('document:opened', listener)
  },
  onImageOpened: (handler) => {
    const listener = (_e: unknown, images: OpenedImage[]): void => handler(images)
    ipcRenderer.on('image:opened', listener)
    return () => ipcRenderer.removeListener('image:opened', listener)
  },
  importDocument: (docId) => ipcRenderer.invoke('document:import', { docId }),
  saveDocument: (args) => ipcRenderer.invoke('document:save', args),
  saveDocumentAs: (args) => ipcRenderer.invoke('document:saveAs', args),
  exportPdfA: (args) => ipcRenderer.invoke('document:exportPdfA', args),
  pickSignature: () => ipcRenderer.invoke('signature:pick'),
  saveMarkdown: (args) => ipcRenderer.invoke('markdown:save', args),
  saveMarkdownAs: (args) => ipcRenderer.invoke('markdown:saveAs', args),
  exportMarkdownPdf: (args) => ipcRenderer.invoke('markdown:exportPdf', args),
  exportPages: (args) => ipcRenderer.invoke('document:export', args),
  exportImage: (args) => ipcRenderer.invoke('image:export', args),
  exportImageBatch: (args) => ipcRenderer.invoke('image:exportBatch', args),
  cropImage: (args) => ipcRenderer.invoke('image:crop', args),
  onExportProgress: (handler) => {
    const listener = (_e: unknown, p: ExportProgress): void => handler(p)
    ipcRenderer.on('image:exportProgress', listener)
    return () => ipcRenderer.removeListener('image:exportProgress', listener)
  },
  closeDocument: (docId) => ipcRenderer.invoke('document:close', { docId }),
  statFile: (filePath) => ipcRenderer.invoke('file:stat', { filePath }),
  confirmDiscard: (fileName) => ipcRenderer.invoke('ui:confirmDiscard', { fileName }),
  setDirty: (dirty) => ipcRenderer.send('ui:setDirty', dirty),
  listRecents: () => ipcRenderer.invoke('recents:list'),
  clearRecents: () => ipcRenderer.invoke('recents:clear'),
  platform: process.platform
}

contextBridge.exposeInMainWorld('smartpdf', api)
