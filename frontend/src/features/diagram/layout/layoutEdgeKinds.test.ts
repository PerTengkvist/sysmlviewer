import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import {
  defaultLayoutEdgeKinds,
  layoutEdgesFor,
  resolveLayoutEdgeKinds,
} from './layoutEdgeKinds'
import { isLayoutNode } from './layoutNodes'
import { runPlacementPipeline } from './runPlacementPipeline'
import { DEFAULT_AUTO_LAYOUT_DIRECTIVES } from './autoLayoutOptions'
import type { PlacementPipelineId } from './placementPipelines'

function edge(
  id: string,
  relationKind: string,
  source: string,
  target: string,
  ports = false,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: ports ? `${source}::out` : `rel-src-${id}`,
    targetHandle: ports ? `target:${target}::in` : `rel-tgt-${id}`,
    data: { relationKind },
  }
}

const connection = edge('c1', 'connection', 'a', 'b', true)
const binding = edge('b1', 'binding', 'a', 'b', true)
const refine = edge('d1', 'dependency', 'uc', 'r1')
const satisfy = edge('s1', 'satisfy', 'a', 'r1')
const include = edge('i1', 'include', 'uc', 'uc2')
const all = [connection, binding, refine, satisfy, include]

const ids = (edges: Edge[]) => edges.map((e) => e.id).sort()

describe('isLayoutNode', () => {
  it('places parts, requirements, use cases and actors, not port labels', () => {
    const n = (type?: string) => ({ id: 'x', type, position: { x: 0, y: 0 }, data: {} }) as Node
    expect(isLayoutNode(n())).toBe(true)
    expect(isLayoutNode(n('part'))).toBe(true)
    expect(isLayoutNode(n('requirement'))).toBe(true)
    expect(isLayoutNode(n('useCase'))).toBe(true)
    expect(isLayoutNode(n('actor'))).toBe(true)
    expect(isLayoutNode(n('portAnnotation'))).toBe(false)
  })
})

describe('layoutEdgesFor', () => {
  it('routes connections and bindings whatever the placement choice', () => {
    const { routed } = layoutEdgesFor(all, {
      connections: false,
      bindings: false,
      relations: true,
    })
    expect(ids(routed)).toEqual(['b1', 'c1'])
  })

  it('places by the checked kinds only', () => {
    expect(
      ids(layoutEdgesFor(all, { connections: true, bindings: false, relations: false }).placement),
    ).toEqual(['c1'])
    expect(
      ids(layoutEdgesFor(all, { connections: false, bindings: true, relations: false }).placement),
    ).toEqual(['b1'])
    expect(
      ids(layoutEdgesFor(all, { connections: false, bindings: false, relations: true }).placement),
    ).toEqual(['d1', 'i1', 's1'])
  })

  it('turns relations into node-to-node placement edges without handles', () => {
    const { placement } = layoutEdgesFor([refine], {
      connections: true,
      bindings: true,
      relations: true,
    })
    expect(placement[0]).toMatchObject({
      id: 'd1',
      source: 'uc',
      target: 'r1',
      sourceHandle: null,
      targetHandle: null,
    })
  })

  it('treats requirement relations on boundary anchors as relations, never routed', () => {
    // Requirements and use cases share boundary anchors: handles are anchor
    // ids, not rel-… handles, yet these are still relations.
    const anchored: Edge = {
      id: 'd9',
      source: 'r1',
      target: 'r2',
      sourceHandle: 'a-right',
      targetHandle: 'target:a-left',
      data: { relationKind: 'dependency' },
    }
    const { routed, placement } = layoutEdgesFor([connection, anchored], {
      connections: true,
      bindings: true,
      relations: true,
    })
    expect(ids(routed)).toEqual(['c1'])
    expect(ids(placement)).toEqual(['c1', 'd9'])
  })

  it('leaves bindings out of routing when the binding setting is off', () => {
    const { routed } = layoutEdgesFor(
      all,
      { connections: true, bindings: true, relations: false },
      { routeBindings: false },
    )
    expect(ids(routed)).toEqual(['c1'])
  })
})

describe('default edge kinds', () => {
  it('uses relations only when the diagram has no connections', () => {
    expect(defaultLayoutEdgeKinds([refine, satisfy], true)).toEqual({
      connections: true,
      bindings: true,
      relations: true,
    })
    expect(defaultLayoutEdgeKinds(all, false)).toEqual({
      connections: true,
      bindings: false,
      relations: false,
    })
  })

  it('a saved per-view choice wins over the default', () => {
    const saved = { connections: false, bindings: false, relations: true }
    expect(resolveLayoutEdgeKinds(saved, all, true)).toEqual(saved)
    expect(resolveLayoutEdgeKinds(null, all, true)).toEqual(
      defaultLayoutEdgeKinds(all, true),
    )
  })
})

function box(id: string, type: string, x: number, y: number): Node {
  return {
    id,
    type,
    position: { x, y },
    width: 200,
    height: 120,
    style: { width: 200, height: 120 },
    data: { label: id, artifactId: id },
  }
}

describe('AutoLayout of a traceability diagram (relations only)', () => {
  // One use case refining three requirements, all piled on one spot.
  const nodes = [
    box('uc', 'useCase', 0, 0),
    box('r1', 'requirement', 10, 10),
    box('r2', 'requirement', 20, 20),
    box('r3', 'requirement', 30, 30),
  ]
  const relations = ['r1', 'r2', 'r3'].map((r, i) => edge(`d${i}`, 'dependency', 'uc', r))
  const placement = layoutEdgesFor(relations, {
    connections: true,
    bindings: true,
    relations: true,
  }).placement

  const overlaps = (patch: Record<string, { x?: number | null; y?: number | null }>) => {
    const out: string[] = []
    const ids = Object.keys(patch)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = patch[ids[i]!]!
        const b = patch[ids[j]!]!
        if (
          a.x! < b.x! + 200 &&
          b.x! < a.x! + 200 &&
          a.y! < b.y! + 120 &&
          b.y! < a.y! + 120
        ) {
          out.push(`${ids[i]}/${ids[j]}`)
        }
      }
    }
    return out
  }

  const pipelines: PlacementPipelineId[] = ['hierarchic', 'favour-grid', 'connection-aware']
  for (const pipeline of pipelines) {
    it(`${pipeline}: places requirement and use case nodes without overlap`, async () => {
      const result = await runPlacementPipeline(nodes, placement, {
        ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
        mode: 'advanced',
        pipeline,
      })
      for (const id of ['uc', 'r1', 'r2', 'r3']) {
        expect(result.nodes[id]?.x, `${id} placed`).toBeTypeOf('number')
      }
      expect(overlaps(result.nodes)).toEqual([])
    }, 15_000)
  }

  it('hierarchic: the requirements form the next layer after the use case', async () => {
    const result = await runPlacementPipeline(nodes, placement, {
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'advanced',
      pipeline: 'hierarchic',
    })
    const uc = result.nodes.uc!
    for (const r of ['r1', 'r2', 'r3']) {
      const p = result.nodes[r]!
      // Either direction of the layered flow: strictly beyond the use case.
      const beyond = p.x! >= uc.x! + 200 || p.y! >= uc.y! + 120
      expect(beyond, `${r} after uc`).toBe(true)
    }
  }, 15_000)
})

describe('composition layout without a boundary part', () => {
  // A requirement diagram has no enclosing part: the top level itself must be
  // arranged, not only the children of parts.
  const tower = [
    box('a', 'requirement', 0, 0),
    box('b', 'requirement', 0, 400),
    box('c', 'requirement', 0, 800),
    box('d', 'requirement', 0, 1200),
    box('e', 'requirement', 600, 0),
  ]
  const links = ['b', 'c', 'd'].map((t) => edge(`x${t}`, 'dependency', 'a', t))
  const placement = layoutEdgesFor(links, {
    connections: true,
    bindings: true,
    relations: true,
  }).placement

  for (const pipeline of ['favour-grid', 'clustered'] as PlacementPipelineId[]) {
    it(`${pipeline}: rearranges the top level`, async () => {
      const result = await runPlacementPipeline(tower, placement, {
        ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
        mode: 'advanced',
        pipeline,
      })
      const moved = tower.filter((n) => {
        const p = result.nodes[n.id]!
        return p.x !== n.position.x || p.y !== n.position.y
      })
      expect(moved.length).toBeGreaterThan(0)
      // The tall column is folded into a compacter block.
      const ys = tower.map((n) => result.nodes[n.id]!.y!)
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1200)
    }, 15_000)
  }
})
