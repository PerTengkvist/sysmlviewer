import { describe, expect, it } from 'vitest'
import { nearestBorderAnchor, pointerInsideNodeBox } from './PartNode'

describe('nearestBorderAnchor', () => {
  it('maps mid-top pointer to top side with fractional offset (not a corner)', () => {
    const a = nearestBorderAnchor(40, 2, 100, 80)
    expect(a.side).toBe('top')
    expect(a.offset).toBeCloseTo(0.4, 5)
  })

  it('maps mid-right pointer to right side', () => {
    const a = nearestBorderAnchor(98, 40, 100, 80)
    expect(a.side).toBe('right')
    expect(a.offset).toBeCloseTo(0.5, 5)
  })

  it('clamps L/R offset to 0.05–0.95 by default', () => {
    expect(nearestBorderAnchor(0, 0, 100, 80).offset).toBe(0.05)
    expect(nearestBorderAnchor(0, 80, 100, 80).offset).toBe(0.95)
  })

  it('clamps L/R offset to 0.02–0.98 on a boundary', () => {
    expect(nearestBorderAnchor(0, 0, 100, 80, { isBoundary: true }).offset).toBe(
      0.02,
    )
    expect(nearestBorderAnchor(0, 80, 100, 80, { isBoundary: true }).offset).toBe(
      0.98,
    )
  })
})

describe('pointerInsideNodeBox', () => {
  it('is false when pointer is outside the box', () => {
    expect(pointerInsideNodeBox(-5, 40, 100, 80)).toBe(false)
    expect(pointerInsideNodeBox(50, 90, 100, 80)).toBe(false)
  })

  it('is true on the boundary and interior', () => {
    expect(pointerInsideNodeBox(0, 0, 100, 80)).toBe(true)
    expect(pointerInsideNodeBox(50, 40, 100, 80)).toBe(true)
  })
})
