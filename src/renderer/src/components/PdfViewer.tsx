import { useDocumentStore } from '@/stores/documentStore'
import { PageView } from './PageView'

export function PdfViewer() {
  const pages = useDocumentStore((s) => s.pages)
  const zoom = useDocumentStore((s) => s.zoom)
  const selected = useDocumentStore((s) => s.selected)
  const select = useDocumentStore((s) => s.select)

  return (
    <main className="viewer">
      <div className="viewer-inner">
        {pages.map((page, index) => (
          <PageView
            key={page.key}
            page={page}
            index={index}
            zoom={zoom}
            selected={index === selected}
            onSelect={() => select(index)}
          />
        ))}
      </div>
    </main>
  )
}
