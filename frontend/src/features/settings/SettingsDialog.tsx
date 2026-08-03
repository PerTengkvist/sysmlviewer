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
        </div>
      </div>
    </div>
  )
}
