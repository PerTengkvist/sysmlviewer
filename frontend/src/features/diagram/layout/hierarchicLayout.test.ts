import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { LayoutRuleRow } from '../../../api'
import type { PartNodeData } from '../PartNode'
import {
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  DEFAULT_HIERARCHIC_OPTIONS,
  type AutoLayoutDirectives,
  type HierarchicOptions,
} from './autoLayoutOptions'
import { layoutHierarchic } from './hierarchicLayout'
import { buildLayoutConstraints } from './layoutConstraints'
import { overlappingPairs, type QualityRect } from './layoutQuality'
import { resolvePlacementPipeline, pipelineLabel } from './placementPipelines'
import { runPlacementPipeline } from './runPlacementPipeline'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
    w?: number
    h?: number
    isBoundary?: boolean
    parentId?: string
    ports?: PartNodeData['ports']
  } = {},
): Node {
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
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

function conn(
  id: string,
  source: string,
  target: string,
  sourcePort?: string,
  targetPort?: string,
): Edge {
  return {
    id,
    source,
    target,
    sourceHandle: sourcePort,
    targetHandle: targetPort ? `target:${targetPort}` : undefined,
    data: { relationKind: 'connection', routing: 'angular' },
  }
}

function directives(
  h: Partial<HierarchicOptions> = {},
  extra: Partial<AutoLayoutDirectives> = {},
): AutoLayoutDirectives {
  return {
    ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
    mode: 'advanced',
    pipeline: 'hierarchic',
    portPlacement: 'optimized',
    hierarchic: { ...DEFAULT_HIERARCHIC_OPTIONS, ...h },
    ...extra,
  }
}

/** Car boundary with three chained parts a → b → c (port to port). */
function chain(): { nodes: Node[]; edges: Edge[] } {
  const nodes = [
    part('car', { isBoundary: true, w: 600, h: 400 }),
    part('a', {
      parentId: 'car',
      ports: [{ id: 'a.out', name: 'out', side: 'right', offset: 0.5 }],
    }),
    part('b', {
      parentId: 'car',
      ports: [
        { id: 'b.in', name: 'in', side: 'left', offset: 0.4 },
        { id: 'b.out', name: 'out', side: 'right', offset: 0.6 },
      ],
    }),
    part('c', {
      parentId: 'car',
      ports: [{ id: 'c.in', name: 'in', side: 'left', offset: 0.5 }],
    }),
  ]
  const edges = [
    conn('e1', 'a', 'b', 'a.out', 'b.in'),
    conn('e2', 'b', 'c', 'b.out', 'c.in'),
  ]
  return { nodes, edges }
}

function rectsOf(
  patch: Record<string, { x?: number; y?: number; width?: number; height?: number }>,
  ids: string[],
): QualityRect[] {
  return ids.map((id) => ({
    id,
    minX: patch[id].x!,
    minY: patch[id].y!,
    maxX: patch[id].x! + patch[id].width!,
    maxY: patch[id].y! + patch[id].height!,
  }))
}

describe('layoutHierarchic — basics', () => {
  it('lays a chain out left → right with ports facing their peers', async () => {
    const { nodes, edges } = chain()
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'RIGHT' }))
    const { a, b, c } = r.nodes
    expect(a.x!).toBeLessThan(b.x!)
    expect(b.x!).toBeLessThan(c.x!)
    expect(r.nodes['a.out'].side).toBe('right')
    expect(r.nodes['b.in'].side).toBe('left')
    expect(r.nodes['b.out'].side).toBe('right')
    expect(r.nodes['c.in'].side).toBe('left')
    expect(overlappingPairs(rectsOf(r.nodes, ['a', 'b', 'c']))).toEqual([])
    expect(r.iterations).toBeGreaterThanOrEqual(1)
    expect(r.iterations).toBeLessThanOrEqual(DEFAULT_HIERARCHIC_OPTIONS.maxIterations)
    // Boundary grows around the content.
    expect(r.nodes.car.width!).toBeGreaterThan(c.x! + c.width!)
  })

  it('lays a chain out top → down and flips ports to top/bottom', async () => {
    const { nodes, edges } = chain()
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'DOWN' }))
    expect(r.nodes.a.y!).toBeLessThan(r.nodes.b.y!)
    expect(r.nodes.b.y!).toBeLessThan(r.nodes.c.y!)
    expect(r.nodes['a.out'].side).toBe('bottom')
    expect(r.nodes['c.in'].side).toBe('top')
  })

  it('keeps IO ports on the flow sides even when the peer sits elsewhere', async () => {
    const { nodes, edges } = chain()
    const r = await layoutHierarchic(
      nodes,
      edges,
      directives({ direction: 'DOWN' }, { portPlacement: 'inputsLeftOutputsRight' }),
    )
    // Inputs enter from the top, outputs leave at the bottom for DOWN.
    expect(r.nodes['b.in'].side).toBe('top')
    expect(r.nodes['b.out'].side).toBe('bottom')
  })

  it('respects the iteration budget', async () => {
    const { nodes, edges } = chain()
    let runs = 0
    const r = await layoutHierarchic(nodes, edges, directives({ maxIterations: 1 }), {
      layout: async (g) => {
        runs += 1
        const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
        return new ELK().layout(g)
      },
    })
    expect(runs).toBe(1)
    expect(r.iterations).toBe(1)
  })
})

describe('layoutHierarchic — boundary ports', () => {
  it('handles bindings to the boundary port and fan-in into one port (HBox)', async () => {
    const p = (id: string, side: 'left' | 'right' = 'right') => [
      { id: `${id}.event`, name: 'event', side, offset: 0.5 },
    ]
    const nodes = [
      part('hbox', { isBoundary: true, w: 600, h: 400, ports: p('hbox') }),
      part('A', { parentId: 'hbox', ports: p('A') }),
      part('B', { parentId: 'hbox', ports: p('B') }),
      part('C', { parentId: 'hbox', ports: p('C') }),
      part('EB', { parentId: 'hbox', ports: p('EB') }),
    ]
    const edges: Edge[] = [
      {
        ...conn('bind', 'hbox', 'EB', 'hbox.event', 'EB.event'),
        data: { relationKind: 'binding', routing: 'angular' },
      },
      conn('c2', 'B', 'EB', 'B.event', 'EB.event'),
      conn('c3', 'C', 'EB', 'C.event', 'EB.event'),
      conn('c4', 'A', 'EB', 'A.event', 'EB.event'),
    ]
    for (const incremental of [false, true]) {
      const r = await layoutHierarchic(nodes, edges, directives({ incremental }))
      expect(r.nodes.EB.x!).toBeGreaterThan(r.nodes.A.x!)
      // Three sibling links outweigh the single boundary binding: the port
      // faces its peers; the boundary port itself is untouched.
      expect(r.nodes['EB.event'].side).toBe('left')
      expect(r.nodes['hbox.event'].side).toBe('right')
      expect(overlappingPairs(rectsOf(r.nodes, ['A', 'B', 'C', 'EB']))).toEqual([])
    }
  })
})

describe('layoutHierarchic — nesting', () => {
  it('places a nested container among its siblings and its children inside it', async () => {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      part('a', {
        parentId: 'car',
        ports: [{ id: 'a.out', name: 'out', side: 'right', offset: 0.5 }],
      }),
      // Nested container flagged as a boundary (as buildStructureGraph does),
      // with a stale oversized box from an earlier layout.
      part('ecu', { parentId: 'car', isBoundary: true, x: 999, y: 999, w: 900, h: 700 }),
      part('ecu.cpu', {
        parentId: 'ecu',
        ports: [{ id: 'cpu.in', name: 'in', side: 'left', offset: 0.5 }],
      }),
      part('ecu.mem', { parentId: 'ecu' }),
    ]
    const edges = [conn('e1', 'a', 'ecu.cpu', 'a.out', 'cpu.in')]
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'RIGHT' }))
    const ecu = r.nodes.ecu
    expect(ecu.x).not.toBe(999)
    expect(r.nodes.a.x!).toBeLessThan(ecu.x!)
    for (const id of ['ecu.cpu', 'ecu.mem']) {
      const c = r.nodes[id]
      expect(c.x!).toBeGreaterThanOrEqual(0)
      expect(c.y!).toBeGreaterThanOrEqual(0)
      expect(c.x! + c.width!).toBeLessThanOrEqual(ecu.width! + 1e-6)
      expect(c.y! + c.height!).toBeLessThanOrEqual(ecu.height! + 1e-6)
    }
    expect(
      overlappingPairs(rectsOf(r.nodes, ['ecu.cpu', 'ecu.mem'])),
    ).toEqual([])
    // Container shrinks to its children instead of keeping the stale size.
    expect(ecu.width!).toBeLessThan(600)
    expect(ecu.height!).toBeLessThan(500)
    expect(overlappingPairs(rectsOf(r.nodes, ['a', 'ecu']))).toEqual([])
  })
})

describe('layoutHierarchic — constraints', () => {
  const art = (id: string) => ({ id, name: id, kind: 'part', x: 0, y: 0, width: 160, height: 100 })
  const rule = (p: Partial<LayoutRuleRow> & { id: string }): LayoutRuleRow => ({
    kind: 'part',
    namePattern: '*',
    placement: 'below',
    peerKind: 'part',
    peerNamePattern: '*',
    ...p,
  })

  it('belong-to layers override the edge direction and snap into bands', async () => {
    const { nodes, edges } = chain()
    const layered = {
      enabled: true,
      scopes: [
        {
          id: 's1',
          scopePattern: '*',
          direction: 'top-down' as const,
          layers: [{ id: 'l1', name: 'Top' }, { id: 'l2', name: 'Bottom' }],
        },
      ],
    }
    const rules = [
      rule({ id: 'r1', namePattern: 'c', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Top' }),
      rule({ id: 'r2', namePattern: 'a', placement: 'belong to', peerKind: 'layer', peerNamePattern: 'Bottom' }),
    ]
    const constraints = buildLayoutConstraints(
      rules,
      layered,
      ['a', 'b', 'c'].map(art),
      edges.map((e) => ({ source: e.source, target: e.target })),
    )
    const r = await layoutHierarchic(
      nodes,
      edges,
      directives({ direction: 'DOWN' }, { constraints }),
    )
    // c is in the top band although edges flow a → b → c.
    expect(r.nodes.c.y!).toBeLessThan(r.nodes.a.y!)
    // b auto-assigned between them (barycentre → rounds to one of the two bands).
    const bandOfB = constraints.layerOf.get('b')
    expect([0, 1]).toContain(bandOfB)
    // Parts in the same band share the same vertical centre.
    const centreY = (id: string) => r.nodes[id].y! + r.nodes[id].height! / 2
    const sameBand = bandOfB === 0 ? 'c' : 'a'
    expect(centreY('b')).toBeCloseTo(centreY(sameBand), 5)
    expect(overlappingPairs(rectsOf(r.nodes, ['a', 'b', 'c']))).toEqual([])
    expect(r.violatedRuleIds).toEqual([])
  })

  it('in-layer order rule puts A left of B inside the same band', async () => {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      part('a', { parentId: 'car' }),
      part('b', { parentId: 'car' }),
      part('z', { parentId: 'car' }),
    ]
    const edges: Edge[] = [conn('e1', 'z', 'a'), conn('e2', 'z', 'b')]
    const layered = {
      enabled: true,
      scopes: [
        {
          id: 's1',
          scopePattern: '*',
          direction: 'top-down' as const,
          layers: [{ id: 'l1', name: '1' }, { id: 'l2', name: '2' }],
        },
      ],
    }
    const rules = [
      rule({ id: 'r1', namePattern: 'z', placement: 'belong to', peerKind: 'layer', peerNamePattern: '1' }),
      rule({ id: 'r2', namePattern: 'b', placement: 'to the left of', peerNamePattern: 'a' }),
    ]
    const constraints = buildLayoutConstraints(
      rules,
      layered,
      ['a', 'b', 'z'].map(art),
      edges.map((e) => ({ source: e.source, target: e.target })),
    )
    expect(constraints.layerOf.get('a')).toBe(1)
    expect(constraints.layerOf.get('b')).toBe(1)
    const r = await layoutHierarchic(
      nodes,
      edges,
      directives({ direction: 'DOWN' }, { constraints }),
    )
    expect(r.nodes.b.x!).toBeLessThan(r.nodes.a.x!)
    expect(r.nodes.z.y!).toBeLessThan(r.nodes.a.y!)
    expect(r.violatedRuleIds).toEqual([])
  })

  it('precedence without layers is honoured through constraint edges', async () => {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      part('a', { parentId: 'car' }),
      part('b', { parentId: 'car' }),
    ]
    // Edge says a → b, rule says b above a (DOWN): rule wins.
    const edges: Edge[] = [conn('e1', 'a', 'b')]
    const constraints = buildLayoutConstraints(
      [rule({ id: 'r1', namePattern: 'b', placement: 'above', peerNamePattern: 'a' })],
      null,
      ['a', 'b'].map(art),
      [],
      { direction: 'top-down' },
    )
    const r = await layoutHierarchic(
      nodes,
      edges,
      directives({ direction: 'DOWN' }, { constraints }),
    )
    expect(r.nodes.b.y!).toBeLessThan(r.nodes.a.y!)
    expect(Object.keys(r.nodes).some((k) => k.startsWith('__constraint'))).toBe(false)
  })
})

describe('layoutHierarchic — component arrangement', () => {
  it('packs unconnected parts into rows instead of one column', async () => {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      ...Array.from({ length: 9 }, (_, i) => part(`u${i}`, { parentId: 'car' })),
      part('a', {
        parentId: 'car',
        ports: [{ id: 'a.out', name: 'out', side: 'right', offset: 0.5 }],
      }),
      part('b', {
        parentId: 'car',
        ports: [{ id: 'b.in', name: 'in', side: 'left', offset: 0.5 }],
      }),
    ]
    const edges = [conn('e1', 'a', 'b', 'a.out', 'b.in')]
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'RIGHT' }))
    const ids = [...Array.from({ length: 9 }, (_, i) => `u${i}`), 'a', 'b']
    expect(overlappingPairs(rectsOf(r.nodes, ids))).toEqual([])
    const ys = new Set(ids.map((id) => r.nodes[id].y))
    const xs = new Set(ids.map((id) => r.nodes[id].x))
    expect(ys.size).toBeGreaterThan(1)
    expect(xs.size).toBeGreaterThan(2)
    expect(r.nodes.a.x!).toBeLessThan(r.nodes.b.x!)
    const car = r.nodes.car
    for (const id of ids) {
      expect(r.nodes[id].x! + r.nodes[id].width!).toBeLessThanOrEqual(car.width!)
      expect(r.nodes[id].y! + r.nodes[id].height!).toBeLessThanOrEqual(car.height!)
    }
  })
})

describe('layoutHierarchic — incremental', () => {
  it('keeps the existing order of unconnected parts when one is added', async () => {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      part('p1', { parentId: 'car', x: 60, y: 300 }),
      part('p2', { parentId: 'car', x: 60, y: 60 }),
      part('p3', { parentId: 'car', x: 300, y: 180 }),
    ]
    const r = await layoutHierarchic(
      nodes,
      [],
      directives({ direction: 'RIGHT', incremental: true }),
    )
    // p2 stays above p1 as in the current arrangement.
    expect(r.nodes.p2.y!).toBeLessThan(r.nodes.p1.y!)
  })
})

describe('hierarchic pipeline resolution', () => {
  it('is an Advanced pipeline backed by ELK layered without nest/non-overlap steps', () => {
    const resolved = resolvePlacementPipeline(directives())
    expect(resolved.id).toBe('hierarchic')
    expect(resolved.elkAlgorithm).toBe('layered')
    expect(resolved.steps).toEqual(['primary-layout', 'fit-boundary'])
    expect(pipelineLabel('hierarchic')).toMatch(/Hierarchic/)
  })

  it('runPlacementPipeline routes to the hierarchic layout', async () => {
    const { nodes, edges } = chain()
    const r = await runPlacementPipeline(nodes, edges, directives({ direction: 'RIGHT' }))
    expect(r.nodes.a.x!).toBeLessThan(r.nodes.b.x!)
    expect(r.nodes['a.out'].side).toBe('right')
  })
})

describe('layoutHierarchic — scoped layers inside containers', () => {
  const art = (id: string, parentId: string | null) => ({
    id,
    name: id.split('::').pop()!,
    kind: 'part',
    parentId,
    x: 0,
    y: 0,
    width: 160,
    height: 100,
  })
  const rule = (p: Partial<LayoutRuleRow> & { id: string }): LayoutRuleRow => ({
    kind: 'part',
    namePattern: '*',
    placement: 'belong to',
    peerKind: 'layer',
    peerNamePattern: '*',
    ...p,
  })
  const scopes = (ecuDirection: 'top-down' | 'left-right') => ({
    enabled: true,
    scopes: [
      {
        id: 'root',
        scopePattern: '*',
        direction: 'top-down' as const,
        layers: [{ id: 'l1', name: 'Top' }, { id: 'l2', name: 'Bottom' }],
      },
      {
        id: 'ecu',
        scopePattern: '*Ecu',
        direction: ecuDirection,
        layers: [{ id: 'l1', name: 'UI' }, { id: 'l2', name: 'Core' }],
      },
    ],
  })

  function model() {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      part('x', { parentId: 'car' }),
      part('infoEcu', { parentId: 'car', isBoundary: true, w: 900, h: 700 }),
      part('a', { parentId: 'infoEcu' }),
      part('b', { parentId: 'infoEcu' }),
      part('c', { parentId: 'infoEcu' }),
      part('engineEcu', { parentId: 'car', isBoundary: true }),
      part('ctrl', { parentId: 'engineEcu' }),
      part('mon', { parentId: 'engineEcu' }),
    ]
    const edges: Edge[] = [conn('e1', 'a', 'b'), conn('e2', 'x', 'ctrl')]
    const arts = [
      art('car', null),
      art('x', 'car'),
      art('infoEcu', 'car'),
      art('a', 'infoEcu'),
      art('b', 'infoEcu'),
      art('c', 'infoEcu'),
      art('engineEcu', 'car'),
      art('ctrl', 'engineEcu'),
      art('mon', 'engineEcu'),
    ]
    const rules = [
      rule({ id: 'r1', namePattern: 'x', peerNamePattern: 'Top' }),
      rule({ id: 'r2', namePattern: '*Ecu', peerNamePattern: 'Bottom' }),
      rule({ id: 'r3', namePattern: 'c', peerNamePattern: 'UI' }),
      rule({ id: 'r4', namePattern: 'a', peerNamePattern: 'Core' }),
      rule({ id: 'r5', namePattern: 'mon', peerNamePattern: 'UI' }),
      rule({ id: 'r6', namePattern: 'ctrl', peerNamePattern: 'Core' }),
    ]
    return { nodes, edges, arts, rules }
  }

  const inside = (
    r: Awaited<ReturnType<typeof layoutHierarchic>>,
    child: string,
    container: string,
  ) => {
    const c = r.nodes[child]
    const p = r.nodes[container]
    expect(c.x!, `${child} left`).toBeGreaterThanOrEqual(0)
    expect(c.y!, `${child} top`).toBeGreaterThanOrEqual(0)
    expect(c.x! + c.width!, `${child} right`).toBeLessThanOrEqual(p.width! + 1e-6)
    expect(c.y! + c.height!, `${child} bottom`).toBeLessThanOrEqual(p.height! + 1e-6)
  }

  it('lays out the container children in their own bands (top-down)', async () => {
    const { nodes, edges, arts, rules } = model()
    const constraints = buildLayoutConstraints(rules, scopes('top-down'), arts, [
      { source: 'a', target: 'b' },
      { source: 'x', target: 'ctrl' },
    ])
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'DOWN' }, { constraints }))
    // Inside infoEcu: c in band UI above a in band Core, b auto-assigned after a.
    expect(r.nodes.c.y!).toBeLessThan(r.nodes.a.y!)
    for (const id of ['a', 'b', 'c']) inside(r, id, 'infoEcu')
    for (const id of ['ctrl', 'mon']) inside(r, id, 'engineEcu')
    expect(overlappingPairs(rectsOf(r.nodes, ['a', 'b', 'c']))).toEqual([])
    expect(overlappingPairs(rectsOf(r.nodes, ['ctrl', 'mon']))).toEqual([])
    // Root bands: x on top, both ECUs below.
    expect(r.nodes.x.y!).toBeLessThan(r.nodes.infoEcu.y!)
    expect(r.nodes.x.y!).toBeLessThan(r.nodes.engineEcu.y!)
    expect(overlappingPairs(rectsOf(r.nodes, ['x', 'infoEcu', 'engineEcu']))).toEqual([])
    // Stale container size does not survive.
    expect(r.nodes.infoEcu.width!).toBeLessThan(900)
    expect(r.violatedRuleIds).toEqual([])
    expect(Object.keys(r.nodes).some((k) => k.startsWith('__'))).toBe(false)
  })

  it('a left-right scope inside a top-down diagram forms columns', async () => {
    const { nodes, edges, arts, rules } = model()
    const constraints = buildLayoutConstraints(rules, scopes('left-right'), arts, [])
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'DOWN' }, { constraints }))
    expect(r.nodes.c.x!).toBeLessThan(r.nodes.a.x!)
    const cy = (id: string) => r.nodes[id].y! + r.nodes[id].height! / 2
    // UI column holds only c; Core column holds a and b stacked.
    expect(Math.abs(cy('c') - cy('a'))).toBeGreaterThan(0)
    for (const id of ['a', 'b', 'c']) inside(r, id, 'infoEcu')
    expect(r.nodes.infoEcu.width!).toBeGreaterThanOrEqual(2 * 160)
  })

  it('works without root layers: only the container scope is layered', async () => {
    const { nodes, edges, arts, rules } = model()
    const onlyEcu = { ...scopes('top-down'), scopes: [scopes('top-down').scopes[1]] }
    const constraints = buildLayoutConstraints(
      rules.filter((x) => x.id !== 'r1' && x.id !== 'r2'),
      onlyEcu,
      arts,
      [],
    )
    expect(constraints.layerCount).toBe(3) // default root scope added by normalisation
    const r = await layoutHierarchic(nodes, edges, directives({ direction: 'RIGHT' }, { constraints }))
    expect(r.nodes.c.y!).toBeLessThan(r.nodes.a.y!)
    for (const id of ['a', 'b', 'c']) inside(r, id, 'infoEcu')
    expect(overlappingPairs(rectsOf(r.nodes, ['x', 'infoEcu', 'engineEcu']))).toEqual([])
  })
})
