import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'

/**
 * Plugin callout stile Obsidian: un blockquote che inizia con `[!tipo] Titolo`
 * diventa un box `.callout .callout-<tipo>` con il titolo in grassetto.
 */
function callouts(md: MarkdownIt): void {
  md.core.ruler.push('callouts', (state) => {
    const tokens = state.tokens
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i]?.type !== 'blockquote_open') continue
      let j = i + 1
      while (j < tokens.length && tokens[j]!.type !== 'inline' && tokens[j]!.type !== 'blockquote_close') j++
      const inline = tokens[j]
      const first = inline?.children?.[0]
      if (!inline || inline.type !== 'inline' || !first || first.type !== 'text') continue
      const m = /^\[!(\w+)\]\s*(.*)$/.exec(first.content)
      if (!m) continue
      const type = m[1]!.toLowerCase()
      const title = m[2] || type.charAt(0).toUpperCase() + type.slice(1)
      tokens[i]!.attrJoin('class', `callout callout-${type}`)
      const strongOpen = new state.Token('strong_open', 'strong', 1)
      const text = new state.Token('text', '', 0)
      text.content = title
      const strongClose = new state.Token('strong_close', 'strong', -1)
      inline.children!.splice(0, 1, strongOpen, text, strongClose)
    }
  })
}

const md: MarkdownIt = new MarkdownIt({
  html: false, // il .md è input NON fidato: niente HTML grezzo
  linkify: true,
  // Un singolo "a capo" nella sorgente diventa un <br> (comportamento tipo
  // Obsidian): premere Invio una volta manda a capo anche nell'anteprima.
  breaks: true,
  typographer: true
})
  .use(taskLists, { enabled: false, label: true })
  .use(callouts)

/** Rende il Markdown in HTML sicuro (DOMPurify): mai iniettare senza sanitizzare. */
export function renderMarkdown(source: string): string {
  return DOMPurify.sanitize(md.render(source))
}

/** CSS dell'anteprima, condiviso tra la preview a schermo e l'export PDF. */
export const PREVIEW_CSS = `
.md-body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.65; color: #1a1d21; max-width: 760px; margin: 0 auto; padding: 24px 28px; }
.md-body h1,.md-body h2,.md-body h3,.md-body h4 { line-height: 1.25; margin: 1.4em 0 0.5em; font-weight: 650; }
.md-body h1 { font-size: 1.9em; }
.md-body h2 { font-size: 1.5em; }
.md-body h3 { font-size: 1.25em; }
.md-body p { margin: 0.7em 0; }
.md-body a { color: #2563eb; text-decoration: none; }
.md-body a:hover { text-decoration: underline; }
.md-body code { background: #f2f3f5; padding: 0.15em 0.35em; border-radius: 4px; font-size: 0.9em; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.md-body pre { background: #f6f7f9; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
.md-body pre code { background: none; padding: 0; }
.md-body blockquote { margin: 0.9em 0; padding: 0.2em 1em; border-left: 4px solid #d1d5db; color: #52565b; }
.md-body ul, .md-body ol { padding-left: 1.6em; margin: 0.6em 0; }
.md-body li { margin: 0.25em 0; }
.md-body table { border-collapse: collapse; margin: 0.9em 0; }
.md-body th, .md-body td { border: 1px solid #e5e7eb; padding: 6px 12px; }
.md-body th { background: #f6f7f9; }
.md-body img { max-width: 100%; }
.md-body hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.6em 0; }
.md-body .contains-task-list { list-style: none; padding-left: 0.4em; }
.md-body .task-list-item input { margin-right: 0.5em; }
.md-body .callout { border-left: 4px solid #6b7280; background: #f3f4f6; border-radius: 6px; padding: 0.6em 1em; margin: 0.9em 0; color: #1a1d21; }
.md-body .callout-note, .md-body .callout-info { border-left-color: #3b82f6; background: #eff6ff; }
.md-body .callout-todo { border-left-color: #8b5cf6; background: #f5f3ff; }
.md-body .callout-warning, .md-body .callout-caution { border-left-color: #f59e0b; background: #fffbeb; }
.md-body .callout-danger, .md-body .callout-error { border-left-color: #ef4444; background: #fef2f2; }
.md-body .callout-success, .md-body .callout-tip { border-left-color: #10b981; background: #ecfdf5; }
`

/** HTML autonomo (con CSS) per l'export PDF via printToPDF. */
export function buildPrintHtml(source: string, title: string): string {
  const body = renderMarkdown(source)
  const safeTitle = title.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)
  return `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{margin:0}${PREVIEW_CSS}</style></head><body><div class="md-body">${body}</div></body></html>`
}
