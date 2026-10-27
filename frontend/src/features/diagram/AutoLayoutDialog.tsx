import { useEffect, useState } from 'react'
import {
  clampHierarchicOptions,
  clampLevelWeights,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  LAYOUT_LEVELS,
  LAYOUT_WEIGHT_KEYS,
  layoutLevelLabel,
  layoutWeightLabel,
  PORT_PLACEMENT_MODES,
  portPlacementLabel,
  portPlacementNote,
  SUGGESTED_LEVEL_WEIGHTS,
  type AutoLayoutDirectives,
  type AutoLayoutUiMode,
  type HierarchicOptions,
  type LayoutLevel,
  type LayoutWeightKey,
  type PlacementAlgorithm,
  type PortPlacementMode,
  type SpacingPreset,
} from './layout/autoLayoutOptions'
import {
  PIPELINE_IDS,
  pipelineLabel,
  resolvePlacementPipeline,
  type PlacementPipelineId,
} from './layout/placementPipelines'

type Props = {
  open: boolean
  initial?: AutoLayoutDirectives
  busy?: boolean
  onCancel: () => void
  onConfirm: (directives: AutoLayoutDirectives) => void
}

export function AutoLayoutDialog({
  open,
  initial,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const [directives, setDirectives] = useState<AutoLayoutDirectives>(
    initial || DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  )

  useEffect(() => {
    if (open) {
      setDirectives(initial || DEFAULT_AUTO_LAYOUT_DIRECTIVES)
    }
  }, [open, initial])

  if (!open) return null

  const patch = (partial: Partial<AutoLayoutDirectives>) => {
    setDirectives((d) => ({ ...d, ...partial }))
  }

  const uiMode: AutoLayoutUiMode = directives.mode || 'simple'
  const resolved = resolvePlacementPipeline(directives)
  const isCustom = uiMode === 'advanced' && resolved.id === 'custom'
  const isHierarchic = uiMode === 'advanced' && resolved.id === 'hierarchic'
  const hierarchic = clampHierarchicOptions(directives.hierarchic)
  const portsRestricted = directives.portPlacement !== 'optimized'
  const patchHierarchic = (partial: Partial<HierarchicOptions>) =>
    patch({ hierarchic: { ...hierarchic, ...partial } })
  const customWeights = clampLevelWeights(directives.customWeights)
  const isCompositionAlgo =
    directives.algorithm === 'clustered' ||
    directives.algorithm === 'favour-grid' ||
    resolved.id === 'clustered' ||
    resolved.id === 'favour-grid'
  const showAspect =
    uiMode === 'simple'
      ? directives.algorithm === 'stress' || isCompositionAlgo
      : isCustom ||
        resolved.elkAlgorithm === 'stress' ||
        resolved.elkAlgorithm === 'force' ||
        isCompositionAlgo

  const patchWeight = (
    level: LayoutLevel,
    key: LayoutWeightKey,
    value: number,
  ) => {
    patch({
      customWeights: {
        ...customWeights,
        [level]: {
          ...customWeights[level],
          [key]: value,
        },
      },
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-label="AutoLayout directives"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>AutoLayout</h2>
          <button type="button" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted settings-note">
            Choose how parts and ports are placed, then how connections are
            routed. Changes apply when you run layout.
          </p>

          <fieldset className="settings-fieldset">
            <legend>Mode</legend>
            <label className="settings-row">
              <span>UI</span>
              <select
                data-testid="al-mode"
                value={uiMode}
                onChange={(e) =>
                  patch({ mode: e.target.value as AutoLayoutUiMode })
                }
              >
                <option value="simple">Simple</option>
                <option value="advanced">Advanced</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="settings-fieldset">
            <legend>Port placement</legend>
            <label className="settings-row">
              <span>Mode</span>
              <select
                data-testid="al-port-placement"
                value={directives.portPlacement}
                onChange={(e) =>
                  patch({
                    portPlacement: e.target.value as PortPlacementMode,
                  })
                }
              >
                {PORT_PLACEMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {portPlacementLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted settings-note">
              {portPlacementNote(directives.portPlacement)} Every placement
              algorithm follows this mode.
            </p>
          </fieldset>

          {uiMode === 'simple' ? (
            <fieldset className="settings-fieldset">
              <legend>Part placement</legend>
              <label className="settings-row">
                <span>Algorithm</span>
                <select
                  data-testid="al-algorithm"
                  value={directives.algorithm}
                  onChange={(e) =>
                    patch({
                      algorithm: e.target.value as PlacementAlgorithm,
                    })
                  }
                >
                  <option value="favour-grid">
                    Favour grid (matrix at N≥4)
                  </option>
                  <option value="clustered">
                    Clustered (packed core at N≥4)
                  </option>
                  <option value="stress">
                    Stress (2D, hubs toward center)
                  </option>
                  <option value="layered">Layered (left → right)</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Spacing</span>
                <select
                  data-testid="al-spacing"
                  value={directives.spacing}
                  onChange={(e) =>
                    patch({ spacing: e.target.value as SpacingPreset })
                  }
                >
                  <option value="compact">Compact (15%)</option>
                  <option value="normal">Normal (20%)</option>
                  <option value="spacious">Spacious (25%)</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Aspect ratio</span>
                <select
                  value={String(directives.aspectRatio)}
                  onChange={(e) =>
                    patch({ aspectRatio: Number(e.target.value) || 1 })
                  }
                  disabled={!showAspect}
                >
                  <option value="1">Square (1:1)</option>
                  <option value="1.4">Wide (1.4:1)</option>
                  <option value="0.75">Tall (0.75:1)</option>
                </select>
              </label>
              <p className="muted settings-note">
                {directives.algorithm === 'favour-grid'
                  ? 'Favour grid: 1→center+25%, 2→stack, 3→onion, 4+→matrix (orphans fill grid). Combines with port mode above.'
                  : directives.algorithm === 'clustered'
                    ? 'Clustered: same as favour-grid for N≤3; at N≥4 a dense core of 1–4 parts with the rest packed in rings around it, leaving channels for connections. Combines with port mode above.'
                    : `Runs pipeline “${pipelineLabel(resolved.id)}” with nest-fit and hard non-overlap. Routing is always orthogonal after placement.`}
              </p>
            </fieldset>
          ) : (
            <fieldset className="settings-fieldset">
              <legend>Placement pipeline</legend>
              <label className="settings-row">
                <span>Pipeline</span>
                <select
                  data-testid="al-pipeline"
                  value={directives.pipeline || resolved.id}
                  onChange={(e) =>
                    patch({
                      pipeline: e.target.value as PlacementPipelineId,
                    })
                  }
                >
                  {PIPELINE_IDS.map((id) => (
                    <option key={id} value={id}>
                      {pipelineLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="settings-row">
                <span>Spacing</span>
                <select
                  data-testid="al-spacing"
                  value={directives.spacing}
                  onChange={(e) =>
                    patch({ spacing: e.target.value as SpacingPreset })
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="normal">Normal</option>
                  <option value="spacious">Spacious</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Aspect ratio</span>
                <select
                  value={String(directives.aspectRatio)}
                  onChange={(e) =>
                    patch({ aspectRatio: Number(e.target.value) || 1 })
                  }
                  disabled={!showAspect}
                >
                  <option value="1">Square (1:1)</option>
                  <option value="1.4">Wide (1.4:1)</option>
                  <option value="0.75">Tall (0.75:1)</option>
                </select>
              </label>
              <p className="muted settings-note">
                Steps: {resolved.steps.join(' → ')}. Routing is always
                orthogonal (angular) around parts after placement.
              </p>
            </fieldset>
          )}

          {isHierarchic && (
            <fieldset className="settings-fieldset">
              <legend>Hierarchic options</legend>
              <p className="muted settings-note">
                Sugiyama phases via ELK layered: cycle breaking → layering →
                crossing minimisation → node placement → orthogonal routing.
                Ports take part in placement (connections are port-to-port),
                nested groups are laid out recursively, and Layout Rules
                (layers, “belong to”, above/below, left/right) apply as hard
                constraints. Port sides are iterated toward their peers.
              </p>
              <label className="settings-row">
                <span>Direction</span>
                <select
                  data-testid="al-h-direction"
                  value={hierarchic.direction}
                  onChange={(e) =>
                    patchHierarchic({
                      direction: e.target.value as HierarchicOptions['direction'],
                    })
                  }
                >
                  <option value="RIGHT">Left → right</option>
                  <option value="DOWN">Top → down</option>
                  <option value="LEFT">Right → left</option>
                  <option value="UP">Bottom → up</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Cycle breaking</span>
                <select
                  data-testid="al-h-cycle"
                  value={hierarchic.cycleBreaking}
                  disabled={hierarchic.incremental}
                  onChange={(e) =>
                    patchHierarchic({
                      cycleBreaking: e.target
                        .value as HierarchicOptions['cycleBreaking'],
                    })
                  }
                >
                  <option value="GREEDY">Greedy (heuristic)</option>
                  <option value="DEPTH_FIRST">Depth-first</option>
                  <option value="MODEL_ORDER">Model order</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Layering</span>
                <select
                  data-testid="al-h-layering"
                  value={hierarchic.layering}
                  disabled={hierarchic.incremental}
                  onChange={(e) =>
                    patchHierarchic({
                      layering: e.target.value as HierarchicOptions['layering'],
                    })
                  }
                >
                  <option value="NETWORK_SIMPLEX">Network simplex</option>
                  <option value="LONGEST_PATH">Longest path</option>
                  <option value="COFFMAN_GRAHAM">Coffman–Graham</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Crossing effort</span>
                <input
                  type="number"
                  data-testid="al-h-thoroughness"
                  min={1}
                  max={50}
                  value={hierarchic.crossingThoroughness}
                  onChange={(e) =>
                    patchHierarchic({
                      crossingThoroughness: Number(e.target.value) || 10,
                    })
                  }
                />
              </label>
              <label className="settings-row">
                <span>Node placement</span>
                <select
                  data-testid="al-h-placement"
                  value={hierarchic.nodePlacement}
                  onChange={(e) =>
                    patchHierarchic({
                      nodePlacement: e.target
                        .value as HierarchicOptions['nodePlacement'],
                    })
                  }
                >
                  <option value="BRANDES_KOEPF">Brandes–Köpf</option>
                  <option value="NETWORK_SIMPLEX">Network simplex</option>
                  <option value="LINEAR_SEGMENTS">Linear segments</option>
                  <option value="SIMPLE">Simple</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Port constraints</span>
                <select
                  data-testid="al-h-ports"
                  value={hierarchic.portConstraints}
                  onChange={(e) =>
                    patchHierarchic({
                      portConstraints: e.target
                        .value as HierarchicOptions['portConstraints'],
                    })
                  }
                >
                  <option value="FIXED_SIDE">Fixed side (candidates)</option>
                  <option value="FIXED_ORDER">Fixed side + order</option>
                  <option value="FREE" disabled={portsRestricted}>
                    Free
                  </option>
                </select>
              </label>
              {portsRestricted ? (
                <p className="muted settings-note">
                  The port placement mode restricts port sides, so ports keep
                  their side (Free is treated as Fixed side).
                </p>
              ) : null}
              <label className="settings-row">
                <span>Incremental (keep arrangement)</span>
                <input
                  type="checkbox"
                  data-testid="al-h-incremental"
                  checked={hierarchic.incremental}
                  onChange={(e) =>
                    patchHierarchic({ incremental: e.target.checked })
                  }
                />
              </label>
              <label className="settings-row">
                <span>Port iterations</span>
                <input
                  type="number"
                  data-testid="al-h-iterations"
                  min={1}
                  max={10}
                  value={hierarchic.maxIterations}
                  onChange={(e) =>
                    patchHierarchic({
                      maxIterations: Number(e.target.value) || 1,
                    })
                  }
                />
              </label>
            </fieldset>
          )}

          {isCustom && (
            <fieldset className="settings-fieldset">
              <legend>Custom level weights</legend>
              <p className="muted settings-note">
                Per nest level, algorithm is chosen from graph metrics and
                these weights (0–1). Leaf = deepest nests, Mid = intermediate,
                Root = boundary peers.
              </p>
              <div className="settings-row" style={{ justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() =>
                    patch({ customWeights: SUGGESTED_LEVEL_WEIGHTS })
                  }
                >
                  Reset to suggested
                </button>
              </div>
              {LAYOUT_LEVELS.map((level) => (
                <div key={level} className="custom-weight-level">
                  <h3 className="custom-weight-level-title">
                    {layoutLevelLabel(level)}
                    <span className="muted">
                      {' '}
                      (suggested connection{' '}
                      {SUGGESTED_LEVEL_WEIGHTS[level].connectionAwareness.toFixed(
                        2,
                      )}
                      )
                    </span>
                  </h3>
                  {LAYOUT_WEIGHT_KEYS.map((key) => (
                    <label key={key} className="settings-row custom-weight-row">
                      <span>
                        {layoutWeightLabel(key)}{' '}
                        <span className="muted">
                          {customWeights[level][key].toFixed(2)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={customWeights[level][key]}
                        onChange={(e) =>
                          patchWeight(level, key, Number(e.target.value))
                        }
                        aria-label={`${layoutLevelLabel(level)} ${layoutWeightLabel(key)}`}
                      />
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
          )}
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            data-testid="al-run"
            disabled={busy}
            onClick={() => onConfirm(directives)}
          >
            {busy ? 'Running…' : 'Run AutoLayout'}
          </button>
        </footer>
      </div>
    </div>
  )
}
