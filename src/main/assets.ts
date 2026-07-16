import { app } from 'electron'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { PdfAAssets } from './pdf/engine'

/**
 * Cartella degli asset a runtime. In dev vive nella root del progetto; una
 * volta pacchettizzata è in `process.resourcesPath` (vedi `extraResources`
 * in electron-builder.yml: `resources/fonts` → `fonts`, `resources/icc` → `icc`).
 */
const RESOURCES_DIR = app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')

let cached: PdfAAssets | null = null

/** Carica (e memoizza) font Liberation + profilo ICC sRGB per l'export PDF/A. */
export async function loadPdfAAssets(): Promise<PdfAAssets> {
  if (cached) return cached
  const [font, icc] = await Promise.all([
    readFile(join(RESOURCES_DIR, 'fonts', 'LiberationSans-Regular.ttf')),
    // Profilo sRGB v2 redistribuibile (CC0, Compact ICC Profiles). Vedi resources/icc/README.md.
    readFile(join(RESOURCES_DIR, 'icc', 'sRGB-v2-micro.icc'))
  ])
  cached = { fontBytes: new Uint8Array(font), iccBytes: new Uint8Array(icc) }
  return cached
}
