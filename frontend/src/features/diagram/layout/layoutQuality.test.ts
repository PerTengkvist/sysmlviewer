import { describe, expect, it } from 'vitest'
import {
  boundingArea,
  computeLayoutQuality,
  countBends,
  countCrossings,
  countEdgeThroughParts,
  countOverlaps,
  layoutScore,
  overlappingPairs,
  totalEdgeLength,
  type QualityPolyline,
  type QualityRect,
} from './layoutQuality'

function rect(id: string, x: number, y: number, w: number, h: number): QualityRect {
  return { id, minX: x, minY: y, maxX: x + w, maxY: y + h }
}

function line(
  id: string,
  pts: [number, number][],
  endpoints: [string, string] = ['s', 't'],
): QualityPolyline {
  return { id, points: pts.map(([x, y]) => ({ x, y })), endpoints }
}

describe('countOverlaps', () => {
  it('counts each overlapping pair once', () => {
    const rects = [
      rect('a', 0, 0, 100, 50),
      rect('b', 50, 10, 100, 50), // overlaps a
      rect('c', 300, 0, 100, 50), // isolated
    ]
    expect(countOverlaps(rects)).toBe(1)
    expect(overlappingPairs(rects)).toEqual([['a', 'b']])
  })

  it('treats touching edges as not overlapping', () => {
    const rects = [rect('a', 0, 0, 100, 50), rect('b', 100, 0, 100, 50)]
    expect(countOverlaps(rects)).toBe(0)
  })

  it('ignores ancestor/descendant pairs when parentOf is given', () => {
    const rects = [
      rect('car', 0, 0, 500, 400),
      rect('engine', 20, 20, 100, 50),
      rect('piston', 30, 30, 20, 20),
      rect('wheel', 20, 20, 100, 50), // overlaps engine, same parent
    ]
    const parentOf = new Map<string, string | undefined>([
      ['car', undefined],
      ['engine', 'car'],
      ['piston', 'engine'],
      ['wheel', 'car'],
    ])
    // wheel overlaps engine and engine's child piston; ancestor pairs are skipped.
    expect(countOverlaps(rects, { parentOf })).toBe(2)
    expect(overlappingPairs(rects, { parentOf })).toEqual([
      ['engine', 'wheel'],
      ['piston', 'wheel'],
    ])
  })
})

describe('countEdgeThroughParts', () => {
  it('counts a segment that cuts through a non-endpoint part', () => {
    const rects = [
      rect('s', 0, 0, 50, 50),
      rect('mid', 100, 0, 50, 50),
      rect('t', 200, 0, 50, 50),
    ]
    const edge = line('e', [[50, 25], [200, 25]], ['s', 't'])
    expect(countEdgeThroughParts([edge], rects)).toBe(1)
  })

  it('does not count endpoint parts or their ancestors', () => {
    const rects = [
      rect('car', 0, 0, 500, 300),
      rect('s', 10, 10, 50, 50),
      rect('t', 200, 10, 50, 50),
    ]
    const parentOf = new Map<string, string | undefined>([
      ['car', undefined],
      ['s', 'car'],
      ['t', 'car'],
    ])
    const edge = line('e', [[60, 35], [200, 35]], ['s', 't'])
    expect(countEdgeThroughParts([edge], rects, { parentOf })).toBe(0)
  })

  it('does not count a segment that only runs along a part border', () => {
    const rects = [rect('mid', 100, 0, 50, 50)]
    const edge = line('e', [[0, 50], [300, 50]], ['s', 't'])
    expect(countEdgeThroughParts([edge], rects)).toBe(0)
  })

  it('counts an orthogonal elbow passing through a part', () => {
    const rects = [rect('mid', 100, 100, 50, 50)]
    const edge = line('e', [[0, 125], [125, 125], [125, 300]], ['s', 't'])
    // Both segments enter the interior, but the edge/part pair counts once.
    expect(countEdgeThroughParts([edge], rects)).toBe(1)
  })
})

describe('countCrossings', () => {
  it('counts a proper intersection between two edges', () => {
    const a = line('a', [[0, 0], [100, 100]])
    const b = line('b', [[0, 100], [100, 0]])
    expect(countCrossings([a, b])).toBe(1)
  })

  it('ignores segments of the same edge and parallel non-touching segments', () => {
    const a = line('a', [[0, 0], [100, 0], [100, 100]])
    const b = line('b', [[0, 50], [50, 50]])
    expect(countCrossings([a, b])).toBe(0)
  })

  it('does not count shared endpoints (fan-out from the same port)', () => {
    const a = line('a', [[0, 0], [100, 0]])
    const b = line('b', [[0, 0], [0, 100]])
    expect(countCrossings([a, b])).toBe(0)
  })
})

describe('countBends and lengths', () => {
  it('counts direction changes only', () => {
    const e = line('e', [[0, 0], [50, 0], [100, 0], [100, 50]])
    expect(countBends([e])).toBe(1)
  })

  it('sums polyline lengths', () => {
    const e = line('e', [[0, 0], [30, 0], [30, 40]])
    expect(totalEdgeLength([e])).toBe(70)
  })

  it('measures bounding area of all rects', () => {
    expect(boundingArea([rect('a', 0, 0, 10, 10), rect('b', 90, 90, 10, 10)])).toBe(
      100 * 100,
    )
    expect(boundingArea([])).toBe(0)
  })
})

describe('computeLayoutQuality + layoutScore', () => {
  it('aggregates metrics and scores worse layouts higher', () => {
    const rects = [rect('s', 0, 0, 50, 50), rect('t', 200, 0, 50, 50)]
    const clean = computeLayoutQuality(rects, [
      line('e', [[50, 25], [200, 25]], ['s', 't']),
    ])
    expect(clean).toMatchObject({
      overlaps: 0,
      edgeThroughParts: 0,
      crossings: 0,
      bends: 0,
      totalEdgeLength: 150,
    })
    const bent = computeLayoutQuality(rects, [
      line('e', [[50, 25], [100, 25], [100, 80], [200, 80], [200, 25]], ['s', 't']),
    ])
    expect(layoutScore(bent)).toBeGreaterThan(layoutScore(clean))
  })
})
