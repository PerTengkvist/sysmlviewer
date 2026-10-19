import { useEffect, useMemo, useState } from 'react'
import type { ArtifactKind } from '../../api'

type Props = {
  open: boolean
  kinds: ArtifactKind[]
  enabled: Set<ArtifactKind>
  onChange: (enabled: Set<ArtifactKind>) => void
  onClose: () => void
}

export function ModelTreeFilterDialog({
  open,
  kinds,
  enabled,
  onChange,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<Set<ArtifactKind>>(() => new Set(enabled))

  useEffect(() => {
    if (open) setDraft(new Set(enabled))
  }, [open, enabled])

  const allSelected = useMemo(
    () => kinds.length > 0 && kinds.every((k) => draft.has(k)),
    [kinds, draft],
  )
  const someSelected = useMemo(
    () => kinds.some((k) => draft.has(k)) && !allSelected,
    [kinds, draft, allSelected],
  )

  if (!open) return null

  const commit = (next: Set<ArtifactKind>) => {
    setDraft(next)
    onChange(next)
  }

  const toggleAll = () => {
    if (allSelected) commit(new Set())
    else commit(new Set(kinds))
  }

  const toggleKind = (kind: ArtifactKind) => {
    const next = new Set(draft)
    if (next.has(kind)) next.delete(kind)
    else next.add(kind)
    commit(next)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-label="Filter Model tree"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Filter Model tree</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted settings-note">
            Choose which object types are visible in the Model tree. Default is
            all types.
          </p>
          <label className="settings-row model-tree-filter-all">
            <span>All types</span>
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected
              }}
              onChange={toggleAll}
              aria-label="Select all object types"
            />
          </label>
          <fieldset className="settings-fieldset model-tree-filter-kinds">
            <legend>Object types</legend>
            {kinds.length === 0 ? (
              <p className="muted">No object types in this project.</p>
            ) : (
              kinds.map((kind) => (
                <label key={kind} className="settings-row">
                  <span>{kind}</span>
                  <input
                    type="checkbox"
                    checked={draft.has(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                </label>
              ))
            )}
          </fieldset>
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
