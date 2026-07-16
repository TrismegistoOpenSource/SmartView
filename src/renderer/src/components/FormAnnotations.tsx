import { useEffect, useState } from 'react'
import type { PDFPageProxy } from 'pdfjs-dist'
import type { PageRef } from '@shared/domain/commands'
import { getPdf } from '@/pdf-render/current'
import {
  ensureFormScripting,
  commitFormField,
  commitFormCheckbox,
  commitFormChoice
} from '@/pdf-render/formScripting'
import { useDocumentStore } from '@/stores/documentStore'

type PageViewport = ReturnType<PDFPageProxy['getViewport']>

/** Sottoinsieme dei campi annotazione pdf.js che ci servono. */
interface WidgetAnnotation {
  id: string
  fieldName?: string
  fieldType?: string // 'Tx' | 'Btn' | 'Ch'
  fieldValue?: string
  rect: number[]
  readOnly?: boolean
  multiLine?: boolean
  checkBox?: boolean
  radioButton?: boolean
  exportValue?: string
  combo?: boolean
  options?: { value: string; displayValue: string }[]
}

/** Layer dei campi AcroForm compilabili sovrapposto a una pagina. */
export function FormAnnotations({ page, vp }: { page: PageRef; vp: PageViewport }) {
  const [widgets, setWidgets] = useState<WidgetAnnotation[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pdf = getPdf(page.sourceId)
      if (!pdf) return
      const p = await pdf.getPage(page.sourceIndex + 1)
      const annots = (await p.getAnnotations({ intent: 'display' })) as WidgetAnnotation[]
      if (cancelled) return
      // Con annotationMode=ENABLE_FORMS il canvas non disegna i campi: li
      // rendiamo TUTTI qui (i read-only come sola lettura), altrimenti sparirebbero.
      setWidgets(annots.filter((a) => a.fieldType && a.fieldName))
      // Attiva (una volta per documento) il calcolo automatico via sandbox pdf.js.
      // Fail-safe: se non parte, la compilazione manuale resta invariata.
      ensureFormScripting(page.sourceId, pdf, (updates) =>
        useDocumentStore.getState().applyComputedFields(updates)
      )
    })()
    return () => {
      cancelled = true
    }
  }, [page.sourceId, page.sourceIndex])

  if (widgets.length === 0) return null

  return (
    <div className="annot-layer form-layer">
      {widgets.map((w) => (
        <FormField key={w.id} widget={w} vp={vp} sourceId={page.sourceId} />
      ))}
    </div>
  )
}

function FormField({
  widget,
  vp,
  sourceId
}: {
  widget: WidgetAnnotation
  vp: PageViewport
  sourceId: string
}) {
  const stored = useDocumentStore((s) => s.formValues[widget.fieldName!])
  const setFieldValue = useDocumentStore((s) => s.setFieldValue)
  // Ogni modifica aggiorna lo store E notifica la sandbox (→ ricalcolo dei derivati).
  const onText = (value: string): void => {
    setFieldValue(widget.fieldName!, value)
    void commitFormField(sourceId, widget.id, value)
  }
  const onCheck = (checked: boolean): void => {
    setFieldValue(widget.fieldName!, checked)
    void commitFormCheckbox(sourceId, widget.id, checked)
  }
  const onChoice = (value: string): void => {
    setFieldValue(widget.fieldName!, value)
    void commitFormChoice(sourceId, widget.id, value)
  }

  const r = vp.convertToViewportRectangle(widget.rect)
  const left = Math.min(r[0]!, r[2]!)
  const top = Math.min(r[1]!, r[3]!)
  const width = Math.abs(r[2]! - r[0]!)
  const height = Math.abs(r[3]! - r[1]!)
  const style = { left, top, width, height } as const
  const name = widget.fieldName!
  const readOnly = Boolean(widget.readOnly)
  const stop = (e: React.SyntheticEvent): void => e.stopPropagation()

  // Checkbox
  if (widget.fieldType === 'Btn' && widget.checkBox) {
    const checked =
      typeof stored === 'boolean' ? stored : Boolean(widget.fieldValue && widget.fieldValue !== 'Off')
    return (
      <input
        type="checkbox"
        className="form-field form-check"
        style={style}
        checked={checked}
        disabled={readOnly}
        onPointerDown={stop}
        onClick={stop}
        onChange={(e) => onCheck(e.target.checked)}
      />
    )
  }

  // Radio button: gruppo non ancora compilabile (v1), ma reso visibile in sola
  // lettura riflettendo il valore già presente nel PDF (prima era disegnato dal canvas).
  if (widget.fieldType === 'Btn' && widget.radioButton) {
    const checked = Boolean(widget.exportValue) && widget.fieldValue === widget.exportValue
    return (
      <input
        type="radio"
        className="form-field form-check"
        style={style}
        checked={checked}
        disabled
        readOnly
        onPointerDown={stop}
        onClick={stop}
      />
    )
  }

  // Altri pulsanti (push button): niente da mostrare.
  if (widget.fieldType === 'Btn') return null

  // Choice (dropdown)
  if (widget.fieldType === 'Ch' && widget.combo && widget.options) {
    const value = typeof stored === 'string' ? stored : widget.fieldValue ?? ''
    return (
      <select
        className="form-field"
        style={style}
        value={value}
        disabled={readOnly}
        onPointerDown={stop}
        onClick={stop}
        onChange={(e) => onChoice(e.target.value)}
      >
        <option value="" />
        {widget.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.displayValue}
          </option>
        ))}
      </select>
    )
  }

  // Testo (una o più righe)
  if (widget.fieldType === 'Tx') {
    const value = typeof stored === 'string' ? stored : widget.fieldValue ?? ''
    const common = {
      className: 'form-field',
      style,
      value,
      disabled: readOnly,
      onPointerDown: stop,
      onClick: stop
    }
    return widget.multiLine ? (
      <textarea {...common} onChange={(e) => onText(e.target.value)} />
    ) : (
      <input type="text" {...common} onChange={(e) => onText(e.target.value)} />
    )
  }

  return null
}
