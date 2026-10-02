import { describe, expect, it } from 'vitest'
import { selectionIdForPaneClick } from './canvasSelection'

describe('selectionIdForPaneClick', () => {
  it('returns declared view id as-is', () => {
    expect(selectionIdForPaneClick('CarLogical::AllocationView')).toBe(
      'CarLogical::AllocationView',
    )
  })

  it('strips artifact:: prefix to match tree package/part click', () => {
    expect(selectionIdForPaneClick('artifact::CarLogical::Car')).toBe(
      'CarLogical::Car',
    )
  })

  it('returns null when no view is active', () => {
    expect(selectionIdForPaneClick(null)).toBeNull()
  })
})
