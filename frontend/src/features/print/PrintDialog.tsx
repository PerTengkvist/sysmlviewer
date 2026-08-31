import { useEffect, useState } from 'react'
import type { ProjectSheet } from '../sheet/sheet'
import {
  clearAllSelections,
  defaultPrintSelection,
  selectAllDiagrams,
  type PrintDiagramRef,
  type PrintMode,
  type PrintSelection,
} from './printLayout'

type Props = {
  open: boolean
  diagrams: PrintDiagramRef[]
  activeViewId: string | null
  sheet: ProjectSheet
  onClose: () => void
  onPrint: (options: {
    selected: PrintSelection
    mode: PrintMode
    includeDescriptions: boolean
  }) => void
}

export function PrintDialog({
  open,
  diagrams,
  activeViewId,
  sheet: _sheet,
  onClose,
  onPrint,
}: Props) {
  const [selected, setSelected] = useState<PrintSelection>({})
  const [mode, setMode] = useState<PrintMode>('separatePages')
  const [includeDescriptions, setIncludeDescriptions] = useState(false)

  useEffect(() => {
    if (open) {
      setSelected(defaultPrintSelection(diagrams, activeViewId))
      setMode('separatePages')
      setIncludeDescriptions(false)
    }
  }, [open, diagrams, activeViewId])

  if (!open) return null

  const toggle = (id: string) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-label="Print diagrams"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Print</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="modal-actions" style={{ marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setSelected(selectAllDiagrams(diagrams))}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelected(clearAllSelections(diagrams))}
            >
              Clear All
            </button>
          </div>
          <ul className="print-diagram-list">
            {diagrams.map((d) => (
              <li key={d.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!selected[d.id]}
                    onChange={() => toggle(d.id)}
                  />{' '}
                  {d.name}
                </label>
              </li>
            ))}
          </ul>
          <label className="settings-row">
            <span>Layout</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as PrintMode)}
            >
              <option value="separatePages">separate pages</option>
              <option value="saveSpace">save space</option>
              <option value="selectedOnOnePage">selected diagrams on a page</option>
            </select>
          </label>
          <label className="settings-row print-include-docs">
            <span>Include descriptions</span>
            <input
              type="checkbox"
              checked={includeDescriptions}
              onChange={(e) => setIncludeDescriptions(e.target.checked)}
            />
            <span className="muted">Rendered markdown for each view</span>
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={() =>
                onPrint({ selected, mode, includeDescriptions })
              }
            >
              Print
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
