import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * Vista CodeMirror attualmente montata: la toolbar la usa per applicare i
 * comandi di formattazione con gli stessi effetti delle scorciatoie.
 */
let currentView: EditorView | null = null
export function setCurrentMarkdownView(view: EditorView | null): void {
  currentView = view
}
export function getCurrentMarkdownView(): EditorView | null {
  return currentView
}

/** Avvolge la selezione con un marcatore (toggle: se già avvolta, la rimuove). */
export function wrapSelection(view: EditorView, marker: string): boolean {
  const { state } = view
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    const before = state.sliceDoc(Math.max(0, range.from - marker.length), range.from)
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + marker.length))
    if (before === marker && after === marker) {
      // Rimuove i marcatori adiacenti.
      return {
        changes: [
          { from: range.from - marker.length, to: range.from },
          { from: range.to, to: range.to + marker.length }
        ],
        range: EditorSelection.range(range.from - marker.length, range.to - marker.length)
      }
    }
    return {
      changes: [
        { from: range.from, insert: marker },
        { from: range.to, insert: marker }
      ],
      range: EditorSelection.range(range.from + marker.length, range.to + marker.length)
    }
  })
  view.dispatch(state.update(changes, { scrollIntoView: true }))
  view.focus()
  return true
}

/** Applica un prefisso a ogni riga toccata dalla selezione (toggle sul prefisso). */
export function prefixLines(view: EditorView, prefix: string, exclusive = false): boolean {
  const { state } = view
  const changes = []
  const seen = new Set<number>()
  for (const range of state.selection.ranges) {
    let pos = range.from
    while (pos <= range.to) {
      const line = state.doc.lineAt(pos)
      if (!seen.has(line.number)) {
        seen.add(line.number)
        const text = line.text
        if (exclusive) {
          // Heading/quote: rimpiazza eventuali marcatori dello stesso tipo a inizio riga.
          const stripped = text.replace(/^(#{1,6}\s+|>\s+)/, '')
          changes.push({ from: line.from, to: line.to, insert: prefix + stripped })
        } else if (text.startsWith(prefix)) {
          changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
        } else {
          changes.push({ from: line.from, insert: prefix })
        }
      }
      if (line.to + 1 > range.to) break
      pos = line.to + 1
    }
  }
  view.dispatch(state.update({ changes }))
  view.focus()
  return true
}

/** Inserisce un blocco callout `> [!tipo]` prima della selezione. */
export function insertCallout(view: EditorView, type = 'todo'): boolean {
  const { state } = view
  const line = state.doc.lineAt(state.selection.main.from)
  const snippet = `> [!${type}] Titolo\n> `
  view.dispatch(state.update({ changes: { from: line.from, insert: snippet } }))
  view.focus()
  return true
}

/**
 * Avvolge la selezione in un blocco di codice recintato a tripla backtick su
 * righe proprie. Se non c'è selezione, inserisce un blocco vuoto col cursore
 * dentro. Il fence va sempre su una riga a sé, quindi normalizza gli a-capo.
 */
export function insertCodeBlock(view: EditorView): boolean {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const line = state.doc.lineAt(range.from)
  // Se la selezione non parte a inizio riga, apre il fence su una nuova riga.
  const leadingNl = range.from === line.from ? '' : '\n'
  const body = selected.length > 0 ? selected : ''
  const insert = `${leadingNl}\`\`\`\n${body}\n\`\`\`\n`
  // Cursore: se blocco vuoto, posiziona sulla riga interna vuota.
  const cursor = range.from + leadingNl.length + 4 // dopo "```\n"
  view.dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(body.length > 0 ? range.from + insert.length : cursor),
      scrollIntoView: true
    })
  )
  view.focus()
  return true
}

/** Inserisce lo scheletro di un link `[testo](url)`. */
export function insertLink(view: EditorView): boolean {
  const { state } = view
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || 'testo'
    const insert = `[${text}](url)`
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(range.from + insert.length, range.from + insert.length) }
  })
  view.dispatch(state.update(changes))
  view.focus()
  return true
}
