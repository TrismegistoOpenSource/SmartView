import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { cropImageAction } from '@/lib/actions'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Margine attorno all'immagine quando è adattata alla finestra (px). */
const FIT_MARGIN = 32

/**
 * Viewer immagini. A zoom = 1 l'immagine è adattata alla finestra ("fit"); lo
 * zoom del documento moltiplica quella dimensione. Le dimensioni sono in pixel
 * reali (niente transform) così lo scroll centrato sul cursore di useDocumentZoom
 * resta coerente.
 *
 * Navigazione dell'immagine ingrandita:
 *  - barra spaziatrice + trascinamento del mouse → pan (come Photoshop);
 *  - rotella → scorrimento verticale (nativo);
 *  - Maiusc + rotella → scorrimento orizzontale.
 */
export function ImageViewer() {
  const preview = useDocumentStore((s) => s.imagePreview)
  const zoom = useDocumentStore((s) => s.zoom)
  const setImageFit = useDocumentStore((s) => s.setImageFit)
  const cropMode = useDocumentStore((s) => s.imageCropMode)
  const setCropMode = useDocumentStore((s) => s.setImageCropMode)
  const viewerRef = useRef<HTMLElement>(null)
  const [fit, setFit] = useState(1)
  const [grabbing, setGrabbing] = useState(false)
  const [cropRect, setCropRect] = useState<Rect | null>(null)
  const cropDrag = useRef<{ x0: number; y0: number } | null>(null)

  // Uscendo dalla modalità ritaglio (o cambiando immagine) azzera la selezione.
  useEffect(() => {
    if (!cropMode) setCropRect(null)
  }, [cropMode, preview])

  const pw = preview?.previewWidth ?? 0
  const ph = preview?.previewHeight ?? 0

  // "Fit": scala che fa entrare l'anteprima nel viewport, senza ingrandirla oltre 1:1.
  useLayoutEffect(() => {
    const el = viewerRef.current
    if (!el || pw === 0 || ph === 0) return
    const measure = (): void => {
      const availW = Math.max(0, el.clientWidth - FIT_MARGIN)
      const availH = Math.max(0, el.clientHeight - FIT_MARGIN)
      const f = Math.min(availW / pw, availH / ph, 1)
      const next = f > 0 ? f : 1
      setFit(next)
      setImageFit(next)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pw, ph, setImageFit])

  // Pan con barra spaziatrice + Maiusc+rotella per lo scorrimento orizzontale.
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return

    let spaceHeld = false
    let panning: { x: number; y: number; left: number; top: number } | null = null

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !spaceHeld) {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        spaceHeld = true
        setGrabbing(true)
        e.preventDefault() // evita lo scroll di pagina con lo spazio
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        spaceHeld = false
        setGrabbing(false)
      }
    }
    const onPointerDown = (e: PointerEvent): void => {
      if (!spaceHeld) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      panning = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    }
    const onPointerMove = (e: PointerEvent): void => {
      if (!panning) return
      el.scrollLeft = panning.left - (e.clientX - panning.x)
      el.scrollTop = panning.top - (e.clientY - panning.y)
    }
    const endPan = (): void => {
      panning = null
    }
    const onWheel = (e: WheelEvent): void => {
      // Ctrl/Cmd = zoom (gestito altrove). Maiusc = scorrimento orizzontale.
      if (e.ctrlKey || e.metaKey) return
      if (e.shiftKey && e.deltaX === 0) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPan)
    el.addEventListener('pointercancel', endPan)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPan)
      el.removeEventListener('pointercancel', endPan)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  if (!preview) return <main className="viewer" ref={viewerRef} />

  const scale = fit * zoom
  const width = Math.round(pw * scale)
  const height = Math.round(ph * scale)

  // Selezione del ritaglio in coordinate display (relative all'image-stage).
  const onCropDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    const rectEl = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rectEl.left
    const y = e.clientY - rectEl.top
    cropDrag.current = { x0: x, y0: y }
    setCropRect({ x, y, w: 0, h: 0 })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onCropMove = (e: React.PointerEvent): void => {
    const start = cropDrag.current
    if (!start) return
    const rectEl = e.currentTarget.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rectEl.left, width))
    const y = Math.max(0, Math.min(e.clientY - rectEl.top, height))
    setCropRect({
      x: Math.min(start.x0, x),
      y: Math.min(start.y0, y),
      w: Math.abs(x - start.x0),
      h: Math.abs(y - start.y0)
    })
  }
  const onCropUp = (): void => {
    cropDrag.current = null
  }

  const applyCrop = (): void => {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4 || !preview) return
    // Da coordinate display a pixel dell'immagine reale (l'anteprima è scalata).
    const sx = preview.naturalWidth / width
    const sy = preview.naturalHeight / height
    void cropImageAction({
      left: cropRect.x * sx,
      top: cropRect.y * sy,
      width: cropRect.w * sx,
      height: cropRect.h * sy
    })
  }

  return (
    <main className={`viewer image-viewer ${grabbing ? 'image-grabbing' : ''}`} ref={viewerRef}>
      <div className="image-stage" style={{ width, height }}>
        <img className="image-doc" src={preview.url} width={width} height={height} alt="" draggable={false} />
        {cropMode && (
          <div
            className="crop-layer"
            onPointerDown={onCropDown}
            onPointerMove={onCropMove}
            onPointerUp={onCropUp}
            onPointerCancel={onCropUp}
          >
            {cropRect && cropRect.w > 0 && (
              <div
                className="crop-rect"
                style={{ left: cropRect.x, top: cropRect.y, width: cropRect.w, height: cropRect.h }}
              />
            )}
          </div>
        )}
      </div>
      {cropMode && (
        <div className="crop-bar">
          <span className="crop-hint">Trascina per selezionare l’area da ritagliare</span>
          <button className="btn" onClick={() => setCropMode(false)}>
            Annulla
          </button>
          <button
            className="btn btn-primary"
            disabled={!cropRect || cropRect.w < 4 || cropRect.h < 4}
            onClick={applyCrop}
          >
            Ritaglia
          </button>
        </div>
      )}
    </main>
  )
}
