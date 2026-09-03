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
