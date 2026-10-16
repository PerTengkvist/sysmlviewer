import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  chooseElkAlgorithm,
  collectScopeMetrics,
  corridorPad,
  levelForParent,
  planScope,
  spacingScale,
  suggestWeightsForLevel,
  useFixedSidePorts,
} from './adaptiveLayoutPolicy'
import { SUGGESTED_LEVEL_WEIGHTS } from './autoLayoutOptions'

function part(
  id: string,
  opts: {
    parentId?: string
    isBoundary?: boolean
    ports?: PartNodeData['ports']
  } = {},
): Node {
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: 0, y: 0 },
    width: 160,
    height: 100,
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

function edge(
  id: string,
  source: string,
  target: string,
  sourcePort: string,
  targetPort: string,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: sourcePort,
    targetHandle: `target:${targetPort}`,
  }
}

describe('levelForParent', () => {
  it('maps boundary / depth 0 to root', () => {
    expect(levelForParent(0, 3, true)).toBe('root')
    expect(levelForParent(0, 3, false)).toBe('root')
  })

  it('maps deepest band to leaf', () => {
    expect(levelForParent(3, 3, false)).toBe('leaf')
    expect(levelForParent(2, 3, false)).toBe('leaf')
  })

  it('maps intermediate depths to mid', () => {
    expect(levelForParent(1, 3, false)).toBe('mid')
  })
})

describe('suggestWeightsForLevel', () => {
  it('returns suggested presets', () => {
    expect(suggestWeightsForLevel('leaf')).toEqual(SUGGESTED_LEVEL_WEIGHTS.leaf)
    expect(suggestWeightsForLevel('root').connectionAwareness).toBe(0.85)
  })
})

describe('collectScopeMetrics + chooseElkAlgorithm', () => {
  it('chooses rectpacking when there are no edges among children', () => {
    const nodes = [
      part('p', {}),
      part('a', { parentId: 'p' }),
      part('b', { parentId: 'p' }),
    ]
    const metrics = collectScopeMetrics('p', nodes, [])
    expect(metrics.childCount).toBe(2)
    expect(metrics.edgeCount).toBe(0)
    expect(chooseElkAlgorithm(metrics, SUGGESTED_LEVEL_WEIGHTS.mid)).toBe(
      'rectpacking',
    )
  })

  it('chooses layered for high flow + DAG with IO ports', () => {
    const nodes = [
      part('p', {}),
      part('a', {
        parentId: 'p',
        ports: [
          { id: 'a::out', name: 'energyOut', side: 'right', offset: 0.5 },
        ],
      }),
      part('b', {
        parentId: 'p',
        ports: [
          { id: 'b::in', name: 'energyIn', side: 'left', offset: 0.5 },
        ],
      }),
      part('c', {
        parentId: 'p',
        ports: [
          { id: 'c::in', name: 'signalIn', side: 'left', offset: 0.5 },
        ],
      }),
    ]
    const edges = [
      edge('e1', 'a', 'b', 'a::out', 'b::in'),
      edge('e2', 'a', 'c', 'a::out', 'c::in'),
    ]
    const metrics = collectScopeMetrics('p', nodes, edges)
    expect(metrics.isDagish).toBe(true)
    expect(metrics.ioSkew).toBeGreaterThan(0.5)
    const weights = {
      ...SUGGESTED_LEVEL_WEIGHTS.leaf,
      flowDirection: 0.95,
      bendMinimization: 0.9,
      connectionAwareness: 0.2,
      compactness: 0.1,
    }
    expect(chooseElkAlgorithm(metrics, weights)).toBe('layered')
  })

  it('chooses stress for high connection awareness and density', () => {
    const nodes = [
      part('p', {}),
      part('a', { parentId: 'p' }),
      part('b', { parentId: 'p' }),
      part('c', { parentId: 'p' }),
      part('d', { parentId: 'p' }),
    ]
    const edges = [
      edge('e1', 'a', 'b', 'pa', 'pb'),
      edge('e2', 'a', 'c', 'pa2', 'pc'),
      edge('e3', 'b', 'd', 'pb2', 'pd'),
      edge('e4', 'c', 'd', 'pc2', 'pd2'),
      edge('e5', 'a', 'd', 'pa3', 'pd3'),
    ]
    const metrics = collectScopeMetrics('p', nodes, edges)
    expect(metrics.density).toBeGreaterThan(1)
    const weights = {
      ...SUGGESTED_LEVEL_WEIGHTS.root,
      connectionAwareness: 0.95,
      flowDirection: 0.15,
      bendMinimization: 0.2,
      compactness: 0.2,
    }
    expect(chooseElkAlgorithm(metrics, weights)).toBe('stress')
  })
})

describe('spacing helpers', () => {
  it('scales spacing up with bendMinimization and down with compactness', () => {
    const spacious = spacingScale({
      connectionAwareness: 0.5,
      flowDirection: 0.5,
      compactness: 0,
      portClarity: 0.8,
      bendMinimization: 1,
    })
    const compact = spacingScale({
      connectionAwareness: 0.5,
      flowDirection: 0.5,
      compactness: 1,
      portClarity: 0,
      bendMinimization: 0,
    })
    expect(spacious).toBeGreaterThan(compact)
  })

  it('grows corridor pad with bendMinimization', () => {
    expect(
      corridorPad({
        connectionAwareness: 0.5,
        flowDirection: 0.5,
        compactness: 0.2,
        portClarity: 0.9,
        bendMinimization: 0.8,
      }),
    ).toBeGreaterThan(24)
  })

  it('uses FIXED_SIDE when flow or portClarity is high', () => {
    expect(
      useFixedSidePorts({
        ...SUGGESTED_LEVEL_WEIGHTS.leaf,
        flowDirection: 0.5,
        portClarity: 0.5,
      }),
    ).toBe(true)
    expect(
      useFixedSidePorts({
        ...SUGGESTED_LEVEL_WEIGHTS.root,
        flowDirection: 0.2,
        portClarity: 0.4,
      }),
    ).toBe(false)
  })
})

describe('planScope', () => {
  it('plans root boundary with suggested root weights', () => {
    const nodes = [
      part('Car', { isBoundary: true }),
      part('ecu', { parentId: 'Car' }),
      part('motor', { parentId: 'Car' }),
    ]
    const edges = [edge('e1', 'ecu', 'motor', 'p1', 'p2')]
    const plan = planScope('Car', nodes, edges, SUGGESTED_LEVEL_WEIGHTS, {
      isBoundary: true,
      depth: 0,
      maxDepth: 1,
    })
    expect(plan.level).toBe('root')
    expect(plan.weights).toEqual(SUGGESTED_LEVEL_WEIGHTS.root)
    expect(plan.algorithm).not.toBe('rectpacking')
  })
})
