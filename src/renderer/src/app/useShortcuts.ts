import { useEffect } from 'react'
import { useDocumentStore, DEFAULT_ZOOM } from '@/stores/documentStore'
import {
  openFilesAction,
  saveDocumentAction,
  saveAsDocumentAction,
  saveMarkdownAction,
  saveMarkdownAsAction,
  mergeDocumentAction,
  closeTabAction
} from '@/lib/actions'

const ZOOM_STEP = 0.25

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT')
}

/**
 * Scorciatoie globali. Le azioni leggono lo stato al momento dell'evento
 * (getState), quindi l'handler non ha bisogno di dipendenze reattive.
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const store = useDocumentStore.getState()
      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey

      if (mod) {
        switch (key) {
          case 'o':
            e.preventDefault()
            void openFilesAction()
            return
          case 's':
            // Cmd/Ctrl+S = Salva ; Shift+Cmd/Ctrl+S = Salva con nome.
            // Per le immagini "salva" = popup di export (formato/compressione).
            if (!store.docId) return
            e.preventDefault()
            if (store.kind === 'image') store.openImageExport()
            else if (store.kind === 'markdown') {
              if (e.shiftKey) void saveMarkdownAsAction()
              else void saveMarkdownAction()
            } else if (e.shiftKey) void saveAsDocumentAction()
            else void saveDocumentAction()
            return
          case 'm':
            if (!store.docId || store.kind !== 'pdf') return
            e.preventDefault()
            void mergeDocumentAction()
            return
          case 'w':
            if (!store.docId) return
            e.preventDefault()
            void closeTabAction(store.docId)
            return
          case 'i':
            // Cmd/Ctrl+I = pannello proprietà file della tab attiva.
            if (!store.docId) return
            e.preventDefault()
            store.toggleProperties()
            return
          case 'z':
            // Cmd/Ctrl+Z = annulla ; Shift+Cmd/Ctrl+Z = ripeti
            if (!store.docId) return
            e.preventDefault()
            if (e.shiftKey) store.redo()
            else store.undo()
            return
          // Zoom del DOCUMENTO (non della chrome): '=' e '+' ingrandiscono,
          // '-' e '_' riducono, '0' torna allo zoom di default.
          case '=':
          case '+':
            if (!store.docId) return
            e.preventDefault()
            store.setZoom(store.zoom + ZOOM_STEP)
            return
          case '-':
          case '_':
            if (!store.docId) return
            e.preventDefault()
            store.setZoom(store.zoom - ZOOM_STEP)
            return
          case '0':
            if (!store.docId) return
            e.preventDefault()
            store.setZoom(DEFAULT_ZOOM)
            return
          default:
            return
        }
      }

      // Tasti senza modificatore: ignorati mentre si scrive in un campo.
      if (isTypingTarget(e.target)) return
      if (!store.docId) return

      switch (e.key) {
        case 'Escape':
          if (store.editing) store.cancelEditing()
          else if (store.tool === 'text') store.setTool('select')
          else {
            store.selectText(null)
            store.selectSignature(null)
          }
          break
        case 'Delete':
        case 'Backspace':
          if (store.selectedTextId) {
            e.preventDefault()
            store.removeText(store.selectedTextId)
          } else if (store.selectedSignatureId) {
            e.preventDefault()
            store.removeSignature(store.selectedSignatureId)
          }
          break
        case 't':
        case 'T':
          if (store.kind === 'pdf') store.setTool(store.tool === 'text' ? 'select' : 'text')
          break
        case 'ArrowUp':
          // Navigazione tra le immagini della galleria (miniature disposte in verticale).
          if (store.kind === 'image' && store.imageItems.length > 1) {
            e.preventDefault()
            store.stepImage(-1)
          }
          break
        case 'ArrowDown':
          if (store.kind === 'image' && store.imageItems.length > 1) {
            e.preventDefault()
            store.stepImage(1)
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
