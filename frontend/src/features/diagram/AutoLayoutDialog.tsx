import { useEffect, useState } from 'react'
import {
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  type AutoLayoutDirectives,
  type AutoLayoutUiMode,
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
  const showAspect =
    uiMode === 'simple'
      ? directives.algorithm === 'stress'
      : resolved.elkAlgorithm === 'stress' ||
        resolved.elkAlgorithm === 'force'

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
                value={directives.portPlacement}
                onChange={(e) =>
                  patch({
                    portPlacement: e.target.value as PortPlacementMode,
                  })
                }
              >
                <option value="inputsLeftOutputsRight">
                  Inputs left, outputs right
                </option>
                <option value="optimized">Optimized placement</option>
              </select>
            </label>
            <p className="muted settings-note">
              {directives.portPlacement === 'inputsLeftOutputsRight'
                ? 'Consumer ports (…In) on the left, provider ports (…Out) on the right. Unclear ports follow connection direction.'
                : 'Ports face connected peers to shorten routes and reduce crossings.'}
            </p>
          </fieldset>

          {uiMode === 'simple' ? (
            <fieldset className="settings-fieldset">
              <legend>Part placement</legend>
              <label className="settings-row">
                <span>Algorithm</span>
                <select
                  value={directives.algorithm}
                  onChange={(e) =>
                    patch({
                      algorithm: e.target.value as PlacementAlgorithm,
                    })
                  }
                >
                  <option value="stress">
                    Stress (2D, hubs toward center)
                  </option>
                  <option value="layered">Layered (left → right)</option>
                </select>
              </label>
              <label className="settings-row">
                <span>Spacing</span>
                <select
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
                Runs pipeline “{pipelineLabel(resolved.id)}” with nest-fit and
                hard non-overlap. Routing is always orthogonal after placement.
              </p>
            </fieldset>
          ) : (
            <fieldset className="settings-fieldset">
              <legend>Placement pipeline</legend>
              <label className="settings-row">
                <span>Pipeline</span>
                <select
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
        </div>
        <footer className="modal-footer">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
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
