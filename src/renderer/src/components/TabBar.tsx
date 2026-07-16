import { useDocumentStore } from '@/stores/documentStore'
import { openFilesAction, closeTabAction } from '@/lib/actions'
import { IconPlus, IconClose } from './Icons'

/** Un PDF senza modifiche salvate mostra il pallino "dirty". */
function isDirty(commands: number, savedPath: string | null): boolean {
  return commands > 0 && !savedPath
}

export function TabBar() {
  const tabs = useDocumentStore((s) => s.tabs)
  const activeId = useDocumentStore((s) => s.docId)
  // Metadati live della tab attiva (l'entry in `tabs` può essere stale).
  const activeCommands = useDocumentStore((s) => s.commands.length)
  const activeSavedPath = useDocumentStore((s) => s.savedPath)
  const activateTab = useDocumentStore((s) => s.activateTab)

  if (tabs.length === 0) return null

  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab) => {
        const active = tab.docId === activeId
        const dirty = active
          ? isDirty(activeCommands, activeSavedPath)
          : tab.kind === 'pdf'
            ? isDirty(tab.commands.length, tab.savedPath)
            : false
        return (
          <div
            key={tab.docId}
            role="tab"
            aria-selected={active}
            className={`tab ${active ? 'tab-active' : ''}`}
            title={tab.fileName}
            onClick={() => activateTab(tab.docId)}
            onAuxClick={(e) => {
              if (e.button === 1) void closeTabAction(tab.docId) // tasto centrale = chiudi
            }}
          >
            <span className="tab-name">{tab.fileName}</span>
            {dirty && <span className="tab-dirty" title="Modifiche non salvate" />}
            <button
              className="tab-close"
              title="Chiudi"
              aria-label={`Chiudi ${tab.fileName}`}
              onClick={(e) => {
                e.stopPropagation()
                void closeTabAction(tab.docId)
              }}
            >
              <IconClose />
            </button>
          </div>
        )
      })}
      <button
        className="tab-new"
        title="Apri file in una nuova tab…"
        aria-label="Apri file in una nuova tab"
        onClick={() => void openFilesAction()}
      >
        <IconPlus />
      </button>
    </div>
  )
}
