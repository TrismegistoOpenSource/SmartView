import { useMemo } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { renderMarkdown } from '@/lib/markdown'
import { MarkdownEditor } from './MarkdownEditor'

/** Pannello Markdown: editor CodeMirror e/o anteprima, secondo viewMode. */
export function MarkdownViewer() {
  const docId = useDocumentStore((s) => s.docId)
  const viewMode = useDocumentStore((s) => s.mdViewMode)
  const source = useDocumentStore((s) => s.mdSource)
  const html = useMemo(() => renderMarkdown(source), [source])

  return (
    <main className={`viewer md-viewer md-mode-${viewMode}`}>
      {viewMode !== 'preview' && <MarkdownEditor key={docId} docId={docId} />}
      {viewMode !== 'editor' && (
        <div className="md-preview">
          {/* html è già sanitizzato con DOMPurify in renderMarkdown. */}
          <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </main>
  )
}
