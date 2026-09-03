import type { AppSettings } from '../settings'

type Props = {
  open: boolean
  settings: AppSettings
  onChange: (next: AppSettings) => void
  onClose: () => void
}

export function SettingsDialog({ open, settings, onChange, onClose }: Props) {
  if (!open) return null

  const patch = (partial: Partial<AppSettings>) => {
    onChange({ ...settings, ...partial })
  }

  const patchDetails = (
    partial: Partial<AppSettings['showDiagramDetails']>,
  ) => {
    onChange({
      ...settings,
      showDiagramDetails: { ...settings.showDiagramDetails, ...partial },
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Settings</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted settings-note">
            SysML sources are read-only. Diagram layout is saved under{" "}
            <code>views/*.json</code>; semantic cache and sheet data stay in{" "}
            <code>state.json</code>.
          </p>
          <label className="settings-row">
            <span>View mode</span>
            <select
              value={settings.viewMode}
              onChange={(e) =>
                patch({ viewMode: e.target.value as AppSettings['viewMode'] })
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <fieldset className="settings-fieldset">
            <legend>Show diagram details</legend>
            <label className="settings-row">
              <span>Attributes</span>
              <input
                type="checkbox"
                checked={settings.showDiagramDetails.attributes}
                onChange={(e) => patchDetails({ attributes: e.target.checked })}
              />
            </label>
            <label className="settings-row">
              <span>Hierarchical diagram levels</span>
              <input
                type="number"
                min={1}
                max={8}
                value={settings.showDiagramDetails.hierarchicalLevels}
                onChange={(e) =>
                  patchDetails({
                    hierarchicalLevels: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </label>
            <p className="muted settings-note">
              Default depth for diagrams (1 = root only). Each diagram can
              override this via the Levels control on the canvas.
            </p>
            <label className="settings-row">
              <span>Structure notation</span>
              <select
                value={settings.showDiagramDetails.structureNotation ?? 'sysmlv2'}
                onChange={(e) =>
                  patchDetails({
                    structureNotation:
                      e.target.value === 'arcadia' ? 'arcadia' : 'sysmlv2',
                  })
                }
              >
                <option value="sysmlv2">SysML v2 aggregation notation</option>
                <option value="arcadia">
                  Arcadia / SysML v1 aggregation notation
                </option>
              </select>
            </label>
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend>Selected connection</legend>
            <label className="settings-row">
              <span>Selected Connection Color</span>
              <input
                type="color"
                value={settings.selectedConnectionColor}
                onChange={(e) =>
                  patch({ selectedConnectionColor: e.target.value })
                }
              />
            </label>
            <label className="settings-row">
              <span>Selected Connection Linewidth</span>
              <input
                type="number"
                min={1}
                max={16}
                step={0.5}
                value={settings.selectedConnectionLinewidth}
                onChange={(e) =>
                  patch({
                    selectedConnectionLinewidth: Math.max(
                      1,
                      Number(e.target.value) || 4,
                    ),
                  })
                }
              />
            </label>
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend>Connection routing</legend>
            <label className="settings-row">
              <span>Connection Separation (px)</span>
              <input
                type="number"
                min={0}
                max={40}
                step={1}
                value={settings.connectionSeparation}
                onChange={(e) =>
                  patch({
                    connectionSeparation: Math.max(
                      0,
                      Number(e.target.value) || 0,
                    ),
                  })
                }
                title="Min gap between unrelated connections. Related nets (shared port) may overlap."
              />
            </label>
          </fieldset>
        </div>
      </div>
    </div>
  )
}
