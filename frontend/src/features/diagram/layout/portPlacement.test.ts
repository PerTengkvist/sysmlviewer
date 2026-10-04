import { describe, expect, it } from 'vitest'
import {
  bodyOffsetMin,
  clampPortOffset,
  flowSizeFromScreenRect,
  hasSavedPortPlacement,
  packBodyOffsets,
  PART_HEADER_PX,
  PORT_BODY_OFFSET_MAX,
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
      expect(o).toBeLessThanOrEqual(PORT_BODY_OFFSET_MAX)
    }
    expect(packed[0]).toBeLessThan(packed[1]!)
    expect(packed[1]).toBeLessThan(packed[2]!)
  })

  it('uses pixel header min on a tall part (not a 0.38 floor)', () => {
    const height = 465
    const min = bodyOffsetMin(height)
    expect(min).toBeCloseTo(PART_HEADER_PX / height, 5)
    expect(min).toBeLessThan(0.38)
  })

  it('caps header min on a short part', () => {
    const min = bodyOffsetMin(72)
    expect(min).toBeLessThanOrEqual(0.45)
    expect(min).toBeGreaterThanOrEqual(0.05)
  })

  it('clamps left/right offsets out of the header', () => {
    expect(clampPortOffset(0.1, 'left', 120)).toBeGreaterThanOrEqual(
      bodyOffsetMin(120),
    )
    expect(clampPortOffset(0.99, 'right', 120)).toBe(PORT_BODY_OFFSET_MAX)
  })

  it('lets a tall-part L/R port reach 0.95 (Skateboard directionIn)', () => {
    expect(clampPortOffset(0.99, 'left', 465)).toBe(0.95)
  })

  it('lets a boundary L/R port reach 0.98', () => {
    expect(clampPortOffset(0.99, 'left', 465, { isBoundary: true })).toBe(0.98)
  })

  it('clamps L/R 0 to header min on a tall part, not 0.38', () => {
    const height = 465
    const clamped = clampPortOffset(0, 'left', height)
    expect(clamped).toBeCloseTo(bodyOffsetMin(height), 5)
    expect(clamped).toBeLessThan(0.38)
  })

  it('clamps top/bottom to 0.05–0.95', () => {
    expect(clampPortOffset(0.01, 'top', 200)).toBe(0.05)
    expect(clampPortOffset(0.99, 'bottom', 200)).toBe(0.95)
  })

  it('converts zoomed screen size to the same flow size', () => {
    const flowW = 721
    const flowH = 465
    const at2 = flowSizeFromScreenRect(flowW * 2, flowH * 2, 2)
    const atHalf = flowSizeFromScreenRect(flowW * 0.5, flowH * 0.5, 0.5)
    expect(at2.height).toBeCloseTo(flowH)
    expect(atHalf.height).toBeCloseTo(flowH)
    expect(at2.width).toBeCloseTo(flowW)
    expect(clampPortOffset(0, 'left', at2.height)).toBe(
      clampPortOffset(0, 'left', atHalf.height),
    )
    expect(clampPortOffset(0, 'left', flowH * 2)).not.toBe(
      clampPortOffset(0, 'left', at2.height),
    )
  })

  it('detects missing saved placement', () => {
    expect(hasSavedPortPlacement(null)).toBe(false)
    expect(hasSavedPortPlacement({ side: 'left', offset: null })).toBe(false)
    expect(hasSavedPortPlacement({ side: 'left', offset: 0.6 })).toBe(true)
  })
})
