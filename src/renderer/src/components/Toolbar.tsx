import { useDocumentStore } from '@/stores/documentStore'
import { PdfToolbar } from './PdfToolbar'
import { ImageToolbar } from './ImageToolbar'
import { MarkdownToolbar } from './MarkdownToolbar'

export function Toolbar() {
  const docId = useDocumentStore((s) => s.docId)
  const kind = useDocumentStore((s) => s.kind)

  if (docId && kind === 'image') return <ImageToolbar />
  if (docId && kind === 'markdown') return <MarkdownToolbar />
  return <PdfToolbar />
}
