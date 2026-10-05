import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_REQUIREMENT_DISPLAY } from './features/diagram/requirementDisplay'
import { DEFAULT_SETTINGS, EDGE_LABEL_TEXT_HEIGHT_PX, loadSettings } from './settings'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      clear: () => store.clear(),
      removeItem: (k: string) => {
        store.delete(k)
      },
    },
  })
})

describe('connection separation', () => {
  it('default connection separation equals edge label text height', () => {
    expect(EDGE_LABEL_TEXT_HEIGHT_PX).toBe(11)
    expect(DEFAULT_SETTINGS.connectionSeparation).toBe(EDGE_LABEL_TEXT_HEIGHT_PX)
  })
})

describe('settings selected connection highlight', () => {
  it('defaults to blue color and linewidth factor 3', () => {
    expect(DEFAULT_SETTINGS.selectedConnectionColor).toBe('#2563eb')
    expect(DEFAULT_SETTINGS.selectedConnectionLinewidthFactor).toBe(3)
  })

  it('clamps factor below 1 to 1', () => {
    localStorage.setItem(
      'sysmlviewer.settings',
      JSON.stringify({ selectedConnectionLinewidthFactor: 0 }),
    )
    const s = loadSettings()
    expect(s.selectedConnectionLinewidthFactor).toBe(1)
  })

  it('ignores legacy selectedConnectionLinewidth as factor', () => {
    localStorage.setItem(
      'sysmlviewer.settings',
      JSON.stringify({ selectedConnectionLinewidth: 4 }),
    )
    const s = loadSettings()
    expect(s.selectedConnectionLinewidthFactor).toBe(3)
    expect(
      (s as { selectedConnectionLinewidth?: number }).selectedConnectionLinewidth,
    ).toBeUndefined()
  })

  it('loads a valid factor from storage', () => {
    localStorage.setItem(
      'sysmlviewer.settings',
      JSON.stringify({ selectedConnectionLinewidthFactor: 2.5 }),
    )
    expect(loadSettings().selectedConnectionLinewidthFactor).toBe(2.5)
  })
})

describe('settings requirementDisplay', () => {
  it('defaults to shortId+name header, doc body, description panel attr', () => {
    expect(DEFAULT_SETTINGS.requirementDisplay).toEqual(
      DEFAULT_REQUIREMENT_DISPLAY,
    )
    expect(loadSettings().requirementDisplay).toEqual(DEFAULT_REQUIREMENT_DISPLAY)
  })

  it('normalizes persisted requirementDisplay', () => {
    localStorage.setItem(
      'sysmlviewer.settings',
      JSON.stringify({
        requirementDisplay: {
          headerSlots: [{ kind: 'sysml', field: 'name' }, { kind: 'none' }],
          body: { kind: 'attribute', name: 'summary' },
          documentationPanelAttribute: null,
        },
      }),
    )
    const s = loadSettings()
    expect(s.requirementDisplay.headerSlots).toEqual([
      { kind: 'sysml', field: 'name' },
      { kind: 'none' },
    ])
    expect(s.requirementDisplay.body).toEqual({
      kind: 'attribute',
      name: 'summary',
    })
    expect(s.requirementDisplay.documentationPanelAttribute).toBeNull()
  })
})
