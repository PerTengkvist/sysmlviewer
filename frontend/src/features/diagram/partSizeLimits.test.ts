import { describe, expect, it } from 'vitest'
import {
  BOUNDARY_MIN_HEIGHT,
  BOUNDARY_MIN_WIDTH,
  PART_MIN_HEIGHT,
  PART_MIN_WIDTH,
  clampPartSize,
  sizeFieldChange,
} from './partSizeLimits'

describe('clampPartSize', () => {
  it('clamps below the part minimum', () => {
    expect(clampPartSize({ width: 10, height: 5 })).toEqual({
      width: PART_MIN_WIDTH,
      height: PART_MIN_HEIGHT,
    })
  })

  it('leaves values above the minimum unchanged', () => {
    expect(clampPartSize({ width: 400, height: 300 })).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('uses boundary minima when isBoundary', () => {
    expect(
      clampPartSize({ width: 10, height: 10 }, { isBoundary: true }),
    ).toEqual({
      width: BOUNDARY_MIN_WIDTH,
      height: BOUNDARY_MIN_HEIGHT,
    })
  })

  it('clamps only the provided field', () => {
    expect(clampPartSize({ width: 50 })).toEqual({ width: PART_MIN_WIDTH })
    expect(clampPartSize({ height: 400 })).toEqual({ height: 400 })
  })
})

describe('sizeFieldChange', () => {
  const current = { width: 180, height: 120 }

  it('returns a patch when the value changes', () => {
    expect(sizeFieldChange('width', '240', current)).toEqual({ width: 240 })
    expect(sizeFieldChange('height', '200', current)).toEqual({ height: 200 })
  })

  it('returns null when unchanged or invalid', () => {
    expect(sizeFieldChange('width', '180', current)).toBeNull()
    expect(sizeFieldChange('height', 'abc', current)).toBeNull()
  })

  it('applies when force even if value matches current', () => {
    expect(
      sizeFieldChange('width', '180', current, { force: true }),
    ).toEqual({ width: 180 })
  })

  it('clamps the new value', () => {
    expect(sizeFieldChange('width', '10', current)).toEqual({
      width: PART_MIN_WIDTH,
    })
  })

  it('uses boundary minima when isBoundary', () => {
    expect(
      sizeFieldChange('width', '10', current, { isBoundary: true }),
    ).toEqual({ width: BOUNDARY_MIN_WIDTH })
  })
})
