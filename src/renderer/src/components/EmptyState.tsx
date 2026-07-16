import { useEffect, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { openFilesAction, openFilePathsAction } from '@/lib/actions'
import { IconFolderOpen, IconPlus, IconImage, IconFilePdf } from './Icons'
import type { RecentFile } from '@shared/ipc/contracts'

/** Home dell'app: azioni rapide + griglia dei file recenti. */
export function EmptyState() {
  const addMarkdown = useDocumentStore((s) => s.addMarkdown)
  const [recents, setRecents] = useState<RecentFile[]>([])

  const refresh = (): void => {
    void window.smartpdf.listRecents().then(setRecents)
  }
  useEffect(refresh, [])

  const onClear = (): void => {
    void window.smartpdf.clearRecents().then(() => setRecents([]))
  }

  return (
    <div className="home">
      <div className="home-head">
        <h1 className="home-title">SmartView</h1>
        <p className="home-sub">Apri un PDF o un'immagine, oppure crea un nuovo testo.</p>
        <div className="home-actions">
          <button className="btn btn-primary" onClick={() => void openFilesAction()}>
            <IconFolderOpen /> Apri file…
          </button>
          <button className="btn" onClick={addMarkdown}>
            <IconPlus /> Crea file testo
          </button>
        </div>
      </div>

      <div className="home-recents">
        <div className="home-recents-head">
          <span>Recenti</span>
          {recents.length > 0 && (
            <button className="home-clear" onClick={onClear}>
              Svuota
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <p className="home-empty">Nessun file recente.</p>
        ) : (
          <ul className="recent-grid">
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  className="recent-card"
                  title={r.path}
                  onClick={() => void openFilePathsAction([r.path])}
                >
                  <span className="recent-icon">
                    {r.kind === 'image' ? <IconImage /> : <IconFilePdf />}
                  </span>
                  <span className="recent-name">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
