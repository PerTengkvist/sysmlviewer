import { describe, expect, it } from 'vitest'
import { resolveNestedPartPosition } from './nestedPartPosition'

describe('resolveNestedPartPosition', () => {
  const defaults = { defaultX: 28, defaultY: 48 }
  const parent = { w: 320, h: 200 }

  it('uses valid parent-relative coordinates', () => {
    expect(
      resolveNestedPartPosition(
        { x: 80, y: 60 },
        parent.w,
        parent.h,
        { x: 400, y: 300 },
        defaults.defaultX,
        defaults.defaultY,
      ),
    ).toEqual({ x: 80, y: 60 })
  })

  it('accepts slight negative x (clamped to 0)', () => {
    expect(
      resolveNestedPartPosition(
        { x: -20, y: 0 },
        parent.w,
        parent.h,
        null,
        defaults.defaultX,
        defaults.defaultY,
      ),
    ).toEqual({ x: 0, y: 0 })
  })

  it('converts canvas coordinates using parent viz offset', () => {
    expect(
      resolveNestedPartPosition(
        { x: 428, y: 348 },
        parent.w,
        parent.h,
        { x: 400, y: 300 },
        defaults.defaultX,
        defaults.defaultY,
      ),
    ).toEqual({ x: 28, y: 48 })
  })

  it('falls back when stored coords are nonsense for the parent', () => {
    expect(
      resolveNestedPartPosition(
        { x: 1600, y: 0 },
        parent.w,
        parent.h,
        { x: 40, y: 40 },
        defaults.defaultX,
        defaults.defaultY,
      ),
    ).toEqual({ x: defaults.defaultX, y: defaults.defaultY })
  })
})
