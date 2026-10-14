import { describe, expect, it } from 'vitest'
import {
  openTargetDecision,
  viewIdFromLocationSearch,
  viewWindowUrl,
} from './openTarget'

describe('openTargetDecision', () => {
  it('uses same-tab without a menu on a plain click', () => {
    expect(
      openTargetDecision({ viewId: 'v1', modifier: false }),
    ).toEqual({ showMenu: false, choice: 'same-tab' })
  })

  it('shows the menu when Ctrl/Meta is held', () => {
    expect(openTargetDecision({ viewId: 'v1', modifier: true })).toEqual({
      showMenu: true,
    })
  })
})

describe('viewWindowUrl', () => {
  it('builds a URL with the view query param', () => {
    const url = viewWindowUrl('Pkg::MyView', 'http://localhost:5173', '/')
    expect(url).toContain('view=Pkg%3A%3AMyView')
  })
})

describe('viewIdFromLocationSearch', () => {
  it('reads the view query param', () => {
    expect(viewIdFromLocationSearch('?view=Pkg%3A%3AMyView')).toBe('Pkg::MyView')
  })

  it('returns null when missing', () => {
    expect(viewIdFromLocationSearch('')).toBeNull()
  })
})
