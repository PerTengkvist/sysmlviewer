import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import {
  dependencyLayers,
  layoutByDependency,
  orientEdgeHandles,
} from './dependencyLayout'

function n(id: string, w = 100, h = 40): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    width: w,
    height: h,
    style: { width: w, height: h },
  }
}

function e(source: string, target: string): Edge {
  return { id: `${source}->${target}`, source, target }
}

describe('dependencyLayers', () => {
  it('layers a chain A→B→C→D', () => {
    expect(
      dependencyLayers(
        ['A', 'B', 'C', 'D'],
        [
          { source: 'A', target: 'B' },
          { source: 'B', target: 'C' },
          { source: 'C', target: 'D' },
        ],
      ),
    ).toEqual([['A'], ['B'], ['C'], ['D']])
  })

  it('layers one-to-many A→B, A→C, A→D', () => {
    expect(
      dependencyLayers(
        ['A', 'B', 'C', 'D'],
        [
          { source: 'A', target: 'B' },
          { source: 'A', target: 'C' },
          { source: 'A', target: 'D' },
        ],
      ),
    ).toEqual([['A'], ['B', 'C', 'D']])
  })
})

describe('layoutByDependency', () => {
  it('places D furthest for TD chain and siblings side-by-side', () => {
    const nodes = [n('A'), n('B'), n('C'), n('D')]
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'D')]
    const { positions } = layoutByDependency(nodes, edges, 'TD')
    expect(positions.A.y).toBeLessThan(positions.B.y)
    expect(positions.B.y).toBeLessThan(positions.C.y)
    expect(positions.C.y).toBeLessThan(positions.D.y)
    // gap between layers = 100% of max(layer heights); equal 40 → gap 40
    expect(positions.B.y - positions.A.y).toBe(40 + 40)
    expect(positions.A.y).toBe(48)

    const fan = layoutByDependency(
      [n('A'), n('B'), n('C'), n('D')],
      [e('A', 'B'), e('A', 'C'), e('A', 'D')],
      'TD',
    ).positions
    expect(fan.B.y).toBe(fan.C.y)
    expect(fan.C.y).toBe(fan.D.y)
    expect(fan.B.x).toBeLessThan(fan.C.x)
    expect(fan.C.x).toBeLessThan(fan.D.x)
    // sibling gap: 100%*max(100,100)=100 → C.x = 48+100+100
    expect(fan.C.x).toBe(48 + 100 + 100)
  })

  it('places D furthest for LR chain and siblings stacked', () => {
    const { positions } = layoutByDependency(
      [n('A'), n('B'), n('C'), n('D')],
      [e('A', 'B'), e('B', 'C'), e('C', 'D')],
      'LR',
    )
    expect(positions.A.x).toBeLessThan(positions.B.x)
    expect(positions.B.x).toBeLessThan(positions.C.x)
    expect(positions.C.x).toBeLessThan(positions.D.x)

    const fan = layoutByDependency(
      [n('A'), n('B'), n('C'), n('D')],
      [e('A', 'B'), e('A', 'C'), e('A', 'D')],
      'LR',
    ).positions
    expect(fan.B.x).toBe(fan.C.x)
    expect(fan.B.y).toBeLessThan(fan.C.y)
    expect(fan.C.y).toBeLessThan(fan.D.y)
  })
})

describe('orientEdgeHandles', () => {
  it('wires decision ports for TD and LR', () => {
    const decision: Node = {
      id: 'D',
      position: { x: 0, y: 0 },
      data: { isDecision: true },
    }
    const action: Node = {
      id: 'A',
      position: { x: 0, y: 0 },
      data: {},
    }
    const nodes = [decision, action]
    const edges: Edge[] = [
      { id: 'in', source: 'A', target: 'D', sourceHandle: 'out', targetHandle: 'in' },
      {
        id: 'yes',
        source: 'D',
        target: 'A',
        label: 'YES',
        sourceHandle: 'yes',
        targetHandle: 'in',
      },
      {
        id: 'no',
        source: 'D',
        target: 'A',
        label: 'NO',
        sourceHandle: 'no',
        targetHandle: 'in',
      },
    ]

    const td = orientEdgeHandles(edges, 'TD', nodes)
    expect(td.find((e) => e.id === 'in')).toMatchObject({
      targetHandle: 'in-top',
      sourceHandle: 'bottom',
    })
    expect(td.find((e) => e.id === 'yes')).toMatchObject({
      sourceHandle: 'out-left',
      targetHandle: 'top',
    })
    expect(td.find((e) => e.id === 'no')).toMatchObject({
      sourceHandle: 'out-right',
      targetHandle: 'top',
    })

    const lr = orientEdgeHandles(edges, 'LR', nodes)
    expect(lr.find((e) => e.id === 'in')).toMatchObject({
      targetHandle: 'in-left',
      sourceHandle: 'out',
    })
    expect(lr.find((e) => e.id === 'yes')).toMatchObject({
      sourceHandle: 'out-top',
      targetHandle: 'in',
    })
    expect(lr.find((e) => e.id === 'no')).toMatchObject({
      sourceHandle: 'out-bottom',
      targetHandle: 'in',
    })
  })
})
