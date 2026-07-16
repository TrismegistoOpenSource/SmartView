import { useDocumentStore } from '@/stores/documentStore'
import { openFilesAction } from '@/lib/actions'
import { formatBytes } from '@/lib/format'
import {
  IconFolderOpen,
  IconSave,
  IconSidebar,
  IconZoomActual,
  IconZoomFit,
  IconZoomIn,
  IconZoomOut
} from './Icons'

/** Toolbar contestuale per le tab immagine: apertura, salvataggio, zoom e metadati. */
export function ImageToolbar() {
  const fileName = useDocumentStore((s) => s.fileName)
  const preview = useDocumentStore((s) => s.imagePreview)
  const zoom = useDocumentStore((s) => s.zoom)
  const imageFit = useDocumentStore((s) => s.imageFit)
  const setZoom = useDocumentStore((s) => s.setZoom)
  const toggleSidebar = useDocumentStore((s) => s.toggleSidebar)
  const openImageExport = useDocumentStore((s) => s.openImageExport)
  const count = useDocumentStore((s) => s.imageItems.length)
  const index = useDocumentStore((s) => s.imageIndex)
  const stepImage = useDocumentStore((s) => s.stepImage)
  const cropMode = useDocumentStore((s) => s.imageCropMode)
  const setImageCropMode = useDocumentStore((s) => s.setImageCropMode)

  // Percentuale REALE mostrata: fit-to-window × zoom (100% = 1:1 con i pixel dell'immagine).
  const actualPct = Math.round(imageFit * zoom * 100)

  const info = preview
    ? `${preview.naturalWidth} × ${preview.naturalHeight} · ${preview.format.toUpperCase()} · ${formatBytes(preview.byteSize)}`
    : ''

  return (
    <header className="toolbar">
      <div className="toolbar-group toolbar-left">
        <button className="tbtn" title="Mostra/nascondi info" onClick={toggleSidebar}>
          <IconSidebar />
        </button>
        <span className="tsep" />
        <button className="tbtn" title="Apri file…" onClick={() => void openFilesAction()}>
          <IconFolderOpen />
        </button>
        <button
          className="tbtn"
          title="Salva immagine come… (formato e compressione)"
          onClick={openImageExport}
        >
          <IconSave />
        </button>
        <button
          className={`tbtn tbtn-txt ${cropMode ? 'tbtn-active' : ''}`}
          title="Ritaglia immagine"
          onClick={() => setImageCropMode(!cropMode)}
        >
          ⌗
        </button>
        {count > 1 && (
          <>
            <span className="tsep" />
            <button className="tbtn tbtn-txt" title="Immagine precedente (↑)" onClick={() => stepImage(-1)}>
              ‹
            </button>
            <span className="gallery-counter">
              {index + 1} / {count}
            </span>
            <button className="tbtn tbtn-txt" title="Immagine successiva (↓)" onClick={() => stepImage(1)}>
              ›
            </button>
          </>
        )}
      </div>

      <div className="toolbar-title">
        <span className="title-name">{fileName}</span>
        {info && <span className="title-status">{info}</span>}
      </div>

      <div className="toolbar-group toolbar-right">
        <button
          className="tbtn"
          title="Adatta alla finestra (visualizzazione iniziale)"
          onClick={() => setZoom(1)}
        >
          <IconZoomFit />
        </button>
        <button
          className="tbtn"
          title="Zoom 100% (dimensione reale)"
          disabled={imageFit <= 0}
          onClick={() => setZoom(1 / imageFit)}
        >
          <IconZoomActual />
        </button>
        <span className="tsep" />
        <button className="tbtn" title="Riduci zoom" onClick={() => setZoom(zoom - 0.25)}>
          <IconZoomOut />
        </button>
        <span className="zoom-label">{actualPct}%</span>
        <button className="tbtn" title="Aumenta zoom" onClick={() => setZoom(zoom + 0.25)}>
          <IconZoomIn />
        </button>
      </div>
    </header>
  )
}
