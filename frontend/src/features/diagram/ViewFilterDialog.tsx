import { useEffect, useMemo, useState } from 'react'
import type { SemanticElement, ViewFilterRow } from '../../api'
import { kindsInSemantic, type ViewFilterMatchField } from './viewFilters'

type Props = {
  open: boolean
  filters: ViewFilterRow[]
  semantic: Record<string, SemanticElement>
  onChange: (filters: ViewFilterRow[]) => void
  onClose: () => void
}

const MATCH_FIELDS: ViewFilterMatchField[] = ['name', 'stereotype', 'any']

function newFilterId(): string {
  return `vf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ViewFilterDialog({
  open,
  filters,
  semantic,
  onChange,
  onClose,
}: Props) {
  const kinds = useMemo(() => kindsInSemantic(semantic), [semantic])
  const [draft, setDraft] = useState<ViewFilterRow[]>(filters)

  useEffect(() => {
    if (open) setDraft(filters)
  }, [open, filters])

  if (!open) return null

  const updateRow = (id: string, patch: Partial<ViewFilterRow>) => {
    const next = draft.map((r) => (r.id === id ? { ...r, ...patch } : r))
    setDraft(next)
    onChange(next)
  }

  const addRow = () => {
    const kind = kinds[0] || 'part'
    const next = [
      ...draft,
      {
        id: newFilterId(),
        kind,
        matchField: 'name' as const,
        namePattern: '*',
        enabled: false,
      },
    ]
    setDraft(next)
    onChange(next)
  }

  const removeRow = (id: string) => {
    const next = draft.filter((r) => r.id !== id)
    setDraft(next)
    onChange(next)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-view-filter"
        role="dialog"
        aria-label="Filter out artefacts in view"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Filter out artefacts in view</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted settings-note">
            Enabled rows hide matching artefacts (and relations to them) in this
            view. Pattern <code>*</code> is a wildcard. Field chooses whether to
            match name, stereotype, or either.
          </p>
          <table className="requirement-table">
            <thead>
              <tr>
                <th>Artefact</th>
                <th>Field</th>
                <th>Pattern</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.map((row) => (
                <tr key={row.id}>
                  <td>
                    <select
                      value={row.kind}
                      onChange={(e) =>
                        updateRow(row.id, { kind: e.target.value })
                      }
                      aria-label="Artefact kind"
                    >
                      {!kinds.includes(row.kind) && (
                        <option value={row.kind}>{row.kind}</option>
                      )}
                      {kinds.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.matchField || 'name'}
                      onChange={(e) =>
                        updateRow(row.id, {
                          matchField: e.target.value as ViewFilterMatchField,
                        })
                      }
                      aria-label="Match field"
                    >
                      {MATCH_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="inline-edit"
                      value={row.namePattern}
                      onChange={(e) =>
                        updateRow(row.id, { namePattern: e.target.value })
                      }
                      aria-label="Filter pattern"
                    />
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) =>
                          updateRow(row.id, { enabled: e.target.checked })
                        }
                        aria-label="Filter status"
                      />{' '}
                      on
                    </label>
                  </td>
                  <td>
                    <button type="button" onClick={() => removeRow(row.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addRow} aria-label="Add filter row">
            +
          </button>
        </div>
      </div>
    </div>
  )
}
