import { useEffect, useRef, useState } from 'react'
import { TextLayer, AnnotationMode } from 'pdfjs-dist'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PageRef } from '@shared/domain/commands'
import { getPdf } from '@/pdf-render/current'
import { isRenderCancelled } from '@/pdf-render/engine'
import { useDocumentStore } from '@/stores/documentStore'
import type { PageSize } from '@/stores/documentStore'
import { TextAnnotations } from './TextAnnotations'
import { SignatureAnnotations } from './SignatureAnnotations'
import { FormAnnotations } from './FormAnnotations'

type PageViewport = ReturnType<PDFPageProxy['getViewport']>

const FALLBACK_SIZE: PageSize = { width: 612, height: 792 } // Letter

export function PageView({
  page,
  index,
  zoom,
  selected,
  onSelect
}: {
  page: PageRef
  index: number
  zoom: number
  selected: boolean
  onSelect: () => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textLayerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [vp, setVp] = useState<PageViewport | null>(null)
  const size = useDocumentStore((s) => s.sizes[page.key])
  const tool = useDocumentStore((s) => s.tool)
  const beginText = useDocumentStore((s) => s.beginText)
  const selectText = useDocumentStore((s) => s.selectText)

  // Placeholder a dimensione reale: scroll stabile anche prima del rendering.
  const base = size ?? FALLBACK_SIZE
  const swap = page.rotation % 180 !== 0
  const width = Math.floor((swap ? base.height : base.width) * zoom)
  const height = Math.floor((swap ? base.width : base.height) * zoom)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry) setVisible(entry.isIntersecting)
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const pdf = getPdf(page.sourceId)
    const canvas = canvasRef.current
    const textLayerDiv = textLayerRef.current
    if (!pdf || !canvas || !textLayerDiv) return

    let cancelled = false
    let task: ReturnType<PDFPageProxy['render']> | undefined

    void (async () => {
      try {
        const p = await pdf.getPage(page.sourceIndex + 1)
        if (cancelled) return

        const rotation = (p.rotate + page.rotation) % 360
        const viewport = p.getViewport({ scale: zoom, rotation })
        const dpr = window.devicePixelRatio || 1

        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        const ctx = canvas.getContext('2d')
        if (!ctx) return
        task = p.render({
          canvasContext: ctx,
          viewport,
          // ENABLE_FORMS: pdf.js NON dipinge sul canvas i valori dei campi
          // AcroForm (li gestisce il nostro overlay HTML in FormAnnotations).
          // Senza questo, i valori risultano "doppi" (canvas + overlay) e la
          // copia sul canvas non si aggiorna durante la compilazione.
          annotationMode: AnnotationMode.ENABLE_FORMS,
          ...(dpr !== 1 ? { transform: [dpr, 0, 0, dpr, 0, 0] } : {})
        })
        await task.promise
        if (cancelled) return

        // Text layer trasparente sopra il canvas: il testo ORIGINALE resta
        // selezionabile e ricercabile — mai rasterizzato.
        textLayerDiv.textContent = ''
        textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale))
        const textLayer = new TextLayer({
          textContentSource: p.streamTextContent(),
          container: textLayerDiv,
          viewport
        })
        await textLayer.render()
        if (cancelled) return

        // Espone il viewport agli overlay (conversione coordinate schermo↔PDF).
        setVp(viewport)
      } catch (error) {
        if (!isRenderCancelled(error)) console.error('Errore rendering pagina:', error)
      }
    })()

    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, page.key, page.sourceId, page.sourceIndex, page.rotation, zoom])

  const onClick = (e: React.MouseEvent): void => {
    if (tool === 'text') {
      const el = wrapRef.current
      if (!el || !vp) return
      const rect = el.getBoundingClientRect()
      const [px, py] = vp.convertToPdfPoint(e.clientX - rect.left, e.clientY - rect.top)
      beginText(page.key, px, py)
    } else {
      selectText(null)
      onSelect()
    }
  }

  return (
    <div
      ref={wrapRef}
      id={`pageview-${page.key}`}
      className={`pageview ${selected ? 'pageview-selected' : ''}`}
      style={{ width, height }}
      onClick={onClick}
      data-page-number={index + 1}
    >
      <canvas ref={canvasRef} className="pageview-canvas" />
      <div ref={textLayerRef} className="textLayer" />
      {vp && <FormAnnotations page={page} vp={vp} />}
      {vp && <TextAnnotations pageKey={page.key} vp={vp} />}
      {vp && <SignatureAnnotations pageKey={page.key} vp={vp} />}
    </div>
  )
}
