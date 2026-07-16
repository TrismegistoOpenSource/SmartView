import { app } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RecentFile } from '@shared/ipc/contracts'

/** Quanti file recenti conservare. */
const MAX_RECENTS = 24

/** Piccolo store JSON in userData: niente DB, coerente con la filosofia dell'app. */
function recentsPath(): string {
  return join(app.getPath('userData'), 'recents.json')
}

let cache: RecentFile[] | null = null

export async function listRecents(): Promise<RecentFile[]> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await readFile(recentsPath(), 'utf8'))
    cache = Array.isArray(parsed) ? (parsed as RecentFile[]) : []
  } catch {
    cache = []
  }
  return cache
}

/** Aggiunge (o promuove) un file in cima ai recenti, deduplicando per path. */
export async function addRecent(entry: RecentFile): Promise<void> {
  const list = await listRecents()
  const next = [entry, ...list.filter((r) => r.path !== entry.path)].slice(0, MAX_RECENTS)
  cache = next
  try {
    await writeFile(recentsPath(), JSON.stringify(next))
  } catch {
    // Persistenza best-effort: un errore di scrittura non deve rompere l'apertura.
  }
}

export async function clearRecents(): Promise<void> {
  cache = []
  try {
    await writeFile(recentsPath(), '[]')
  } catch {
    // idem
  }
}
