import { describe, expect, it } from 'vitest'
import {
  chooseCore,
  coreSizeFor,
  packAroundCore,
  type PackBox,
  type PackEdge,
} from './clusteredPack'
import { overlappingPairs, type QualityRect } from './layoutQuality'
import { placeBalancedSiblings } from './balancedLayout'

function boxes(ids: string[], w = 100, h = 80): PackBox[] {
  return ids.map((id) => ({ id, w, h }))
}

function edge(source: string, target: string): PackEdge {
  return { source, target }
}

function rectsOf(
  r: ReturnType<typeof packAroundCore>,
): QualityRect[] {
  return Object.entries(r.children).map(([id, c]) => ({
    id,
    minX: c.x,
    minY: c.y,
    maxX: c.x + c.width,
    maxY: c.y + c.height,
  }))
}

function center(c: { x: number; y: number; width: number; height: number }) {
  return { x: c.x + c.width / 2, y: c.y + c.height / 2 }
}

/** hub + 7 satellites; a and b also connect to each other (dense triangle). */
function starWithTriangle(): { boxes: PackBox[]; edges: PackEdge[] } {
  const ids = ['hub', 'a', 'b', 'c', 'd', 'e', 'f', 'g']
  const edges = [
    ...ids.slice(1).map((id) => edge('hub', id)),
    edge('a', 'b'),
  ]
  return { boxes: boxes(ids), edges }
}

describe('coreSizeFor', () => {
  it('grows with N but stays small', () => {
    expect(coreSizeFor(4)).toBe(1)
    expect(coreSizeFor(5)).toBe(2)
    expect(coreSizeFor(8)).toBe(3)
    expect(coreSizeFor(12)).toBe(4)
    expect(coreSizeFor(30)).toBe(4)
  })
})

describe('chooseCore', () => {
  it('picks the hub and its most connected neighbours', () => {
    const { boxes: b, edges } = starWithTriangle()
    expect(chooseCore(b, edges, 3)).toEqual(['a', 'b', 'hub'])
  })

  it('falls back to name order without edges', () => {
    expect(chooseCore(boxes(['z', 'y', 'x', 'w']), [], 2)).toEqual(['w', 'x'])
  })
})

describe('packAroundCore', () => {
  it('places 8 parts as a 3-part core with satellites and no overlaps', () => {
    const { boxes: b, edges } = starWithTriangle()
    const r = packAroundCore(b, edges, { gapFraction: 0.2, minChannel: 48 })
    expect(r.strategy).toBe('cluster-pack')
    expect(r.core).toEqual(['a', 'b', 'hub'])
    expect(r.rings.flat().sort()).toEqual(['c', 'd', 'e', 'f', 'g'])
    expect(Object.keys(r.children)).toHaveLength(8)
    expect(overlappingPairs(rectsOf(r))).toEqual([])
    for (const c of Object.values(r.children)) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.width).toBeLessThanOrEqual(r.parentWidth + 1e-6)
      expect(c.y + c.height).toBeLessThanOrEqual(r.parentHeight + 1e-6)
    }
  })

  it('keeps a channel of at least minChannel between core and satellites', () => {
    const { boxes: b, edges } = starWithTriangle()
    const minChannel = 60
    const r = packAroundCore(b, edges, { gapFraction: 0.2, minChannel })
    const coreRects = r.core.map((id) => r.children[id])
    const core = {
      minX: Math.min(...coreRects.map((c) => c.x)),
      minY: Math.min(...coreRects.map((c) => c.y)),
      maxX: Math.max(...coreRects.map((c) => c.x + c.width)),
      maxY: Math.max(...coreRects.map((c) => c.y + c.height)),
    }
    for (const id of r.rings[0]) {
      const c = r.children[id]
      const dx = Math.max(core.minX - (c.x + c.width), c.x - core.maxX, 0)
      const dy = Math.max(core.minY - (c.y + c.height), c.y - core.maxY, 0)
      expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(minChannel - 1e-6)
    }
  })

  it('places satellites on the side of the core member they connect to', () => {
    const b = boxes(['h1', 'h2', 's1', 's2', 's3', 's4'])
    const edges = [
      edge('h1', 'h2'),
      edge('s1', 'h1'),
      edge('s2', 'h1'),
      edge('h2', 's3'),
      edge('h2', 's4'),
    ]
    const r = packAroundCore(b, edges, { gapFraction: 0.2, minChannel: 48 })
    expect(r.core).toEqual(['h1', 'h2'])
    const h1 = center(r.children.h1)
    const h2 = center(r.children.h2)
    expect(h1.x).toBeLessThan(h2.x)
    const coreMid = (h1.x + h2.x) / 2
    for (const id of ['s1', 's2']) {
      expect(center(r.children[id]).x).toBeLessThan(coreMid)
    }
    for (const id of ['s3', 's4']) {
      expect(center(r.children[id]).x).toBeGreaterThan(coreMid)
    }
    expect(overlappingPairs(rectsOf(r))).toEqual([])
  })

  it('overflows into further rings without overlaps', () => {
    const ids = ['hub', ...Array.from({ length: 24 }, (_, i) => `s${i}`)]
    const edges = ids.slice(1).map((id) => edge('hub', id))
    const r = packAroundCore(boxes(ids), edges, {
      gapFraction: 0.2,
      minChannel: 48,
    })
    expect(r.rings.length).toBeGreaterThan(1)
    expect(r.core.length + r.rings.flat().length).toBe(25)
    expect(overlappingPairs(rectsOf(r))).toEqual([])
  })

  it('is deterministic', () => {
    const { boxes: b, edges } = starWithTriangle()
    const a = packAroundCore(b, edges, { gapFraction: 0.2, minChannel: 48 })
    const c = packAroundCore(b, edges, { gapFraction: 0.2, minChannel: 48 })
    expect(c).toEqual(a)
  })
})

describe('placeBalancedSiblings (clustered)', () => {
  it('uses cluster-pack for N≥4 with connections', () => {
    const { boxes: b, edges } = starWithTriangle()
    const r = placeBalancedSiblings(
      b,
      edges.map((e, i) => ({ id: `e${i}`, ...e })),
      { variant: 'clustered' },
    )
    expect(r.strategy).toBe('cluster-pack')
    expect(Object.keys(r.children)).toHaveLength(8)
  })

  it('still uses matrix for N≥4 without any connections', () => {
    const r = placeBalancedSiblings(boxes(['a', 'b', 'c', 'd', 'e']), [], {
      variant: 'clustered',
    })
    expect(r.strategy).toBe('matrix')
  })

  it('leaves favour-grid untouched', () => {
    const { boxes: b, edges } = starWithTriangle()
    const r = placeBalancedSiblings(
      b,
      edges.map((e, i) => ({ id: `e${i}`, ...e })),
      { variant: 'favour-grid' },
    )
    expect(r.strategy).toBe('matrix')
  })
})
