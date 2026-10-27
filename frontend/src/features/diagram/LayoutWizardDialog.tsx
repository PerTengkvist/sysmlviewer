import { useEffect, useMemo, useState } from 'react'
import type {
  LayerDirection,
  LayeredLayoutConfig,
  LayoutRuleRow,
  SemanticElement,
} from '../../api'
import { kindsInSemantic } from './viewFilters'
import {
  findLayoutConflicts,
  needsPeer,
  PLACEMENT_OPTIONS,
  solveLayoutRules,
  type LayoutArtefact,
} from './layoutWizard'
import { BELONG_TO } from './layout/layoutConstraints'
import { matchName } from './namePattern'
import {
  addScope,
  containerNames,
  defaultLayeredLayout,
  LAYER_DIRECTIONS,
  layerDirectionLabel,
  layerDisplayName,
  layerNameOptionsFor,
  MAX_LAYERS,
  normalizeLayeredLayout,
  removeScope,
  ROOT_SCOPE_PATTERN,
  rootScope,
  scopeForArtefact,
  withScopeDirection,
  withScopeLayerCount,
  withScopeLayerName,
  withScopePattern,
} from './layeredLayoutConfig'

type Props = {
  open: boolean
  rules: LayoutRuleRow[]
  /** Per-view layered layout config (null = never configured). */
  layered?: LayeredLayoutConfig | null
  semantic: Record<string, SemanticElement>
  artefacts: LayoutArtefact[]
  onChangeRules: (rules: LayoutRuleRow[]) => void
  onChangeLayered?: (layered: LayeredLayoutConfig) => void
  onApplyPositions: (
    positions: Record<string, { x: number; y: number }>,
  ) => void
  /**
   * Apply with layered layout enabled: run the hierarchic pipeline with the
   * rules as constraints. Falls back to the plain solver when absent.
   */
  onApplyLayered?: (layered: LayeredLayoutConfig, rules: LayoutRuleRow[]) => void
  onClose: () => void
}

function newRuleId(): string {
  return `lr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function LayoutWizardDialog({
  open,
  rules,
  layered,
  semantic,
  artefacts,
  onChangeRules,
  onChangeLayered,
  onApplyPositions,
  onApplyLayered,
  onClose,
}: Props) {
  const kinds = useMemo(() => kindsInSemantic(semantic), [semantic])
  const [draft, setDraft] = useState<LayoutRuleRow[]>(rules)
  const [layeredDraft, setLayeredDraft] = useState<LayeredLayoutConfig>(
    layered ? normalizeLayeredLayout(layered) : defaultLayeredLayout(),
  )
  const [scopeId, setScopeId] = useState<string>('')
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      const next = layered ? normalizeLayeredLayout(layered) : defaultLayeredLayout()
      setDraft(rules)
      setLayeredDraft(next)
      setScopeId(rootScope(next).id)
      setConflictIds([])
      setError('')
    }
  }, [open, rules, layered])

  const selectedScope =
    layeredDraft.scopes.find((s) => s.id === scopeId) ?? rootScope(layeredDraft)
  const isRootScope = selectedScope.scopePattern === ROOT_SCOPE_PATTERN
  const containers = useMemo(() => containerNames(artefacts), [artefacts])

  /** Scope that applies to a rule row's subjects (first match decides). */
  const scopeForRow = (row: LayoutRuleRow) => {
    const subject = artefacts.find(
      (a) => a.kind === row.kind && matchName(row.namePattern || '*', a.name),
    )
    return subject ? scopeForArtefact(layeredDraft, subject, artefacts) : rootScope(layeredDraft)
  }

  const partsWithoutLayerRule = useMemo(() => {
    if (!layeredDraft.enabled) return 0
    const covered = new Set<string>()
    for (const r of draft) {
      if (r.placement !== BELONG_TO) continue
      for (const a of artefacts) {
        if (a.kind === r.kind && matchName(r.namePattern || '*', a.name)) {
          covered.add(a.id)
        }
      }
    }
    return artefacts.filter(
      (a) =>
        a.kind === 'part' &&
        !covered.has(a.id) &&
        scopeForArtefact(layeredDraft, a, artefacts)?.id === selectedScope.id,
    ).length
  }, [draft, artefacts, layeredDraft, selectedScope.id])

  const unmatchedScope =
    !isRootScope &&
    !containers.some((name) => matchName(selectedScope.scopePattern, name))

  if (!open) return null

  const commit = (next: LayoutRuleRow[]) => {
    setDraft(next)
    onChangeRules(next)
    setConflictIds([])
    setError('')
  }

  const commitLayered = (next: LayeredLayoutConfig) => {
    setLayeredDraft(next)
    onChangeLayered?.(next)
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
        } else if (patch.placement === BELONG_TO) {
          next.peerKind = 'layer'
          next.peerNamePattern = layerNameOptionsFor(scopeForRow(next))[0] ?? '1'
        } else if (patch.placement && r.placement === BELONG_TO) {
          next.peerKind = kinds[0] || 'part'
          next.peerNamePattern = '*'
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
    const conflict = findLayoutConflicts(draft, artefacts, layeredDraft)
    if (conflict.rowIds.length) {
      setConflictIds(conflict.rowIds)
      setError(conflict.message)
      return
    }
    setConflictIds([])
    setError('')
    if (layeredDraft.enabled && onApplyLayered) {
      onApplyLayered(layeredDraft, draft)
      return
    }
    const positions = solveLayoutRules(artefacts, draft)
    onApplyPositions(positions)
  }

  const scopeLabel = (pattern: string) =>
    pattern === ROOT_SCOPE_PATTERN ? 'Whole diagram' : `Part ${pattern}`

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-layout-wizard"
        role="dialog"
        aria-label="LayoutWizard"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Layout Rules</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <fieldset className="settings-fieldset layered-layout-fieldset">
            <legend>Layered layout</legend>
            <label className="settings-row">
              <span>Enable</span>
              <input
                type="checkbox"
                data-testid="lw-layered-enabled"
                checked={layeredDraft.enabled}
                onChange={(e) =>
                  commitLayered({ ...layeredDraft, enabled: e.target.checked })
                }
              />
            </label>
            <div className="settings-row">
              <span>Scope</span>
              <span className="layered-scope-controls">
                <select
                  data-testid="lw-scope-select"
                  value={selectedScope.id}
                  disabled={!layeredDraft.enabled}
                  aria-label="Layered scope"
                  onChange={(e) => setScopeId(e.target.value)}
                >
                  {layeredDraft.scopes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {scopeLabel(s.scopePattern)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="lw-scope-add"
                  disabled={!layeredDraft.enabled}
                  title="Add a scope for the children of a container part"
                  onClick={() => {
                    const used = new Set(layeredDraft.scopes.map((s) => s.scopePattern))
                    const pattern = containers.find((n) => !used.has(n)) ?? containers[0] ?? '*'
                    const next = addScope(layeredDraft, pattern)
                    commitLayered(next)
                    setScopeId(next.scopes[next.scopes.length - 1].id)
                  }}
                >
                  + Scope
                </button>
                <button
                  type="button"
                  data-testid="lw-scope-remove"
                  disabled={!layeredDraft.enabled || isRootScope}
                  onClick={() => {
                    const next = removeScope(layeredDraft, selectedScope.id)
                    commitLayered(next)
                    setScopeId(rootScope(next).id)
                  }}
                >
                  Remove
                </button>
              </span>
            </div>
            {!isRootScope && (
              <label className="settings-row">
                <span>Container</span>
                <input
                  className="inline-edit"
                  data-testid="lw-scope-pattern"
                  list="lw-container-names"
                  value={selectedScope.scopePattern}
                  disabled={!layeredDraft.enabled}
                  aria-label="Scope container pattern"
                  onChange={(e) =>
                    commitLayered(
                      withScopePattern(layeredDraft, selectedScope.id, e.target.value),
                    )
                  }
                />
                <datalist id="lw-container-names">
                  {containers.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
            )}
            <label className="settings-row">
              <span>Direction</span>
              <select
                data-testid="lw-direction"
                value={selectedScope.direction}
                disabled={!layeredDraft.enabled}
                onChange={(e) =>
                  commitLayered(
                    withScopeDirection(
                      layeredDraft,
                      selectedScope.id,
                      e.target.value as LayerDirection,
                    ),
                  )
                }
              >
                {LAYER_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {layerDirectionLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-row">
              <span>Layers</span>
              <input
                type="number"
                data-testid="lw-layer-count"
                min={1}
                max={MAX_LAYERS}
                value={selectedScope.layers.length}
                disabled={!layeredDraft.enabled}
                onChange={(e) =>
                  commitLayered(
                    withScopeLayerCount(
                      layeredDraft,
                      selectedScope.id,
                      Number(e.target.value),
                    ),
                  )
                }
              />
            </label>
            {layeredDraft.enabled && (
              <div className="layer-name-grid">
                {selectedScope.layers.map((layer, i) => (
                  <label key={layer.id} className="settings-row">
                    <span>Layer {i + 1}</span>
                    <input
                      className="inline-edit"
                      data-testid={`lw-layer-name-${i}`}
                      placeholder={String(i + 1)}
                      value={layer.name}
                      aria-label={`Layer ${i + 1} name`}
                      onChange={(e) =>
                        commitLayered(
                          withScopeLayerName(
                            layeredDraft,
                            selectedScope.id,
                            i,
                            e.target.value,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            {layeredDraft.enabled && unmatchedScope && (
              <p className="error-text" role="status">
                No container in this view matches “{selectedScope.scopePattern}”.
              </p>
            )}
            <p className="muted settings-note">
              {layeredDraft.enabled
                ? `${scopeLabel(selectedScope.scopePattern)}: ${selectedScope.layers.length} ${
                    selectedScope.direction === 'top-down' ||
                    selectedScope.direction === 'bottom-up'
                      ? 'horizontal bands'
                      : 'vertical columns'
                  }; each part takes 50% of its band and bands are centred on a common axis. Use “belong to” rules below to pin parts to a layer of their container's scope. ${partsWithoutLayerRule} part(s) in this scope without a rule will be auto-assigned by their connections. Apply runs the Hierarchic placement with these rules as constraints.`
                : 'Enable to arrange parts in named layers (top-down, bottom-up, left-right or right-left), per diagram or inside a container part, and pin parts to layers with “belong to” rules.'}
            </p>
          </fieldset>
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
                const isBelongTo = row.placement === BELONG_TO
                const conflicted = conflictIds.includes(row.id)
                const rowScope = isBelongTo ? scopeForRow(row) : null
                const rowLayerNames = layerNameOptionsFor(rowScope)
                return (
                  <tr key={row.id} data-testid="lw-row">
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
                        {PLACEMENT_OPTIONS.filter(
                          (p) => p !== BELONG_TO || layeredDraft.enabled || isBelongTo,
                        ).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {isBelongTo ? (
                        <select value="layer" disabled aria-label="Peer artefact">
                          <option value="layer">
                            layer ({rowScope ? scopeLabel(rowScope.scopePattern) : '—'})
                          </option>
                        </select>
                      ) : (
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
                      )}
                    </td>
                    <td>
                      {isBelongTo ? (
                        <select
                          value={row.peerNamePattern || ''}
                          onChange={(e) =>
                            updateRow(row.id, {
                              peerNamePattern: e.target.value || null,
                            })
                          }
                          aria-label="Layer name"
                        >
                          {row.peerNamePattern &&
                            !rowLayerNames.includes(row.peerNamePattern) && (
                              <option value={row.peerNamePattern}>
                                {row.peerNamePattern} (unknown)
                              </option>
                            )}
                          {(rowScope?.layers ?? []).map((l, i) => (
                            <option key={l.id} value={layerDisplayName(l, i)}>
                              {layerDisplayName(l, i)}
                            </option>
                          ))}
                        </select>
                      ) : (
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
                      )}
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
            <button
              type="button"
              onClick={addRow}
              aria-label="Add rule row"
              data-testid="lw-add-row"
            >
              +
            </button>
            <button type="button" onClick={apply} data-testid="lw-apply">
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
