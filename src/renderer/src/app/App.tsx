import { useEffect, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { Toolbar } from '@/components/Toolbar'
import { TabBar } from '@/components/TabBar'
import { Sidebar } from '@/components/Sidebar'
import { Viewer } from '@/components/Viewer'
import { EmptyState } from '@/components/EmptyState'
import { ImageExportDialog } from '@/components/ImageExportDialog'
import { PropertiesDialog } from '@/components/PropertiesDialog'
import { openDocuments, openImages, openFilePathsAction, hasUnsavedTabs } from '@/lib/actions'
import { useShortcuts } from './useShortcuts'
import { useDocumentZoom } from './useDocumentZoom'

/** Estensioni gestite (PDF + immagini). Il main classifica poi ogni path per tipo. */
const SUPPORTED_DROP = /\.(pdf|jpe?g|png|webp|gif|tiff?|avif|heic|heif|svg|bmp|jxl|md|markdown|txt)$/i

/** Path dei file trascinati con estensione supportata. */
function pathsFromDrop(files: FileList): string[] {
  const paths: string[] = []
  for (const file of Array.from(files)) {
    const path = window.smartpdf.pathForFile(file)
    if (path && SUPPORTED_DROP.test(path)) paths.push(path)
  }
  return paths
}

export default function App() {
  const docId = useDocumentStore((s) => s.docId)
  const sidebarOpen = useDocumentStore((s) => s.sidebarOpen)
  const tool = useDocumentStore((s) => s.tool)
  const kind = useDocumentStore((s) => s.kind)
  const imageExportOpen = useDocumentStore((s) => s.imageExportOpen)
  const propertiesOpen = useDocumentStore((s) => s.propertiesOpen)
  const isMac = window.smartpdf?.platform === 'darwin'
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  useShortcuts()
  useDocumentZoom()

  // Notifica al main lo stato "dirty" complessivo, per la guardia alla chiusura app.
  useEffect(() => {
    const push = (): void => window.smartpdf.setDirty(hasUnsavedTabs(useDocumentStore.getState()))
    push()
    return useDocumentStore.subscribe(push)
  }, [])

  // File aperti dall'esterno ("Apri con…" del sistema): il main li spinge qui.
  // Le immagini arrivano già raggruppate → una sola tab galleria.
  useEffect(() => {
    const offDoc = window.smartpdf.onDocumentOpened((doc) => void openDocuments([doc]))
    const offImg = window.smartpdf.onImageOpened((images) => openImages(images))
    return () => {
      offDoc()
      offImg()
    }
  }, [])

  // Azzera SEMPRE l'overlay di drop a fine trascinamento, anche quando il drop
  // avviene su un figlio che ferma la propagazione (es. la sidebar galleria).
  // La fase di cattura scavalca lo stopPropagation dell'handler bersaglio.
  useEffect(() => {
    const clear = (): void => {
      dragDepth.current = 0
      setDragging(false)
    }
    window.addEventListener('drop', clear, true)
    window.addEventListener('dragend', clear, true)
    return () => {
      window.removeEventListener('drop', clear, true)
      window.removeEventListener('dragend', clear, true)
    }
  }, [])

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const paths = pathsFromDrop(e.dataTransfer.files)
    void openFilePathsAction(paths)
  }

  return (
    <div
      className={`app ${isMac ? 'app-mac' : ''} ${tool === 'text' ? 'tool-text' : ''}`}
      onDragEnter={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <Toolbar />
      <TabBar />
      {docId ? (
        <div className="content">
          {sidebarOpen && <Sidebar />}
          <Viewer />
        </div>
      ) : (
        <EmptyState />
      )}
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">Rilascia PDF o immagini per aprirli in nuove tab</div>
        </div>
      )}
      {imageExportOpen && kind === 'image' && <ImageExportDialog />}
      {propertiesOpen && docId && <PropertiesDialog />}
    </div>
  )
}
