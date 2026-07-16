import { useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import {
  openFilesAction,
  saveDocumentAction,
  mergeDocumentAction,
  extractSelectionAction,
  pickAndPlaceSignatureAction,
  exportPdfAAction
} from '@/lib/actions'
import {
  IconFolderOpen,
  IconSave,
  IconUndo,
  IconRedo,
  IconRotate,
  IconTrash,
  IconText,
  IconSignature,
  IconArchive,
  IconMerge,
  IconExtract,
  IconSidebar,
  IconZoomIn,
  IconZoomOut
} from './Icons'

export function PdfToolbar() {
  const docId = useDocumentStore((s) => s.docId)
  const fileName = useDocumentStore((s) => s.fileName)
  const commands = useDocumentStore((s) => s.commands)
  const redoStack = useDocumentStore((s) => s.redoStack)
  const pages = useDocumentStore((s) => s.pages)
  const selected = useDocumentStore((s) => s.selected)
  const zoom = useDocumentStore((s) => s.zoom)
  const savedPath = useDocumentStore((s) => s.savedPath)
  const tool = useDocumentStore((s) => s.tool)
  const setTool = useDocumentStore((s) => s.setTool)
  const pushCommand = useDocumentStore((s) => s.pushCommand)
  const undo = useDocumentStore((s) => s.undo)
  const redo = useDocumentStore((s) => s.redo)
  const toggleSidebar = useDocumentStore((s) => s.toggleSidebar)
  const setZoom = useDocumentStore((s) => s.setZoom)

  const [status, setStatus] = useState<string | null>(null)

  const flash = (message: string): void => {
    setStatus(message)
    window.setTimeout(() => setStatus(null), 3500)
  }

  const onSave = async (): Promise<void> => {
    const result = await saveDocumentAction()
    if (!result) return
    if (result.ok) flash('Salvato ✓')
    else if (result.reason === 'error') flash(`Errore: ${result.message}`)
  }

  const onExtract = async (): Promise<void> => {
    const result = await extractSelectionAction()
    if (!result) return
    if (result.ok) flash('Pagina estratta ✓')
    else if (result.reason === 'error') flash(`Errore: ${result.message}`)
  }

  const onExportPdfA = async (): Promise<void> => {
    const result = await exportPdfAAction()
    if (!result) return
    if (result.ok) flash('Esportato PDF/A ✓')
    else if (result.reason === 'error') flash(`Errore: ${result.message}`)
  }

  const dirty = commands.length > 0 && !savedPath

  return (
    <header className="toolbar">
      <div className="toolbar-group toolbar-left">
        <button
          className="tbtn"
          title="Mostra/nascondi miniature"
          disabled={!docId}
          onClick={toggleSidebar}
        >
          <IconSidebar />
        </button>
        <span className="tsep" />
        <button className="tbtn" title="Apri file…" onClick={() => void openFilesAction()}>
          <IconFolderOpen />
        </button>
        <button
          className="tbtn"
          title="Unisci un altro PDF dopo la pagina corrente…"
          disabled={!docId}
          onClick={() => void mergeDocumentAction()}
        >
          <IconMerge />
        </button>
        <button
          className="tbtn"
          title="Estrai la pagina corrente come nuovo PDF…"
          disabled={!docId}
          onClick={() => void onExtract()}
        >
          <IconExtract />
        </button>
        <button
          className="tbtn"
          title="Salva (⌘S) · ⇧⌘S per salvare con nome"
          disabled={!docId}
          onClick={() => void onSave()}
        >
          <IconSave />
        </button>
        <span className="tsep" />
        <button
          className="tbtn"
          title="Annulla"
          disabled={commands.length === 0}
          onClick={undo}
        >
          <IconUndo />
        </button>
        <button
          className="tbtn"
          title="Ripeti"
          disabled={redoStack.length === 0}
          onClick={redo}
        >
          <IconRedo />
        </button>
        <button
          className="tbtn"
          title="Ruota pagina di 90°"
          disabled={!docId}
          onClick={() => pushCommand({ type: 'rotate-page', pageIndex: selected, degrees: 90 })}
        >
          <IconRotate />
        </button>
        <button
          className="tbtn"
          title="Elimina pagina"
          disabled={!docId || pages.length <= 1}
          onClick={() => pushCommand({ type: 'delete-page', pageIndex: selected })}
        >
          <IconTrash />
        </button>
        <span className="tsep" />
        <button
          className={`tbtn ${tool === 'text' ? 'tbtn-active' : ''}`}
          title="Strumento testo: clicca sulla pagina per inserire testo"
          disabled={!docId}
          onClick={() => setTool(tool === 'text' ? 'select' : 'text')}
        >
          <IconText />
        </button>
        <button
          className="tbtn"
          title="Inserisci firma (PNG/SVG) sulla pagina corrente…"
          disabled={!docId}
          onClick={() => void pickAndPlaceSignatureAction()}
        >
          <IconSignature />
        </button>
        <button
          className="tbtn"
          title="Esporta come PDF/A (archiviazione a norma)…"
          disabled={!docId}
          onClick={() => void onExportPdfA()}
        >
          <IconArchive />
        </button>
      </div>

      <div className="toolbar-title">
        {docId ? (
          <>
            <span className="title-name">{fileName}</span>
            {dirty && <span className="title-dirty" title="Modifiche non salvate" />}
          </>
        ) : (
          <span className="title-app">SmartView</span>
        )}
        {status && <span className="title-status">{status}</span>}
      </div>

      <div className="toolbar-group toolbar-right">
        <button
          className="tbtn"
          title="Riduci zoom"
          disabled={!docId}
          onClick={() => setZoom(zoom - 0.25)}
        >
          <IconZoomOut />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button
          className="tbtn"
          title="Aumenta zoom"
          disabled={!docId}
          onClick={() => setZoom(zoom + 0.25)}
        >
          <IconZoomIn />
        </button>
      </div>
    </header>
  )
}
