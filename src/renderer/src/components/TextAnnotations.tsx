import { useMemo, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { TextBox } from '@shared/domain/commands'
import { useDocumentStore } from '@/stores/documentStore'

type PageViewport = ReturnType<PDFPageProxy['getViewport']>

/** Layer sovrapposto a una pagina: annotazioni di testo + editor inline. */
export function TextAnnotations({ pageKey, vp }: { pageKey: string; vp: PageViewport }) {
  const texts = useDocumentStore((s) => s.texts)
  const editing = useDocumentStore((s) => s.editing)

  const pageTexts = useMemo(
    () => texts.filter((t) => t.pageKey === pageKey),
    [texts, pageKey]
  )
  const editingHere = editing && editing.pageKey === pageKey ? editing : null

  return (
    <div className="annot-layer">
      {pageTexts.map((box) =>
        editingHere?.id === box.id ? null : <TextBoxView key={box.id} box={box} vp={vp} />
      )}
      {editingHere && <TextEditor vp={vp} />}
    </div>
  )
}

function TextBoxView({ box, vp }: { box: TextBox; vp: PageViewport }) {
  const selected = useDocumentStore((s) => s.selectedTextId === box.id)
  const selectText = useDocumentStore((s) => s.selectText)
  const beginEditText = useDocumentStore((s) => s.beginEditText)
  const moveText = useDocumentStore((s) => s.moveText)
  const resizeText = useDocumentStore((s) => s.resizeText)
  const rotateText = useDocumentStore((s) => s.rotateText)
  const removeText = useDocumentStore((s) => s.removeText)

  const boxRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const [fontPreview, setFontPreview] = useState<number | null>(null)
  const [rotation, setRotation] = useState<number | null>(null)
  const origin = useRef<{ startX: number; startY: number; baseVx: number; baseVy: number } | null>(
    null
  )
  const resizeOrigin = useRef<{ startY: number; baseFontPx: number } | null>(null)
  const rotateOrigin = useRef<{ cx: number; cy: number; startAngle: number; base: number } | null>(
    null
  )

  const [vx, vy] = vp.convertToViewportPoint(box.x, box.y)
  const fontPx = box.fontSize * vp.scale
  const baseRot = box.rotation ?? 0

  // ── Spostamento (funziona con qualsiasi strumento attivo) ──
  const onPointerDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    selectText(box.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = { startX: e.clientX, startY: e.clientY, baseVx: vx, baseVy: vy }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!origin.current) return
    setDrag({ dx: e.clientX - origin.current.startX, dy: e.clientY - origin.current.startY })
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    const o = origin.current
    origin.current = null
    if (!o) return
    const movedX = e.clientX - o.startX
    const movedY = e.clientY - o.startY
    setDrag(null)
    if (Math.abs(movedX) < 2 && Math.abs(movedY) < 2) return // click, non drag
    const [px, py] = vp.convertToPdfPoint(o.baseVx + movedX, o.baseVy + movedY)
    moveText(box.id, px, py)
  }

  // ── Ridimensionamento = variazione della dimensione del font ──
  const onResizeDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeOrigin.current = { startY: e.clientY, baseFontPx: fontPx }
  }
  const onResizeMove = (e: React.PointerEvent): void => {
    const o = resizeOrigin.current
    if (!o) return
    setFontPreview(Math.max(6, o.baseFontPx + (e.clientY - o.startY)))
  }
  const onResizeUp = (): void => {
    const o = resizeOrigin.current
    resizeOrigin.current = null
    const px = fontPreview
    setFontPreview(null)
    if (!o || px === null) return
    resizeText(box.id, px / vp.scale)
  }

  // ── Rotazione (attorno all'angolo in alto a sinistra) ──
  const onRotateDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    // Il transform-origin del box è l'angolo in alto a sinistra (vx, vy). Ricavo
    // le sue coordinate schermo dal layer (inset:0 sulla pagina), robusto anche
    // quando il box è già ruotato (a differenza di getBoundingClientRect).
    const layer = boxRef.current?.parentElement
    const rect = layer?.getBoundingClientRect()
    if (!rect) return
    const originX = rect.left + vx
    const originY = rect.top + vy
    const startAngle = (Math.atan2(e.clientY - originY, e.clientX - originX) * 180) / Math.PI
    rotateOrigin.current = { cx: originX, cy: originY, startAngle, base: baseRot }
  }
  const onRotateMove = (e: React.PointerEvent): void => {
    const o = rotateOrigin.current
    if (!o) return
    const angle = (Math.atan2(e.clientY - o.cy, e.clientX - o.cx) * 180) / Math.PI
    setRotation(o.base + (angle - o.startAngle))
  }
  const onRotateUp = (): void => {
    const o = rotateOrigin.current
    rotateOrigin.current = null
    const r = rotation
    setRotation(null)
    if (!o || r === null) return
    rotateText(box.id, Math.round(r))
  }

  const rot = rotation ?? baseRot
  const transform =
    (drag ? `translate(${drag.dx}px, ${drag.dy}px) ` : '') + (rot ? `rotate(${rot}deg)` : '')

  return (
    <div
      ref={boxRef}
      className={`text-box ${selected ? 'text-box-selected' : ''}`}
      style={{
        left: vx,
        top: vy,
        fontSize: `${fontPreview ?? fontPx}px`,
        transform: transform || undefined
      }}
      onClick={(e) => {
        e.stopPropagation()
        selectText(box.id)
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        beginEditText(box)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {box.text}
      {selected && (
        <>
          <button
            className="text-box-delete"
            title="Elimina testo"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              removeText(box.id)
            }}
          >
            ×
          </button>
          <span
            className="text-box-rotate"
            title="Ruota"
            onPointerDown={onRotateDown}
            onPointerMove={onRotateMove}
            onPointerUp={onRotateUp}
          />
          <span
            className="text-box-handle"
            title="Ridimensiona (dimensione testo)"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </>
      )}
    </div>
  )
}

function TextEditor({ vp }: { vp: PageViewport }) {
  const editing = useDocumentStore((s) => s.editing)!
  const setEditingText = useDocumentStore((s) => s.setEditingText)
  const commitEditing = useDocumentStore((s) => s.commitEditing)
  const cancelEditing = useDocumentStore((s) => s.cancelEditing)

  const [vx, vy] = vp.convertToViewportPoint(editing.x, editing.y)
  const fontPx = editing.fontSize * vp.scale

  return (
    <input
      className="text-editor"
      autoFocus
      value={editing.text}
      placeholder="Scrivi…"
      style={{
        left: vx,
        top: vy,
        fontSize: `${fontPx}px`,
        width: `${Math.max(80, editing.text.length * fontPx * 0.62 + 24)}px`
      }}
      onChange={(e) => setEditingText(e.target.value)}
      onBlur={() => commitEditing()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitEditing()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEditing()
        }
      }}
    />
  )
}
