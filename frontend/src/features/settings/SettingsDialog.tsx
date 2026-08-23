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
          <label className="settings-row">
            <span>Mode</span>
            <select
              value={settings.mode}
              onChange={(e) =>
                patch({ mode: e.target.value as AppSettings['mode'] })
              }
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>
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
