import { describe, expect, it } from 'vitest'
import { applyLayoutChange, toggleRightPanel, type RightPanelState } from './rightPanelState'

const expanded: RightPanelState = { collapsed: false, sizes: [18, 64, 18] }

describe('rightPanelState', () => {
  it('toggle remembers the sizes', () => {
    const next = toggleRightPanel(expanded)
    expect(next).toEqual({ collapsed: true, sizes: [18, 64, 18] })
    expect(toggleRightPanel(next)).toEqual(expanded)
  })

  it('does not overwrite sizes with the collapsed layout', () => {
    const collapsed = toggleRightPanel(expanded)
    expect(applyLayoutChange(collapsed, [18, 82, 0])).toEqual(collapsed)
  })

  it('stores sizes while expanded', () => {
    expect(applyLayoutChange(expanded, [20, 60, 20])).toEqual({
      collapsed: false,
      sizes: [20, 60, 20],
    })
  })

  it('expands again when the collapsed panel is dragged open', () => {
    const collapsed = toggleRightPanel(expanded)
    expect(applyLayoutChange(collapsed, [18, 70, 12])).toEqual({
      collapsed: false,
      sizes: [18, 70, 12],
    })
  })

  it('treats a near-zero right panel as collapsed by drag', () => {
    expect(applyLayoutChange(expanded, [18, 82, 0.4])).toEqual({
      collapsed: true,
      sizes: [18, 64, 18],
    })
  })
})
