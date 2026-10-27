import { describe, expect, it } from 'vitest'
import { connectedComponents, packComponents } from './componentPacking'
import { overlappingPairs } from './layoutQuality'

describe('connectedComponents', () => {
  it('groups linked ids, largest group first, singletons sorted', () => {
    const groups = connectedComponents(
      ['d', 'c', 'b', 'a', 'z'],
      [
        { a: 'a', b: 'b' },
        { a: 'b', b: 'c' },
      ],
    )
    expect(groups).toEqual([['a', 'b', 'c'], ['d'], ['z']])
  })
})

describe('packComponents', () => {
  it('packs boxes into rows without overlaps, big components first', () => {
    const boxes = [
      { id: 's1', w: 100, h: 60 },
      { id: 'big', w: 600, h: 300 },
      { id: 's2', w: 100, h: 60 },
      { id: 'mid', w: 300, h: 200 },
    ]
    const r = packComponents(boxes, { aspectRatio: 1.4, gap: 40 })
    expect(r.positions.big).toEqual({ x: 0, y: 0 })
    const rects = boxes.map((b) => ({
      id: b.id,
      minX: r.positions[b.id].x,
      minY: r.positions[b.id].y,
      maxX: r.positions[b.id].x + b.w,
      maxY: r.positions[b.id].y + b.h,
    }))
    expect(overlappingPairs(rects)).toEqual([])
    expect(r.width).toBeGreaterThanOrEqual(600)
    expect(r.height).toBeGreaterThanOrEqual(300)
    // Not everything in one row: the layout stays roughly 1.4:1.
    expect(r.width / r.height).toBeLessThan(4)
  })

  it('spreads many singletons into a grid instead of one column', () => {
    const boxes = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      w: 120,
      h: 70,
    }))
    const r = packComponents(boxes, { aspectRatio: 1, gap: 30 })
    const rows = new Set(Object.values(r.positions).map((p) => p.y))
    expect(rows.size).toBeGreaterThan(1)
    expect(rows.size).toBeLessThan(12)
  })

  it('is empty for no boxes', () => {
    expect(packComponents([])).toEqual({ positions: {}, width: 0, height: 0 })
  })
})
