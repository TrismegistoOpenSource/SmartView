import { useMemo, useRef, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Signature } from '@shared/domain/commands'
import { useDocumentStore } from '@/stores/documentStore'
import { getSignatureImage } from '@/pdf-render/signatures'

type PageViewport = ReturnType<PDFPageProxy['getViewport']>

/** Layer delle firme sovrapposto a una pagina. */
export function SignatureAnnotations({ pageKey, vp }: { pageKey: string; vp: PageViewport }) {
  const signatures = useDocumentStore((s) => s.signatures)
  const pageSigs = useMemo(
    () => signatures.filter((s) => s.pageKey === pageKey),
    [signatures, pageKey]
  )

  return (
    <div className="annot-layer">
      {pageSigs.map((sig) => (
        <SignatureView key={sig.id} sig={sig} vp={vp} />
      ))}
    </div>
  )
}

function SignatureView({ sig, vp }: { sig: Signature; vp: PageViewport }) {
  const tool = useDocumentStore((s) => s.tool)
  const selected = useDocumentStore((s) => s.selectedSignatureId === sig.id)
  const selectSignature = useDocumentStore((s) => s.selectSignature)
  const moveSignature = useDocumentStore((s) => s.moveSignature)
  const resizeSignature = useDocumentStore((s) => s.resizeSignature)
  const rotateSignature = useDocumentStore((s) => s.rotateSignature)
  const removeSignature = useDocumentStore((s) => s.removeSignature)

  const image = getSignatureImage(sig.imageId)
  const boxRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null)
  const [resize, setResize] = useState<{ w: number; h: number } | null>(null)
  const [rotation, setRotation] = useState<number | null>(null)
  const dragOrigin = useRef<{ startX: number; startY: number; baseVx: number; baseVy: number } | null>(
    null
  )
  const resizeOrigin = useRef<{ startX: number; wPx: number; hPx: number } | null>(null)
  const rotateOrigin = useRef<{ cx: number; cy: number; startAngle: number; base: number } | null>(
    null
  )

  const [vx, vy] = vp.convertToViewportPoint(sig.x, sig.y)
  const wPx = sig.width * vp.scale
  const hPx = sig.height * vp.scale
  const baseRot = sig.rotation ?? 0

  // ── Spostamento ──
  const onPointerDown = (e: React.PointerEvent): void => {
    if (tool !== 'select') return
    e.stopPropagation()
    selectSignature(sig.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    dragOrigin.current = { startX: e.clientX, startY: e.clientY, baseVx: vx, baseVy: vy }
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!dragOrigin.current) return
    setDrag({ dx: e.clientX - dragOrigin.current.startX, dy: e.clientY - dragOrigin.current.startY })
  }
  const onPointerUp = (e: React.PointerEvent): void => {
    const o = dragOrigin.current
    dragOrigin.current = null
    if (!o) return
    const movedX = e.clientX - o.startX
    const movedY = e.clientY - o.startY
    setDrag(null)
    if (Math.abs(movedX) < 2 && Math.abs(movedY) < 2) return
    const [px, py] = vp.convertToPdfPoint(o.baseVx + movedX, o.baseVy + movedY)
    moveSignature(sig.id, px, py)
  }

  // ── Ridimensionamento (mantiene le proporzioni, ancorato all'angolo in alto a sinistra) ──
  const onResizeDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    resizeOrigin.current = { startX: e.clientX, wPx, hPx }
  }
  const onResizeMove = (e: React.PointerEvent): void => {
    const o = resizeOrigin.current
    if (!o) return
    const nextW = Math.max(24, o.wPx + (e.clientX - o.startX))
    setResize({ w: nextW, h: nextW * (o.hPx / o.wPx) })
  }
  const onResizeUp = (): void => {
    const o = resizeOrigin.current
    resizeOrigin.current = null
    const r = resize
    setResize(null)
    if (!o || !r) return
    resizeSignature(sig.id, sig.x, sig.y, r.w / vp.scale, r.h / vp.scale)
  }

  // ── Rotazione (attorno al centro del box) ──
  const onRotateDown = (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const startAngle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI
    rotateOrigin.current = { cx, cy, startAngle, base: baseRot }
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
    rotateSignature(sig.id, Math.round(r))
  }

  const width = resize ? resize.w : wPx
  const height = resize ? resize.h : hPx
  const rot = rotation ?? baseRot
  const transform =
    (drag ? `translate(${drag.dx}px, ${drag.dy}px) ` : '') + (rot ? `rotate(${rot}deg)` : '')

  return (
    <div
      ref={boxRef}
      className={`sig-box ${selected ? 'sig-box-selected' : ''}`}
      style={{
        left: vx,
        top: vy,
        width,
        height,
        transformOrigin: 'center center',
        transform: transform || undefined
      }}
      onClick={(e) => {
        e.stopPropagation()
        selectSignature(sig.id)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {image && <img src={image.url} alt="Firma" draggable={false} />}
      {selected && (
        <>
          <button
            className="sig-box-delete"
            title="Elimina firma"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              removeSignature(sig.id)
            }}
          >
            ×
          </button>
          <span
            className="sig-box-rotate"
            title="Ruota"
            onPointerDown={onRotateDown}
            onPointerMove={onRotateMove}
            onPointerUp={onRotateUp}
          />
          <span
            className="sig-box-handle"
            title="Ridimensiona"
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </>
      )}
    </div>
  )
}
