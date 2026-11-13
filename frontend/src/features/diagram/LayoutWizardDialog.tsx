import { useMemo, useState } from 'react'
import type {
  LayerDirection,
  LayoutRuleRow,
  LayoutScope,
  LayoutScopeTarget,
  SemanticElement,
} from '../../api'
import { kindsInSemantic } from './viewFilters'
import { needsPeer, PLACEMENT_OPTIONS, type LayoutArtefact } from './layoutWizard'
import { BELONG_TO } from './layout/layoutConstraints'
import {
  LAYER_DIRECTIONS,
  layerDirectionLabel,
  layerDisplayName,
  MAX_LAYERS,
} from './layeredLayoutConfig'
import {
  addScope,
  findScopeConflicts,
  layoutScopeTargets,
  removeScope,
  scopeLabel,
  solveScopeRules,
  updateScope,
  usesLayers,
  withLayerCount,
} from './layoutScopes'
import { useDialogDraft } from './dialogDraft'

type Props = {
  open: boolean
  /** Saved scopes of this view, one tab each. */
  scopes: LayoutScope[]
  semantic: Record<string, SemanticElement>
  artefacts: LayoutArtefact[]
  /** Whitebox root on the diagram (part of "Whole diagram"), else null. */
  boundaryId: string | null
  onChangeScopes: (scopes: LayoutScope[]) => void
  onApplyPositions: (positions: Record<string, { x: number; y: number }>) => void
  /**
   * Apply when an enabled scope uses layers: run the hierarchic pipeline
   * with the scopes as constraints. Falls back to the plain solver.
   */
  onApplyLayered?: (scopes: LayoutScope[]) => void
  onClose: () => void
}

function newRuleId(): string {
  return `lr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const targetValue = (t: LayoutScopeTarget) => (t.kind === 'diagram' ? '*' : t.id)

export function LayoutWizardDialog({
  open,
  scopes,
  semantic,
  artefacts,
  boundaryId,
  onChangeScopes,
  onApplyPositions,
  onApplyLayered,
  onClose,
}: Props) {
  const kinds = useMemo(() => kindsInSemantic(semantic), [semantic])
  // Seeded from the saved scopes when the dialog opens; the echo of each
  // save while it is open must not replace the draft or the selected tab.
  const [draft, setDraft] = useDialogDraft(open, scopes)
  const [selectedId, setSelectedId] = useState('')
  const [adding, setAdding] = useState(false)
  const [conflictIds, setConflictIds] = useState<string[]>([])
  const [error, setError] = useState('')

  if (!open) return null

  const active = draft.find((s) => s.id === selectedId) ?? draft[0] ?? null
  const freeTargets = layoutScopeTargets(artefacts, boundaryId, draft)

  /** Edit the draft; `save` also stores it (text inputs save on blur). */
  const edit = (next: LayoutScope[], save = true) => {
    setDraft(next)
    if (save) onChangeScopes(next)
    setConflictIds([])
    setError('')
  }
  const saveDraft = () => onChangeScopes(draft)
  const editActive = (fn: (s: LayoutScope) => LayoutScope, save = true) => {
    if (active) edit(updateScope(draft, active.id, fn), save)
  }

  const addTarget = (value: string) => {
    const target = freeTargets.find((t) => targetValue(t) === value)
    if (!target) return
    const next = addScope(draft, target)
    edit(next)
    setSelectedId(next[next.length - 1].id)
    setAdding(false)
  }

  const closeScope = (id: string) => {
    const index = draft.findIndex((s) => s.id === id)
    const next = removeScope(draft, id)
    edit(next)
    if (active?.id === id) setSelectedId(next[Math.max(0, index - 1)]?.id ?? '')
  }

  const layerNames = (active?.layering.layers ?? []).map((l, i) => layerDisplayName(l, i))
  const layering = active?.layering
  const layersOn = !!layering?.enabled

  const updateRow = (id: string, patch: Partial<LayoutRuleRow>, save = true) => {
    editActive(
      (s) => ({
        ...s,
        rules: s.rules.map((r) => {
          if (r.id !== id) return r
          const next = { ...r, ...patch }
          if (patch.placement && !needsPeer(patch.placement)) {
            next.peerKind = null
            next.peerNamePattern = null
          } else if (patch.placement === BELONG_TO) {
            next.peerKind = 'layer'
            next.peerNamePattern = layerNames[0] ?? '1'
          } else if (patch.placement && r.placement === BELONG_TO) {
            next.peerKind = kinds[0] || 'part'
            next.peerNamePattern = '*'
          }
          return next
        }),
      }),
      save,
    )
  }

  const addRow = () => {
    const kind = kinds[0] || 'part'
    editActive((s) => ({
      ...s,
      rules: [
        ...s.rules,
        {
          id: newRuleId(),
          kind,
          namePattern: '*',
          placement: 'below',
          peerKind: kind,
          peerNamePattern: '*',
        },
      ],
    }))
  }

  const removeRow = (id: string) => {
    editActive((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== id) }))
  }

  const apply = () => {
    const conflict = findScopeConflicts(draft, artefacts, boundaryId)
    if (conflict.rowIds.length) {
      if (conflict.scopeId) setSelectedId(conflict.scopeId)
      setConflictIds(conflict.rowIds)
      setError(conflict.message)
      return
    }
    setConflictIds([])
    setError('')
    if (usesLayers(draft) && onApplyLayered) {
      onApplyLayered(draft)
      return
    }
    onApplyPositions(solveScopeRules(draft, artefacts, boundaryId))
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
          <h2>Layout Rules</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="canvas-tab-bar layout-scope-tabs" role="tablist" aria-label="Scopes">
            {draft.map((s) => {
              const label = scopeLabel(s.target, artefacts)
              const selected = s.id === active?.id
              return (
                <div
                  key={s.id}
                  className={`canvas-tab${selected ? ' active' : ''}${s.enabled ? '' : ' disabled-scope'}`}
                >
                  <button
                    type="button"
                    role="tab"
                    className="canvas-tab-label"
                    data-testid={`lw-scope-tab-${s.id}`}
                    aria-selected={selected}
                    onClick={() => setSelectedId(s.id)}
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    className="canvas-tab-close"
                    data-testid={`lw-scope-close-${s.id}`}
                    aria-label={`Remove scope ${label}`}
                    onClick={() => closeScope(s.id)}
                  >
                    ×
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              className="canvas-tab-label"
              data-testid="lw-scope-add"
              aria-label="Add scope"
              title="Add a scope for the whole diagram, a package or a part with children"
              disabled={!freeTargets.length}
              onClick={() => setAdding((v) => !v)}
            >
              +
            </button>
            {adding && (
              <select
                data-testid="lw-scope-target"
                aria-label="Scope target"
                value=""
                onChange={(e) => addTarget(e.target.value)}
              >
                <option value="">Choose what to arrange…</option>
                {freeTargets.map((t) => (
                  <option key={targetValue(t)} value={targetValue(t)}>
                    {scopeLabel(t, artefacts)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {!active && (
            <p className="muted settings-note">
              No scopes yet. Use + to arrange the whole diagram, a package or a
              part with children by its own rules and layers.
            </p>
          )}

          {active && layering && (
            <>
              <label className="settings-row">
                <span>Enable</span>
                <input
                  type="checkbox"
                  data-testid="lw-scope-enabled"
                  checked={active.enabled}
                  onChange={(e) => editActive((s) => ({ ...s, enabled: e.target.checked }))}
                />
              </label>
              <p className="muted settings-note">
                Rules and layers below arrange the direct children of{' '}
                {active.target.kind === 'diagram'
                  ? 'the diagram (its top level)'
                  : scopeLabel(active.target, artefacts)}
                .{active.enabled ? '' : ' This scope is off: AutoLayout and Apply ignore it.'}
              </p>
              <fieldset className="settings-fieldset layered-layout-fieldset">
                <legend>Layers</legend>
                <label className="settings-row">
                  <span>Use layers</span>
                  <input
                    type="checkbox"
                    data-testid="lw-layered-enabled"
                    checked={layersOn}
                    onChange={(e) =>
                      editActive((s) => ({
                        ...s,
                        layering: {
                          ...s.layering,
                          enabled: e.target.checked,
                          layers:
                            e.target.checked && !s.layering.layers.length
                              ? withLayerCount([], 3, MAX_LAYERS)
                              : s.layering.layers,
                        },
                      }))
                    }
                  />
                </label>
                <label className="settings-row">
                  <span>Direction</span>
                  <select
                    data-testid="lw-direction"
                    value={layering.direction}
                    disabled={!layersOn}
                    onChange={(e) =>
                      editActive((s) => ({
                        ...s,
                        layering: { ...s.layering, direction: e.target.value as LayerDirection },
                      }))
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
                    value={layering.layers.length}
                    disabled={!layersOn}
                    onChange={(e) =>
                      editActive((s) => ({
                        ...s,
                        layering: {
                          ...s.layering,
                          layers: withLayerCount(s.layering.layers, Number(e.target.value), MAX_LAYERS),
                        },
                      }))
                    }
                  />
                </label>
                {layersOn && (
                  <div className="layer-name-grid">
                    {layering.layers.map((layer, i) => (
                      <label key={layer.id} className="settings-row">
                        <span>Layer {i + 1}</span>
                        <input
                          className="inline-edit"
                          data-testid={`lw-layer-name-${i}`}
                          placeholder={String(i + 1)}
                          value={layer.name}
                          aria-label={`Layer ${i + 1} name`}
                          onChange={(e) =>
                            editActive(
                              (s) => ({
                                ...s,
                                layering: {
                                  ...s.layering,
                                  layers: s.layering.layers.map((l, j) =>
                                    j === i ? { ...l, name: e.target.value } : l,
                                  ),
                                },
                              }),
                              false,
                            )
                          }
                          onBlur={saveDraft}
                        />
                      </label>
                    ))}
                  </div>
                )}
                <p className="muted settings-note">
                  {layersOn
                    ? `${layering.layers.length} ${
                        layering.direction === 'top-down' || layering.direction === 'bottom-up'
                          ? 'horizontal bands'
                          : 'vertical columns'
                      }. Pin children to a layer with “belong to” rules; the others are placed by their connections. Apply runs the Hierarchic placement.`
                    : 'Turn on to arrange the children in named layers.'}
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
                  {active.rules.map((row) => {
                    const peerDisabled = !needsPeer(row.placement)
                    const isBelongTo = row.placement === BELONG_TO
                    const conflicted = conflictIds.includes(row.id)
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
                            onChange={(e) => updateRow(row.id, { kind: e.target.value })}
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
                              updateRow(row.id, { namePattern: e.target.value }, false)
                            }
                            onBlur={saveDraft}
                            aria-label="Name pattern"
                          />
                        </td>
                        <td>
                          <select
                            value={row.placement}
                            onChange={(e) => updateRow(row.id, { placement: e.target.value })}
                            aria-label="Placement rule"
                          >
                            {PLACEMENT_OPTIONS.filter(
                              (p) => p !== BELONG_TO || layersOn || isBelongTo,
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
                              <option value="layer">layer</option>
                            </select>
                          ) : (
                            <select
                              value={row.peerKind || ''}
                              disabled={peerDisabled}
                              onChange={(e) =>
                                updateRow(row.id, { peerKind: e.target.value || null })
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
                                updateRow(row.id, { peerNamePattern: e.target.value || null })
                              }
                              aria-label="Layer name"
                            >
                              {row.peerNamePattern && !layerNames.includes(row.peerNamePattern) && (
                                <option value={row.peerNamePattern}>
                                  {row.peerNamePattern} (unknown)
                                </option>
                              )}
                              {layerNames.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="inline-edit"
                              value={row.peerNamePattern || ''}
                              disabled={peerDisabled}
                              onChange={(e) =>
                                updateRow(row.id, { peerNamePattern: e.target.value || null }, false)
                              }
                              onBlur={saveDraft}
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
            </>
          )}
          <div className="modal-actions">
            <button
              type="button"
              onClick={addRow}
              aria-label="Add rule row"
              data-testid="lw-add-row"
              disabled={!active}
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
