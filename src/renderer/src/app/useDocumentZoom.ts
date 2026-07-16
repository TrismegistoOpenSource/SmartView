import { useEffect } from 'react'
import { useDocumentStore } from '@/stores/documentStore'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

/**
 * Zoom del documento tramite pinch del trackpad o Ctrl/Cmd+rotella.
 *
 * Il pinch del trackpad su Chromium arriva come evento `wheel` con
 * `ctrlKey === true` (lo zoom "visuale" della chrome è disabilitato nel
 * preload). Qui lo intercettiamo, lo blocchiamo (`preventDefault`, per questo
 * il listener è `passive:false`) e lo mappiamo sullo zoom del documento,
 * mantenendo fermo il punto sotto il cursore.
 */
export function useDocumentZoom(): void {
  useEffect(() => {
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      const store = useDocumentStore.getState()
      if (!store.docId) return
      e.preventDefault()

      const oldZoom = store.zoom
      const factor = Math.exp(-e.deltaY * 0.01)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor))
      if (newZoom === oldZoom) return

      const container = document.querySelector<HTMLElement>('.viewer')
      if (!container) {
        store.setZoom(newZoom)
        return
      }

      // Offset del cursore dentro l'area scrollabile del viewer.
      const rect = container.getBoundingClientRect()
      const offsetX = e.clientX - rect.left
      const offsetY = e.clientY - rect.top
      const ratio = newZoom / oldZoom

      store.setZoom(newZoom)
      // Lo scroll va corretto dopo che il layout ha ridimensionato le pagine.
      requestAnimationFrame(() => {
        container.scrollLeft = (container.scrollLeft + offsetX) * ratio - offsetX
        container.scrollTop = (container.scrollTop + offsetY) * ratio - offsetY
      })
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])
}
