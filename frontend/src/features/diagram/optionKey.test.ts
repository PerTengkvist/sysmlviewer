import { describe, expect, it } from 'vitest'
import { handleVisibilityClass, isOptionKey, trackOptionKey } from './optionKey'

function key(type: 'keydown' | 'keyup', k: string, code = ''): Event {
  return Object.assign(new Event(type), { key: k, code })
}

function setup() {
  const win = new EventTarget()
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  const seen: boolean[] = []
  const stop = trackOptionKey((held) => seen.push(held), win, doc)
  return { win, doc, seen, stop }
}

describe('isOptionKey', () => {
  it('is Alt / Option on either side, nothing else', () => {
    expect(isOptionKey({ key: 'Alt', code: 'AltLeft' })).toBe(true)
    expect(isOptionKey({ key: 'Unidentified', code: 'AltRight' })).toBe(true)
    expect(isOptionKey({ key: 'Shift', code: 'ShiftLeft' })).toBe(false)
  })
})

describe('trackOptionKey', () => {
  it('reports Option held on keydown and released on keyup', () => {
    const { win, seen } = setup()
    win.dispatchEvent(key('keydown', 'Alt', 'AltLeft'))
    win.dispatchEvent(key('keyup', 'Alt', 'AltLeft'))
    expect(seen).toEqual([true, false])
  })

  it('ignores other keys', () => {
    const { win, seen } = setup()
    win.dispatchEvent(key('keydown', 'Shift', 'ShiftLeft'))
    expect(seen).toEqual([])
  })

  it('lets go when the window loses focus', () => {
    const { win, seen } = setup()
    win.dispatchEvent(key('keydown', 'Alt'))
    win.dispatchEvent(new Event('blur'))
    expect(seen).toEqual([true, false])
  })

  it('lets go when the page is hidden', () => {
    const { win, doc, seen } = setup()
    win.dispatchEvent(key('keydown', 'Alt'))
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(seen).toEqual([true, false])
  })

  it('stops listening after cleanup', () => {
    const { win, seen, stop } = setup()
    stop()
    win.dispatchEvent(key('keydown', 'Alt'))
    expect(seen).toEqual([])
  })
})

describe('handleVisibilityClass', () => {
  it('shows the connection handles only while Option is held', () => {
    expect(handleVisibilityClass(true)).toBe('show-handles')
    expect(handleVisibilityClass(false)).toBe('')
  })
})
