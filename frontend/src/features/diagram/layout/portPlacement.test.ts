import { describe, expect, it } from 'vitest'
import {
  bodyOffsetMin,
  clampPortOffset,
  hasSavedPortPlacement,
  packBodyOffsets,
  PART_HEADER_PX,
} from './portPlacement'

describe('portPlacement', () => {
  it('packs default offsets below the header band', () => {
    const height = 120
    const min = bodyOffsetMin(height)
    expect(min).toBeGreaterThanOrEqual(PART_HEADER_PX / height - 0.01)
    const packed = packBodyOffsets(3, height)
    expect(packed).toHaveLength(3)
    for (const o of packed) {
      expect(o).toBeGreaterThanOrEqual(min)
      expect(o).toBeLessThanOrEqual(0.92)
    }
    expect(packed[0]).toBeLessThan(packed[1]!)
    expect(packed[1]).toBeLessThan(packed[2]!)
  })

  it('clamps left/right offsets out of the header', () => {
    expect(clampPortOffset(0.1, 'left', 120)).toBeGreaterThanOrEqual(
      bodyOffsetMin(120),
    )
    expect(clampPortOffset(0.99, 'right', 120)).toBeLessThanOrEqual(0.92)
  })

  it('detects missing saved placement', () => {
    expect(hasSavedPortPlacement(null)).toBe(false)
    expect(hasSavedPortPlacement({ side: 'left', offset: null })).toBe(false)
    expect(hasSavedPortPlacement({ side: 'left', offset: 0.6 })).toBe(true)
  })
})
