import { useEffect, useRef } from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { PageRef } from '@shared/domain/commands'
import type { PDFPageProxy } from 'pdfjs-dist'
import { getPdf } from '@/pdf-render/current'
import { isRenderCancelled } from '@/pdf-render/engine'
import { useDocumentStore } from '@/stores/documentStore'

const THUMB_WIDTH = 132

function Thumbnail({ page }: { page: PageRef }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const pdf = getPdf(page.sourceId)
    const canvas = canvasRef.current
    if (!pdf || !canvas) return

    let cancelled = false
    let task: ReturnType<PDFPageProxy['render']> | undefined

    pdf
      .getPage(page.sourceIndex + 1)
      .then((p) => {
        if (cancelled) return
        const rotation = (p.rotate + page.rotation) % 360
        const base = p.getViewport({ scale: 1, rotation })
        const viewport = p.getViewport({ scale: THUMB_WIDTH / base.width, rotation })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        task = p.render({
          canvasContext: ctx,
          viewport,
          ...(dpr !== 1 ? { transform: [dpr, 0, 0, dpr, 0, 0] } : {})
        })
        return task.promise
      })
      .catch((error: unknown) => {
        if (!isRenderCancelled(error)) console.error('Errore rendering miniatura:', error)
      })

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [page.key, page.rotation])

  return <canvas ref={canvasRef} className="thumb-canvas" />
}

function SortableThumb({
  page,
  index,
  selected,
  onSelect
}: {
  page: PageRef
  index: number
  selected: boolean
  onSelect: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.key })

  return (
    <div
      ref={setNodeRef}
      className={`thumb ${selected ? 'thumb-selected' : ''} ${isDragging ? 'thumb-dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined
      }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <div className="thumb-frame">
        <Thumbnail page={page} />
      </div>
      <span className="thumb-number">{index + 1}</span>
    </div>
  )
}

export function PdfSidebar() {
  const pages = useDocumentStore((s) => s.pages)
  const selected = useDocumentStore((s) => s.selected)
  const select = useDocumentStore((s) => s.select)
  const pushCommand = useDocumentStore((s) => s.pushCommand)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const ids = pages.map((p) => p.key)

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id as string)
    const to = ids.indexOf(over.id as string)
    if (from < 0 || to < 0) return
    pushCommand({ type: 'move-page', from, to })
    select(to)
  }

  const onSelect = (index: number, key: string): void => {
    select(index)
    document
      .getElementById(`pageview-${key}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="sidebar">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {pages.map((page, index) => (
            <SortableThumb
              key={page.key}
              page={page}
              index={index}
              selected={index === selected}
              onSelect={() => onSelect(index, page.key)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </aside>
  )
}
