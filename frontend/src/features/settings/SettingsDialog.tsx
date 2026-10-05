import type {
  AppSettings,
  RequirementDisplaySettings,
} from '../settings'
import type { RequirementSlotSource } from '../diagram/requirementDisplay'

type Props = {
  open: boolean
  settings: AppSettings
  onChange: (next: AppSettings) => void
  onClose: () => void
}

type SlotChoice = 'none' | 'shortId' | 'name' | 'attribute'

function slotChoice(slot: RequirementSlotSource): SlotChoice {
  if (slot.kind === 'none') return 'none'
  if (slot.kind === 'attribute') return 'attribute'
  return slot.field
}

function slotFromChoice(
  choice: SlotChoice,
  attrName: string,
): RequirementSlotSource {
  if (choice === 'none') return { kind: 'none' }
  if (choice === 'attribute') {
    return { kind: 'attribute', name: attrName.trim() || 'Type' }
  }
  return { kind: 'sysml', field: choice }
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

  const req = settings.requirementDisplay
  const patchReq = (partial: Partial<RequirementDisplaySettings>) => {
    onChange({
      ...settings,
      requirementDisplay: { ...req, ...partial },
    })
  }

  const setHeaderSlot = (index: 0 | 1, choice: SlotChoice) => {
    const prev = req.headerSlots[index]
    const attrName = prev.kind === 'attribute' ? prev.name : ''
    const next: [RequirementSlotSource, RequirementSlotSource] = [
      req.headerSlots[0],
      req.headerSlots[1],
    ]
    next[index] = slotFromChoice(choice, attrName)
    patchReq({ headerSlots: next })
  }

  const setHeaderAttrName = (index: 0 | 1, name: string) => {
    const next: [RequirementSlotSource, RequirementSlotSource] = [
      req.headerSlots[0],
      req.headerSlots[1],
    ]
    next[index] = { kind: 'attribute', name }
    patchReq({ headerSlots: next })
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
              Default depth for diagrams (1 = root only). Override per diagram
              under Details → Diagram levels.
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
            <legend>Requirement objects</legend>
            <p className="muted settings-note">
              Default header is ReqID + name; body shows the SysML{" "}
              <code>doc</code> block. Choose attributes instead when needed.
            </p>
            {([0, 1] as const).map((index) => {
              const slot = req.headerSlots[index]
              const choice = slotChoice(slot)
              return (
                <div key={index}>
                  <label className="settings-row">
                    <span>Header slot {index + 1}</span>
                    <select
                      value={choice}
                      aria-label={`Header slot ${index + 1}`}
                      onChange={(e) =>
                        setHeaderSlot(index, e.target.value as SlotChoice)
                      }
                    >
                      <option value="shortId">ReqID (shortId)</option>
                      <option value="name">Name</option>
                      <option value="attribute">Attribute…</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  {choice === 'attribute' ? (
                    <label className="settings-row">
                      <span>Attribute name</span>
                      <input
                        type="text"
                        value={slot.kind === 'attribute' ? slot.name : ''}
                        aria-label={`Header slot ${index + 1} attribute`}
                        onChange={(e) =>
                          setHeaderAttrName(index, e.target.value)
                        }
                      />
                    </label>
                  ) : null}
                </div>
              )
            })}
            <label className="settings-row">
              <span>Body</span>
              <select
                value={req.body.kind === 'doc' ? 'doc' : 'attribute'}
                aria-label="Requirement body source"
                onChange={(e) => {
                  if (e.target.value === 'doc') {
                    patchReq({ body: { kind: 'doc' } })
                  } else {
                    const name =
                      req.body.kind === 'attribute' ? req.body.name : 'summary'
                    patchReq({ body: { kind: 'attribute', name } })
                  }
                }}
              >
                <option value="doc">doc (SysML)</option>
                <option value="attribute">Attribute…</option>
              </select>
            </label>
            {req.body.kind === 'attribute' ? (
              <label className="settings-row">
                <span>Body attribute</span>
                <input
                  type="text"
                  value={req.body.name}
                  aria-label="Body attribute name"
                  onChange={(e) =>
                    patchReq({
                      body: { kind: 'attribute', name: e.target.value },
                    })
                  }
                />
              </label>
            ) : null}
            <label className="settings-row">
              <span>Doc panel attribute (no .md)</span>
              <input
                type="text"
                value={req.documentationPanelAttribute ?? ''}
                placeholder="description"
                aria-label="Documentation panel attribute"
                title="Shown in Documentation when no markdown file exists. Leave empty to disable."
                onChange={(e) => {
                  const t = e.target.value.trim()
                  patchReq({
                    documentationPanelAttribute: t || null,
                  })
                }}
              />
            </label>
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend>Selected connection</legend>
            <label className="settings-row">
              <span>Highlight color</span>
              <input
                type="color"
                value={settings.selectedConnectionColor}
                onChange={(e) =>
                  patch({ selectedConnectionColor: e.target.value })
                }
              />
            </label>
            <label className="settings-row">
              <span>Highlight factor</span>
              <input
                type="number"
                min={1}
                max={16}
                step={0.5}
                value={settings.selectedConnectionLinewidthFactor}
                onChange={(e) =>
                  patch({
                    selectedConnectionLinewidthFactor: Math.max(
                      1,
                      Number(e.target.value) || 3,
                    ),
                  })
                }
              />
            </label>
          </fieldset>
          <fieldset className="settings-fieldset">
            <legend>Pending relation edits</legend>
            <label className="settings-row">
              <span>Change color</span>
              <input
                type="color"
                value={settings.pendingChangeColor}
                onChange={(e) =>
                  patch({ pendingChangeColor: e.target.value })
                }
              />
            </label>
            <label className="settings-row">
              <span>Add color</span>
              <input
                type="color"
                value={settings.pendingAddColor}
                onChange={(e) => patch({ pendingAddColor: e.target.value })}
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
