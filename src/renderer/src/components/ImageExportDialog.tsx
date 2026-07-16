import { useEffect, useState } from 'react'
import { useDocumentStore } from '@/stores/documentStore'
import { exportImageAction, exportImageBatchAction } from '@/lib/actions'
import type { ExportProgress, ImageExportOptions, ImageFormat } from '@shared/ipc/contracts'

const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: 'original', label: 'Originale' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
  { value: 'avif', label: 'AVIF' },
  { value: 'tiff', label: 'TIFF' },
  { value: 'gif', label: 'GIF' }
]

const TIFF_COMPRESSIONS: ImageExportOptions['tiffCompression'][] = ['none', 'lzw', 'deflate', 'jpeg']

/** Formati per cui ha senso il toggle "senza perdita". */
const LOSSLESS_CAPABLE = new Set<ImageFormat>(['webp', 'png', 'avif'])

/** Popup di salvataggio immagine: formato, compressione, resize "fit inside". */
export function ImageExportDialog() {
  const preview = useDocumentStore((s) => s.imagePreview)
  const close = useDocumentStore((s) => s.closeImageExport)
  const batch = useDocumentStore((s) => s.imageExportBatch)
  const batchCount = useDocumentStore((s) => s.imageBatchIds.length)

  const longest = preview ? Math.max(preview.naturalWidth, preview.naturalHeight) : 0

  const [format, setFormat] = useState<ImageFormat>('original')
  const [quality, setQuality] = useState(85)
  const [lossless, setLossless] = useState(false)
  const [tiffCompression, setTiffCompression] =
    useState<ImageExportOptions['tiffCompression']>('lzw')
  const [resizeOn, setResizeOn] = useState(false)
  const [resizePx, setResizePx] = useState(longest)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ExportProgress | null>(null)

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

  const showLossless = LOSSLESS_CAPABLE.has(format)
  const showQuality =
    !(format === 'original' || format === 'gif') &&
    !(showLossless && lossless) &&
    !(format === 'tiff' && tiffCompression !== 'jpeg')

  const onSave = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setProgress(null)
    const options: ImageExportOptions = {
      format,
      quality,
      lossless: showLossless && lossless,
      tiffCompression,
      resizeLongestPx: resizeOn ? Math.max(1, Math.round(resizePx)) : null
    }
    const unsub = batch ? window.smartpdf.onExportProgress(setProgress) : null
    const result = batch ? await exportImageBatchAction(options) : await exportImageAction(options)
    unsub?.()
    setBusy(false)
    if (!result) return close()
    if (result.ok) close()
    else if (result.reason === 'error') setError(result.message)
    else close() // annullato dal dialogo nativo
  }

  const saveLabel = busy
    ? progress
      ? `Esportazione ${progress.done}/${progress.total}…`
      : 'Esportazione…'
    : batch
      ? `Esporta ${batchCount} in cartella…`
      : 'Salva…'

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">
          {batch ? `Esporta ${batchCount} immagini` : 'Salva immagine'}
        </h2>

        <label className="field">
          <span>Formato</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ImageFormat)}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        {showLossless && (
          <label className="field field-check">
            <input
              type="checkbox"
              checked={lossless}
              onChange={(e) => setLossless(e.target.checked)}
            />
            <span>Senza perdita (lossless)</span>
          </label>
        )}

        {format === 'tiff' && (
          <label className="field">
            <span>Compressione TIFF</span>
            <select
              value={tiffCompression}
              onChange={(e) =>
                setTiffCompression(e.target.value as ImageExportOptions['tiffCompression'])
              }
            >
              {TIFF_COMPRESSIONS.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        )}

        {showQuality && (
          <label className="field">
            <span>Qualità: {quality}%</span>
            <input
              type="range"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        )}

        <label className="field field-check">
          <input type="checkbox" checked={resizeOn} onChange={(e) => setResizeOn(e.target.checked)} />
          <span>Ridimensiona lato lungo</span>
        </label>
        {resizeOn && (
          <label className="field">
            <span>Lato lungo (px), attuale {longest}</span>
            <input
              type="number"
              min={1}
              value={resizePx}
              onChange={(e) => setResizePx(Number(e.target.value))}
            />
          </label>
        )}

        {error && <p className="modal-error">Errore: {error}</p>}

        <div className="modal-actions">
          <button className="btn" onClick={close} disabled={busy}>
            Annulla
          </button>
          <button className="btn btn-primary" onClick={() => void onSave()} disabled={busy}>
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
