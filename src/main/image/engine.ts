import sharp from 'sharp'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { CropRect, ImageExportOptions, OpenedImage } from '@shared/ipc/contracts'

/**
 * Formati immagine che apriamo. libvips ne decodifica molti; alcuni (HEIC/HEIF,
 * JXL) dipendono da come è compilato. L'elenco governa i filtri del dialogo e
 * la classificazione dei file per estensione.
 */
export const SUPPORTED_IMAGE_EXTS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'tif',
  'tiff',
  'avif',
  'heic',
  'heif',
  'svg',
  'bmp',
  'jxl'
] as const

const EXT_SET = new Set<string>(SUPPORTED_IMAGE_EXTS)

/** True se il path ha un'estensione immagine gestita. */
export function isImagePath(filePath: string): boolean {
  return EXT_SET.has(extname(filePath).slice(1).toLowerCase())
}

/**
 * Lato più lungo massimo dell'anteprima. Grande abbastanza da reggere lo zoom
 * del documento senza sfocare, ma non tanto da spedire byte enormi al renderer
 * (il gigapixel resta su disco e si decodifica in shrink-on-load).
 */
const PREVIEW_MAX = 4096

/** Copia i byte in un ArrayBuffer indipendente (il Buffer di Node è su un pool condiviso). */
function toTransferable(buf: Buffer): ArrayBuffer {
  return new Uint8Array(buf).slice().buffer as ArrayBuffer
}

/** Path su disco delle immagini aperte, per docId: serve al ri-encoding in export. */
const openImagePaths = new Map<string, string>()

/** Path della sorgente immagine di una tab, se ancora aperta. */
export function getImagePath(docId: string): string | undefined {
  return openImagePaths.get(docId)
}

/** Dimentica una immagine chiusa. */
export function forgetImage(docId: string): void {
  openImagePaths.delete(docId)
}

/**
 * Apre un'immagine di qualunque formato: legge i metadati e produce
 * un'anteprima WebP ridimensionata (shrink-on-load, orientamento EXIF
 * applicato) mostrabile dal browser anche per sorgenti che non lo sono
 * (BigTIFF, HEIC, AVIF…). L'originale NON viene trasferito al renderer.
 */
export async function openImageFile(filePath: string): Promise<OpenedImage> {
  const docId = randomUUID()
  openImagePaths.set(docId, filePath)
  return buildOpened(docId, filePath)
}

/** Costruisce il payload OpenedImage (metadati + anteprima) per un docId già mappato. */
async function buildOpened(docId: string, filePath: string): Promise<OpenedImage> {
  // limitInputPixels:false per non rifiutare le immagini gigapixel.
  const meta = await sharp(filePath, { limitInputPixels: false }).metadata()

  // L'orientamento EXIF 5–8 scambia larghezza/altezza rispetto all'header.
  const swap = (meta.orientation ?? 0) >= 5
  const width = (swap ? meta.height : meta.width) ?? 0
  const height = (swap ? meta.width : meta.height) ?? 0

  const previewBuf = await sharp(filePath, { limitInputPixels: false })
    .rotate() // normalizza l'orientamento EXIF
    .resize(PREVIEW_MAX, PREVIEW_MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 90 })
    .toBuffer()
  const previewMeta = await sharp(previewBuf).metadata()

  const { size } = await stat(filePath)

  return {
    docId,
    fileName: basename(filePath),
    filePath,
    format: meta.format ?? extname(filePath).slice(1).toLowerCase(),
    width,
    height,
    byteSize: size,
    preview: {
      data: toTransferable(previewBuf),
      mime: 'image/webp',
      width: previewMeta.width ?? 0,
      height: previewMeta.height ?? 0
    }
  }
}

/**
 * Ritaglia l'immagine corrente di un docId al rettangolo dato (coordinate in
 * pixel dell'immagine reale, già orientata come a schermo). Scrive il risultato
 * in un file temporaneo PNG, ne fa il nuovo path sorgente del docId (così export
 * e ulteriori ritagli partono dal ritagliato) e ritorna il nuovo OpenedImage.
 * Come Anteprima di macOS: non altera il file originale su disco.
 */
export async function cropImage(docId: string, rect: CropRect): Promise<OpenedImage | null> {
  const filePath = openImagePaths.get(docId)
  if (!filePath) return null

  const rotated = sharp(filePath, { limitInputPixels: false }).rotate()
  const meta = await rotated.metadata()
  const maxW = meta.width ?? 0
  const maxH = meta.height ?? 0
  // Clamp del rettangolo dentro i limiti dell'immagine (robustezza agli arrotondamenti).
  const left = Math.max(0, Math.min(Math.round(rect.left), maxW - 1))
  const top = Math.max(0, Math.min(Math.round(rect.top), maxH - 1))
  const width = Math.max(1, Math.min(Math.round(rect.width), maxW - left))
  const height = Math.max(1, Math.min(Math.round(rect.height), maxH - top))

  const out = await rotated.extract({ left, top, width, height }).png().toBuffer()
  const tempPath = join(tmpdir(), `smartview-crop-${randomUUID()}.png`)
  await writeFile(tempPath, out)

  openImagePaths.set(docId, tempPath)
  return buildOpened(docId, tempPath)
}

/** Formato concreto (non 'original') a cui punta un'estensione sorgente. */
function extToFormat(ext: string): Exclude<ImageExportOptions['format'], 'original'> {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg'
    case 'webp':
      return 'webp'
    case 'avif':
      return 'avif'
    case 'tif':
    case 'tiff':
      return 'tiff'
    case 'gif':
      return 'gif'
    default:
      return 'png'
  }
}

/**
 * Codifica l'immagine ORIGINALE (piena qualità, non l'anteprima) secondo le
 * opzioni del popup: formato, qualità/lossless, compressione TIFF, resize
 * "fit inside". "Originale" senza resize = copia byte-for-byte (nessun re-encode).
 * Ritorna i byte e l'estensione file suggerita.
 */
export async function encodeImage(
  filePath: string,
  opts: ImageExportOptions
): Promise<{ data: Buffer; ext: string }> {
  const sourceExt = extname(filePath).slice(1).toLowerCase()
  if (opts.format === 'original' && opts.resizeLongestPx === null) {
    return { data: await readFile(filePath), ext: sourceExt || 'bin' }
  }

  const fmt = opts.format === 'original' ? extToFormat(sourceExt) : opts.format
  let p = sharp(filePath, { limitInputPixels: false }).rotate()
  if (opts.resizeLongestPx) {
    p = p.resize(opts.resizeLongestPx, opts.resizeLongestPx, {
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  const q = opts.quality
  switch (fmt) {
    case 'jpeg':
      return { data: await p.jpeg({ quality: q }).toBuffer(), ext: 'jpg' }
    case 'png':
      return {
        data: await p
          .png(opts.lossless ? { compressionLevel: 9 } : { palette: true, quality: q, compressionLevel: 9 })
          .toBuffer(),
        ext: 'png'
      }
    case 'webp':
      return {
        data: await p.webp(opts.lossless ? { lossless: true } : { quality: q }).toBuffer(),
        ext: 'webp'
      }
    case 'avif':
      return {
        data: await p.avif(opts.lossless ? { lossless: true } : { quality: q }).toBuffer(),
        ext: 'avif'
      }
    case 'tiff':
      return {
        data: await p.tiff({ compression: opts.tiffCompression, quality: q }).toBuffer(),
        ext: 'tiff'
      }
    case 'gif':
      return { data: await p.gif().toBuffer(), ext: 'gif' }
    default:
      return { data: await p.png().toBuffer(), ext: 'png' }
  }
}

/**
 * Carica un'immagine di firma (PNG o SVG) come PNG con canale alpha. Gli SVG
 * vengono rasterizzati ad alta densità per restare nitidi ingranditi.
 */
export async function loadSignaturePng(
  filePath: string
): Promise<{ data: Uint8Array; width: number; height: number }> {
  const isSvg = extname(filePath).slice(1).toLowerCase() === 'svg'
  const input = isSvg ? { density: 288 } : {}
  const png = await sharp(filePath, input).png().toBuffer()
  const meta = await sharp(png).metadata()
  return { data: new Uint8Array(png), width: meta.width ?? 0, height: meta.height ?? 0 }
}

/** Apre più immagini per path, saltando quelle illeggibili. */
export async function openImageFiles(filePaths: string[]): Promise<OpenedImage[]> {
  const opened: OpenedImage[] = []
  for (const filePath of filePaths) {
    try {
      opened.push(await openImageFile(filePath))
    } catch (error) {
      console.error(`Impossibile aprire l'immagine ${filePath}:`, String(error))
    }
  }
  return opened
}
