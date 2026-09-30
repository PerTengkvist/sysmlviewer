import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings } from './settings'

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
