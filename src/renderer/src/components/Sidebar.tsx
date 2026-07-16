import { useDocumentStore } from '@/stores/documentStore'
import { PdfSidebar } from './PdfSidebar'
import { ImageSidebar } from './ImageSidebar'

export function Sidebar() {
  const kind = useDocumentStore((s) => s.kind)

  if (kind === 'pdf') return <PdfSidebar />
  if (kind === 'image') return <ImageSidebar />
  return null // Markdown non ha sidebar
}
