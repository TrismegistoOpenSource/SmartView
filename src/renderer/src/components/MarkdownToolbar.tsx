import { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useDocumentStore } from '@/stores/documentStore'
import type { MarkdownViewMode } from '@/stores/documentStore'
import {
  openFilesAction,
  saveMarkdownAction,
  exportMarkdownPdfAction
} from '@/lib/actions'
import { buildPrintHtml } from '@/lib/markdown'
import {
  getCurrentMarkdownView,
  wrapSelection,
  prefixLines,
  insertCallout,
  insertCodeBlock,
  insertLink
} from '@/lib/markdownCommands'
import { IconFolderOpen, IconSave, IconArchive } from './Icons'

const MODES: { value: MarkdownViewMode; label: string }[] = [
  { value: 'editor', label: 'Editor' },
  { value: 'split', label: 'Split' },
  { value: 'preview', label: 'Anteprima' }
]

/** Toolbar contestuale per le tab Markdown: formattazione, modalità, salva/esporta. */
export function MarkdownToolbar() {
  const fileName = useDocumentStore((s) => s.fileName)
  const viewMode = useDocumentStore((s) => s.mdViewMode)
  const source = useDocumentStore((s) => s.mdSource)
  const savedSource = useDocumentStore((s) => s.mdSavedSource)
  const setViewMode = useDocumentStore((s) => s.setMarkdownViewMode)
  const [status, setStatus] = useState<string | null>(null)

  const dirty = source !== savedSource
  const canFormat = viewMode !== 'preview'

  const flash = (m: string): void => {
    setStatus(m)
    window.setTimeout(() => setStatus(null), 3000)
  }

  const run = (fn: (v: EditorView) => void) => (): void => {
    const v = getCurrentMarkdownView()
    if (v) fn(v)
  }

  const onSave = async (): Promise<void> => {
    const result = await saveMarkdownAction()
    if (result?.ok) flash('Salvato ✓')
    else if (result && result.reason === 'error') flash(`Errore: ${result.message}`)
  }

  const onExportPdf = async (): Promise<void> => {
    const html = buildPrintHtml(source, fileName)
    const result = await exportMarkdownPdfAction(html)
    if (result?.ok) flash('PDF esportato ✓')
    else if (result && result.reason === 'error') flash(`Errore: ${result.message}`)
  }

  return (
    <header className="toolbar">
      <div className="toolbar-group toolbar-left">
        <button className="tbtn" title="Apri file…" onClick={() => void openFilesAction()}>
          <IconFolderOpen />
        </button>
        <button className="tbtn" title="Salva (⌘S)" onClick={() => void onSave()}>
          <IconSave />
        </button>
        <button className="tbtn" title="Esporta in PDF…" onClick={() => void onExportPdf()}>
          <IconArchive />
        </button>
        <span className="tsep" />
        <button className="tbtn tbtn-txt" title="Grassetto (⌘B)" disabled={!canFormat} onClick={run((v) => wrapSelection(v, '**'))}>
          <b>B</b>
        </button>
        <button className="tbtn tbtn-txt" title="Corsivo (⌘I)" disabled={!canFormat} onClick={run((v) => wrapSelection(v, '*'))}>
          <i>I</i>
        </button>
        <button className="tbtn tbtn-txt" title="Titolo" disabled={!canFormat} onClick={run((v) => prefixLines(v, '## ', true))}>
          H
        </button>
        <button className="tbtn tbtn-txt" title="Citazione" disabled={!canFormat} onClick={run((v) => prefixLines(v, '> ', true))}>
          &ldquo;
        </button>
        <button className="tbtn tbtn-txt" title="Callout" disabled={!canFormat} onClick={run((v) => insertCallout(v))}>
          !
        </button>
        <button className="tbtn tbtn-txt" title="Elenco puntato" disabled={!canFormat} onClick={run((v) => prefixLines(v, '- '))}>
          •
        </button>
        <button className="tbtn tbtn-txt" title="Task list" disabled={!canFormat} onClick={run((v) => prefixLines(v, '- [ ] '))}>
          ☑
        </button>
        <button className="tbtn tbtn-txt" title="Codice inline" disabled={!canFormat} onClick={run((v) => wrapSelection(v, '`'))}>
          &lt;/&gt;
        </button>
        <button className="tbtn tbtn-txt" title="Blocco di codice" disabled={!canFormat} onClick={run((v) => insertCodeBlock(v))}>
          &#123;&#125;
        </button>
        <button className="tbtn tbtn-txt" title="Link" disabled={!canFormat} onClick={run((v) => insertLink(v))}>
          🔗
        </button>
      </div>

      <div className="toolbar-title">
        <span className="title-name">{fileName}</span>
        {dirty && <span className="title-dirty" title="Modifiche non salvate" />}
        {status && <span className="title-status">{status}</span>}
      </div>

      <div className="toolbar-group toolbar-right">
        <div className="md-mode-switch">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`md-mode-btn ${viewMode === m.value ? 'md-mode-active' : ''}`}
              onClick={() => setViewMode(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
