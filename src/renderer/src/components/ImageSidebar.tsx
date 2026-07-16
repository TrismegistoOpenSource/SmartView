import { useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDocumentStore } from '@/stores/documentStore'
import { dropIntoGalleryAction } from '@/lib/actions'

const ROW_H = 60

/** Estensioni immagine accettate dal drop sulla galleria. */
const IMG_DROP = /\.(jpe?g|png|webp|gif|tiff?|avif|heic|heif|svg|bmp|jxl|pdf|md|markdown|txt)$/i

function pathsFromDrop(files: FileList): string[] {
  const paths: string[] = []
  for (const file of Array.from(files)) {
    const path = window.smartpdf.pathForFile(file)
    if (path && IMG_DROP.test(path)) paths.push(path)
  }
  return paths
}

/**
 * Sidebar della GALLERIA immagini: lista virtualizzata delle immagini della tab
 * attiva. Click = mostra quell'immagine; Cmd/Ctrl/Shift = multi-selezione per
 * "Esporta selezione…". Il drop di file qui li AGGIUNGE alla galleria corrente
 * (invece di aprire nuove tab come il drop sulla finestra).
 */
export function ImageSidebar() {
  const items = useDocumentStore((s) => s.imageItems)
  const index = useDocumentStore((s) => s.imageIndex)
  const setImageIndex = useDocumentStore((s) => s.setImageIndex)
  const openImageExportBatch = useDocumentStore((s) => s.openImageExportBatch)

  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [dragOver, setDragOver] = useState(false)
  const anchor = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const virt = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 8
  })

  const onCardClick = (i: number, e: React.MouseEvent): void => {
    const id = items[i]!.imageId
    if (e.metaKey || e.ctrlKey) {
      setSelection((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    } else if (e.shiftKey) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)]
      setSelection(new Set(items.slice(a, b + 1).map((t) => t.imageId)))
    } else {
      anchor.current = i
      setSelection(new Set([id]))
      setImageIndex(i)
    }
  }

  const exportSelection = (): void => {
    const ids = selection.size > 0 ? [...selection] : items[index] ? [items[index]!.imageId] : []
    if (ids.length > 0) openImageExportBatch(ids)
  }

  return (
    <aside
      className={`sidebar image-sidebar ${dragOver ? 'image-sidebar-drop' : ''}`}
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) setDragOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        void dropIntoGalleryAction(pathsFromDrop(e.dataTransfer.files))
      }}
    >
      <div className="image-grid-head">
        <span>{items.length} immagini</span>
        <button className="image-grid-export" onClick={exportSelection} disabled={items.length === 0}>
          Esporta selezione…
        </button>
      </div>

      <div className="image-grid-scroll" ref={scrollRef}>
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const item = items[vi.index]!
            const isCurrent = vi.index === index
            const isSelected = selection.has(item.imageId)
            return (
              <button
                key={item.imageId}
                className={`image-row ${isCurrent ? 'image-row-active' : ''} ${
                  isSelected ? 'image-row-selected' : ''
                }`}
                style={{ position: 'absolute', top: vi.start, height: ROW_H }}
                title={item.fileName}
                onClick={(e) => onCardClick(vi.index, e)}
              >
                <span className="image-row-thumb">
                  <img src={item.preview.url} alt="" />
                </span>
                <span className="image-row-name">{item.fileName}</span>
              </button>
            )
          })}
        </div>
      </div>
      {dragOver && <div className="image-sidebar-drophint">Aggiungi alla galleria</div>}
    </aside>
  )
}
