import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  balancedGapFraction,
  layoutBalancedBottomUp,
  placeBalancedSiblings,
} from './balancedLayout'

function part(
  id: string,
  opts: {
    parentId?: string
    isBoundary?: boolean
    w?: number
    h?: number
    ports?: PartNodeData['ports']
  } = {},
): Node {
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: 0, y: 0 },
    width: opts.w ?? 160,
    height: opts.h ?? 100,
    style: { width: opts.w ?? 160, height: opts.h ?? 100 },
    data: {
      label: id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

describe('balancedGapFraction', () => {
  it('maps spacing presets to 15–25%', () => {
    expect(balancedGapFraction('compact')).toBe(0.15)
    expect(balancedGapFraction('normal')).toBe(0.2)
    expect(balancedGapFraction('spacious')).toBe(0.25)
  })
})

describe('placeBalancedSiblings', () => {
  it('centers a single child with 25% larger parent', () => {
    const r = placeBalancedSiblings([{ id: 'a', w: 200, h: 100 }], [])
    expect(r.strategy).toBe('center')
    expect(r.parentWidth).toBeCloseTo(250)
    expect(r.parentHeight).toBeCloseTo(125)
  })

  it('stacks two siblings horizontally by default', () => {
    const r = placeBalancedSiblings(
      [
        { id: 'a', w: 100, h: 80 },
        { id: 'b', w: 100, h: 80 },
      ],
      [],
      { gapFraction: 0.2 },
    )
    expect(r.strategy).toBe('stack-h')
    expect(r.children.b.x).toBeGreaterThan(r.children.a.x)
  })

  it('uses onion for three siblings in both variants', () => {
    const boxes = [
      { id: 'a', w: 100, h: 80 },
      { id: 'b', w: 100, h: 80 },
      { id: 'c', w: 100, h: 80 },
    ]
    const edges = [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        sourceHandle: 'p1',
        targetHandle: 'target:p2',
      },
    ] as Edge[]
    expect(
      placeBalancedSiblings(boxes, edges, { variant: 'clustered' }).strategy,
    ).toBe('onion')
    expect(
      placeBalancedSiblings(boxes, edges, { variant: 'favour-grid' }).strategy,
    ).toBe('onion')
  })

  it('clustered prefers onion when a hub has degree ≥ 3', () => {
    const boxes = [
      { id: 'hub', w: 100, h: 80 },
      { id: 'a', w: 100, h: 80 },
      { id: 'b', w: 100, h: 80 },
      { id: 'c', w: 100, h: 80 },
      { id: 'orphan', w: 100, h: 80 },
    ]
    const edges = [
      {
        id: 'e1',
        source: 'hub',
        target: 'a',
        sourceHandle: 'p1',
        targetHandle: 'target:p2',
      },
      {
        id: 'e2',
        source: 'hub',
        target: 'b',
        sourceHandle: 'p3',
        targetHandle: 'target:p4',
      },
      {
        id: 'e3',
        source: 'hub',
        target: 'c',
        sourceHandle: 'p5',
        targetHandle: 'target:p6',
      },
    ] as Edge[]
    expect(
      placeBalancedSiblings(boxes, edges, { variant: 'clustered' }).strategy,
    ).toBe('onion')
  })

  it('favour-grid prefers matrix for N≥4 with orphans', () => {
    const boxes = [
      { id: 'hub', w: 100, h: 80 },
      { id: 'a', w: 100, h: 80 },
      { id: 'b', w: 100, h: 80 },
      { id: 'orphan1', w: 100, h: 80 },
      { id: 'orphan2', w: 100, h: 80 },
      { id: 'orphan3', w: 100, h: 80 },
    ]
    const edges = [
      {
        id: 'e1',
        source: 'hub',
        target: 'a',
        sourceHandle: 'p1',
        targetHandle: 'target:p2',
      },
      {
        id: 'e2',
        source: 'hub',
        target: 'b',
        sourceHandle: 'p3',
        targetHandle: 'target:p4',
      },
    ] as Edge[]
    const r = placeBalancedSiblings(boxes, edges, {
      variant: 'favour-grid',
      aspectRatio: 1,
    })
    expect(r.strategy).toBe('matrix')
    const xs = Object.values(r.children).map((c) => Math.round(c.x))
    expect(new Set(xs).size).toBeGreaterThan(1)
    // Matrix should be wider than a single column of 6 cells.
    expect(r.parentWidth).toBeGreaterThan(r.parentHeight * 0.55)
  })
})

describe('layoutBalancedBottomUp', () => {
  it('favour-grid places boundary peers in a matrix', () => {
    const nodes = [
      part('Car', { isBoundary: true, w: 400, h: 300 }),
      part('a', { parentId: 'Car', w: 120, h: 80 }),
      part('b', { parentId: 'Car', w: 120, h: 80 }),
      part('c', { parentId: 'Car', w: 120, h: 80 }),
      part('d', { parentId: 'Car', w: 120, h: 80 }),
    ]
    const { nodePatch, strategies } = layoutBalancedBottomUp(nodes, [], {
      spacing: 'normal',
      aspectRatio: 1,
      variant: 'favour-grid',
    })
    expect(strategies.Car).toBe('matrix')
    const xs = ['a', 'b', 'c', 'd'].map((id) => nodePatch[id]!.x!)
    expect(new Set(xs.map((x) => Math.round(x))).size).toBeGreaterThan(1)
  })

  it('centers a lone nested child inside parent', () => {
    const nodes = [
      part('Car', { isBoundary: true, w: 800, h: 600 }),
      part('ecu', { parentId: 'Car', w: 100, h: 80 }),
      part('sw', { parentId: 'ecu', w: 140, h: 72 }),
    ]
    const { nodePatch, strategies } = layoutBalancedBottomUp(nodes, [], {
      variant: 'favour-grid',
    })
    expect(strategies.ecu).toBe('center')
    expect(nodePatch.ecu!.width!).toBeGreaterThanOrEqual(140 * 1.25)
  })
})
