import { useEffect, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { formatBytes } from '@/lib/format'
import type { FileStat } from '@shared/ipc/contracts'

/** Righe metadato specifiche del tipo di tab attiva. */
function useTypeSpecificRows(): { label: string; value: string }[] {
  const kind = useDocumentStore((s) => s.kind)
  const pages = useDocumentStore((s) => s.pages)
  const preview = useDocumentStore((s) => s.imagePreview)
  const mdSource = useDocumentStore((s) => s.mdSource)

  if (kind === 'pdf') {
    return [
      { label: 'Tipo', value: 'Documento PDF' },
      { label: 'Pagine', value: String(pages.length) }
    ]
  }
  if (kind === 'image' && preview) {
    return [
      { label: 'Tipo', value: `Immagine ${preview.format.toUpperCase()}` },
      { label: 'Dimensioni', value: `${preview.naturalWidth} × ${preview.naturalHeight} px` }
    ]
  }
  if (kind === 'markdown') {
    const lines = mdSource.length === 0 ? 0 : mdSource.split('\n').length
    return [
      { label: 'Tipo', value: 'Testo / Markdown' },
      { label: 'Righe', value: String(lines) },
      { label: 'Caratteri', value: String(mdSource.length) }
    ]
  }
  return []
}

function formatDate(ms: number | null): string {
  if (ms === null) return '—'
  return new Date(ms).toLocaleString()
}

/** Pannello proprietà (Cmd/Ctrl+I): metadati di sistema + metadati specifici del tipo. */
export function PropertiesDialog() {
  const close = useDocumentStore((s) => s.closeProperties)
  const fileName = useDocumentStore((s) => s.fileName)
  const filePath = useDocumentStore((s) => s.filePath)
  const rows = useTypeSpecificRows()
  const [stat, setStat] = useState<FileStat | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    if (!filePath) {
      setStat(null)
      setLoading(false)
      return
    }
    void window.smartpdf.statFile(filePath).then((s) => {
      if (alive) {
        setStat(s)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [filePath])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close])

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Proprietà</h2>

        <dl className="props">
          <div className="props-row">
            <dt>Nome</dt>
            <dd>{fileName}</dd>
          </div>
          {rows.map((r) => (
            <div className="props-row" key={r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
          <div className="props-row">
            <dt>Dimensione</dt>
            <dd>{loading ? '…' : stat ? formatBytes(stat.size) : '— (non salvato)'}</dd>
          </div>
          <div className="props-row">
            <dt>Creato</dt>
            <dd>{loading ? '…' : stat ? formatDate(stat.createdMs) : '—'}</dd>
          </div>
          <div className="props-row">
            <dt>Modificato</dt>
            <dd>{loading ? '…' : stat ? formatDate(stat.modifiedMs) : '—'}</dd>
          </div>
          <div className="props-row">
            <dt>Percorso</dt>
            <dd className="props-path">{filePath ?? 'Non ancora salvato su disco'}</dd>
          </div>
        </dl>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={close}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
