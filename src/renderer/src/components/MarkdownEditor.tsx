import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { markdown } from '@codemirror/lang-markdown'
import { tags as t } from '@lezer/highlight'
import { useDocumentStore } from '@/stores/documentStore'
import { setCurrentMarkdownView, wrapSelection } from '@/lib/markdownCommands'

/**
 * Stile "live preview" tipo Obsidian: la SORGENTE stessa è formattata (titoli
 * grandi, grassetto/corsivo reali, codice, citazioni), e i marcatori di sintassi
 * (#, **, `, >) sono attenuati invece di nascosti. Così editor e anteprima
 * coincidono senza un secondo pannello.
 */
const livePreview = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.9em', fontWeight: '700', lineHeight: '1.35' },
  { tag: t.heading2, fontSize: '1.55em', fontWeight: '700', lineHeight: '1.35' },
  { tag: t.heading3, fontSize: '1.3em', fontWeight: '650' },
  { tag: t.heading4, fontSize: '1.15em', fontWeight: '650' },
  { tag: [t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700', color: 'var(--text-strong)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--accent)', textDecoration: 'underline' },
  { tag: t.url, color: 'var(--accent)' },
  {
    tag: t.monospace,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    background: 'var(--surface-hover)',
    borderRadius: '4px',
    padding: '0.05em 0.3em'
  },
  { tag: t.quote, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: t.list, color: 'var(--text-strong)' },
  // Marcatori di sintassi (#, **, >, `, -, marker link): attenuati, non nascosti.
  { tag: [t.processingInstruction, t.meta], color: 'var(--text-muted)', opacity: '0.55' }
])

/** Editor Markdown (CodeMirror 6). Non controllato: si ricrea al cambio di tab. */
export function MarkdownEditor({ docId }: { docId: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const setMarkdownSource = useDocumentStore((s) => s.setMarkdownSource)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        // Legge la sorgente della tab attiva al momento del montaggio.
        doc: useDocumentStore.getState().mdSource,
        extensions: [
          history(),
          keymap.of([
            { key: 'Mod-b', run: (v) => wrapSelection(v, '**') },
            { key: 'Mod-i', run: (v) => wrapSelection(v, '*') },
            ...defaultKeymap,
            ...historyKeymap
          ]),
          markdown(),
          syntaxHighlighting(livePreview),
          EditorView.lineWrapping,
          placeholder('Scrivi in Markdown…'),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) setMarkdownSource(u.state.doc.toString())
          })
        ]
      })
    })
    setCurrentMarkdownView(view)
    view.focus()

    return () => {
      setCurrentMarkdownView(null)
      view.destroy()
    }
  }, [docId, setMarkdownSource])

  return <div className="md-editor" ref={hostRef} />
}
