import { beforeEach, describe, expect, it } from 'vitest'
import {
  clampToViewport,
  DEFAULT_ELEMENT_DIALOG_SIZE,
  loadElementDialogSize,
  resizedTo,
  saveElementDialogSize,
  toggleMaximized,
} from './elementDialogState'

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
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => store.clear(),
    },
  })
})

const viewport = { width: 1280, height: 800 }

describe('elementDialogState', () => {
  it('clamps to the viewport and the minimum size', () => {
    const out = clampToViewport({ width: 2000, height: 50, maximized: false }, viewport)
    expect(out).toEqual({ width: 1280, height: 320, maximized: false })
  })

  it('toggles maximized and keeps the size', () => {
    const on = toggleMaximized(DEFAULT_ELEMENT_DIALOG_SIZE)
    expect(on).toEqual({ ...DEFAULT_ELEMENT_DIALOG_SIZE, maximized: true })
    expect(toggleMaximized(on)).toEqual(DEFAULT_ELEMENT_DIALOG_SIZE)
  })

  it('resizedTo stores clamped dimensions and leaves maximized', () => {
    const max = { width: 960, height: 640, maximized: true }
    expect(resizedTo(max, 700, 500, viewport)).toEqual({
      width: 700,
      height: 500,
      maximized: false,
    })
  })

  it('loads the default without storage, on bad JSON and on bad fields', () => {
    expect(loadElementDialogSize()).toEqual(DEFAULT_ELEMENT_DIALOG_SIZE)
    localStorage.setItem('sysmlviewer.elementDialog', '{nope')
    expect(loadElementDialogSize()).toEqual(DEFAULT_ELEMENT_DIALOG_SIZE)
    localStorage.setItem(
      'sysmlviewer.elementDialog',
      JSON.stringify({ width: 'x', height: 500, maximized: 'yes' }),
    )
    expect(loadElementDialogSize()).toEqual({
      width: DEFAULT_ELEMENT_DIALOG_SIZE.width,
      height: 500,
      maximized: false,
    })
  })

  it('round-trips through save/load', () => {
    const size = { width: 800, height: 450, maximized: true }
    saveElementDialogSize(size)
    expect(loadElementDialogSize()).toEqual(size)
  })
})
