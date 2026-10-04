import { useEffect, useMemo, useState } from 'react'
import type { LayoutRuleRow, SemanticElement } from '../../api'
import { kindsInSemantic } from './viewFilters'
import {
  findLayoutConflicts,
  needsPeer,
  PLACEMENT_OPTIONS,
  solveLayoutRules,
  type LayoutArtefact,
} from './layoutWizard'

type Props = {
  open: boolean
  rules: LayoutRuleRow[]
  semantic: Record<string, SemanticElement>
  artefacts: LayoutArtefact[]
  onChangeRules: (rules: LayoutRuleRow[]) => void
  onApplyPositions: (
    positions: Record<string, { x: number; y: number }>,
  ) => void
  onClose: () => void
}

function newRuleId(): string {
  return `lr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function LayoutWizardDialog({
  open,
  rules,
  semantic,
  artefacts,
  onChangeRules,
  onApplyPositions,
  onClose,
}: Props) {
  const kinds = useMemo(() => kindsInSemantic(semantic), [semantic])
  const [draft, setDraft] = useState<LayoutRuleRow[]>(rules)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(rules)
      setConflictIds([])
      setError('')
    }
  }, [open, rules])

  if (!open) return null

  const commit = (next: LayoutRuleRow[]) => {
    setDraft(next)
    onChangeRules(next)
    setConflictIds([])
    setError('')
  }

  const updateRow = (id: string, patch: Partial<LayoutRuleRow>) => {
    commit(
      draft.map((r) => {
        if (r.id !== id) return r
        const next = { ...r, ...patch }
        if (patch.placement && !needsPeer(patch.placement)) {
          next.peerKind = null
          next.peerNamePattern = null
        }
        return next
      }),
    )
  }

  const addRow = () => {
    const kind = kinds[0] || 'part'
    commit([
      ...draft,
      {
        id: newRuleId(),
        kind,
        namePattern: '*',
        placement: 'below',
        peerKind: kind,
        peerNamePattern: '*',
      },
    ])
  }

  const removeRow = (id: string) => {
    commit(draft.filter((r) => r.id !== id))
  }

  const apply = () => {
    const conflict = findLayoutConflicts(draft, artefacts)
    if (conflict.rowIds.length) {
      setConflictIds(conflict.rowIds)
      setError(conflict.message)
      return
    }
    setConflictIds([])
    setError('')
    const positions = solveLayoutRules(artefacts, draft)
    onApplyPositions(positions)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-layout-wizard"
        role="dialog"
        aria-label="LayoutWizard"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>LayoutWizard</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted settings-note">
            Relative placement rules. Absolute rules (top, bottom, leftmost,
            rightmost) do not use a peer. Name <code>*</code> matches all names.
          </p>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <table className="requirement-table">
            <thead>
              <tr>
                <th />
                <th>Artefact</th>
                <th>Name</th>
                <th>Placement rule</th>
                <th>Peer artefact</th>
                <th>Peer name</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.map((row) => {
                const peerDisabled = !needsPeer(row.placement)
                const conflicted = conflictIds.includes(row.id)
                return (
                  <tr key={row.id}>
                    <td>
                      {conflicted && (
                        <span
                          className="layout-conflict-mark"
                          title="Conflicting rule"
                          aria-label="Conflict"
                        >
                          !
                        </span>
                      )}
                    </td>
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
                      <input
                        className="inline-edit"
                        value={row.namePattern}
                        onChange={(e) =>
                          updateRow(row.id, { namePattern: e.target.value })
                        }
                        aria-label="Name pattern"
                      />
                    </td>
                    <td>
                      <select
                        value={row.placement}
                        onChange={(e) =>
                          updateRow(row.id, { placement: e.target.value })
                        }
                        aria-label="Placement rule"
                      >
                        {PLACEMENT_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.peerKind || ''}
                        disabled={peerDisabled}
                        onChange={(e) =>
                          updateRow(row.id, {
                            peerKind: e.target.value || null,
                          })
                        }
                        aria-label="Peer artefact"
                      >
                        <option value="">—</option>
                        {kinds.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="inline-edit"
                        value={row.peerNamePattern || ''}
                        disabled={peerDisabled}
                        onChange={(e) =>
                          updateRow(row.id, {
                            peerNamePattern: e.target.value || null,
                          })
                        }
                        aria-label="Peer name"
                      />
                    </td>
                    <td>
                      <button type="button" onClick={() => removeRow(row.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="modal-actions">
            <button type="button" onClick={addRow} aria-label="Add rule row">
              +
            </button>
            <button type="button" onClick={apply}>
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
