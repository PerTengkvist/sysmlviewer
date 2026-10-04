import { describe, expect, it } from 'vitest'
import { shouldShowLabelLeader } from './edgeLabelLeader'

describe('shouldShowLabelLeader', () => {
  it('hides the leader when Option is not held, even with offset', () => {
    expect(shouldShowLabelLeader(false, { x: 40, y: 0 })).toBe(false)
  })

  it('shows the leader when Option is held and offset exceeds threshold', () => {
    expect(shouldShowLabelLeader(true, { x: 40, y: 0 })).toBe(true)
  })

  it('hides the leader when Option is held but offset is zero', () => {
    expect(shouldShowLabelLeader(true, { x: 0, y: 0 })).toBe(false)
  })

  it('hides the leader when offset is below the default threshold', () => {
    expect(shouldShowLabelLeader(true, { x: 0.2, y: 0 })).toBe(false)
  })

  it('treats null/undefined offset as no leader', () => {
    expect(shouldShowLabelLeader(true, null)).toBe(false)
    expect(shouldShowLabelLeader(true, undefined)).toBe(false)
  })
})
