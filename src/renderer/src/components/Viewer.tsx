import { useDocumentStore } from '@/stores/documentStore'
import { PdfViewer } from './PdfViewer'
import { ImageViewer } from './ImageViewer'
import { MarkdownViewer } from './MarkdownViewer'

export function Viewer() {
  const kind = useDocumentStore((s) => s.kind)

  if (kind === 'pdf') return <PdfViewer />
  if (kind === 'image') return <ImageViewer />
  return <MarkdownViewer />
}
