import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { clampPortOffset } from './portPlacement'
import {
  asAngularForLayout,
  buildElkGraph,
  demoteNestedBoundaries,
  layoutStructureWithElk,
  portFromElk,
  seedPortSide,
} from './elkStructureLayout'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
    w?: number
    h?: number
    label?: string
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
      label: opts.label ?? id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

describe('buildElkGraph', () => {
  it('maps boundary + two parts with port handles to ELK nodes/ports/edges', () => {
    const nodes = [
      part('root', {
        isBoundary: true,
        w: 500,
        h: 300,
        ports: [{ id: 'root::p', name: 'p', side: 'left', offset: 0.4 }],
      }),
      part('a', {
        parentId: 'root',
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.4 }],
      }),
      part('b', {
        parentId: 'root',
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.4 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const g = buildElkGraph(nodes, edges, {
      includeEdges: false,
      layoutNodes: true,
      directives: {
        mode: 'simple',
        algorithm: 'stress',
        portPlacement: 'optimized',
        spacing: 'normal',
        aspectRatio: 1,
      },
    })
    expect(g.id).toBe('root')
    expect(g.layoutOptions?.['elk.algorithm']).toBe('stress')
    expect(g.children?.map((c) => c.id).sort()).toEqual(['a', 'b'])
    const a = g.children!.find((c) => c.id === 'a')!
    expect(a.ports?.some((p) => p.id === 'a::out')).toBe(true)
    expect(g.edges?.some((e) => e.id === 'c1')).toBe(true)
    // AutoLayout uses part↔part edges for stress connectivity.
    const e = g.edges!.find((x) => x.id === 'c1')!
    expect(e.sources).toContain('a')
    expect(e.targets).toContain('b')
  })

  it('uses port endpoints when layoutNodes is false (redraw)', () => {
    const nodes = [
      part('root', { isBoundary: true, w: 500, h: 300 }),
      part('a', {
        parentId: 'root',
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.4 }],
      }),
      part('b', {
        parentId: 'root',
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.4 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const g = buildElkGraph(nodes, edges, { layoutNodes: false })
    expect(g.layoutOptions?.['elk.algorithm']).toBe('layered')
    const e = g.edges!.find((x) => x.id === 'c1')!
    expect(e.sources).toContain('a::out')
    expect(e.targets).toContain('b::in')
  })

  it('skips nested grandchildren as root children', () => {
    const nodes = [
      part('root', { isBoundary: true, w: 500, h: 300 }),
      part('ecu', { parentId: 'root' }),
      part('nested', { parentId: 'ecu' }),
    ]
    const g = buildElkGraph(nodes, [], { layoutNodes: true })
    expect(g.children?.map((c) => c.id)).toEqual(['ecu'])
  })
})

describe('asAngularForLayout', () => {
  it('includes direct port-to-port connections', () => {
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
        data: { routing: 'direct', relationKind: 'connection' },
      },
      {
        id: 'dep1',
        source: 'a',
        target: 'b',
        sourceHandle: 'rel-src-dep1',
        targetHandle: 'rel-tgt-dep1',
        data: { routing: 'direct', relationKind: 'dependency' },
      },
    ]
    const out = asAngularForLayout(edges)
    expect(out.map((e) => e.id)).toEqual(['c1'])
    expect((out[0]!.data as { routing: string }).routing).toBe('angular')
  })

  it('includes port-port bindings by default and promotes to angular', () => {
    const edges: Edge[] = [
      {
        id: 'b1',
        source: 'ecu',
        target: 'sw',
        sourceHandle: 'ecu::in',
        targetHandle: 'target:sw::in',
        data: { routing: 'direct', relationKind: 'binding' },
      },
    ]
    const out = asAngularForLayout(edges)
    expect(out.map((e) => e.id)).toEqual(['b1'])
    expect((out[0]!.data as { routing: string }).routing).toBe('angular')
  })

  it('excludes bindings when includeBindings is false', () => {
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
        data: { routing: 'direct', relationKind: 'connection' },
      },
      {
        id: 'b1',
        source: 'ecu',
        target: 'sw',
        sourceHandle: 'ecu::in',
        targetHandle: 'target:sw::in',
        data: { routing: 'direct', relationKind: 'binding' },
      },
    ]
    const out = asAngularForLayout(edges, { includeBindings: false })
    expect(out.map((e) => e.id)).toEqual(['c1'])
  })

  it('excludes rel-handle bindings even when includeBindings is true', () => {
    const edges: Edge[] = [
      {
        id: 'b1',
        source: 'a',
        target: 'b',
        sourceHandle: 'rel-src-b1',
        targetHandle: 'rel-tgt-b1',
        data: { routing: 'direct', relationKind: 'binding' },
      },
    ]
    expect(asAngularForLayout(edges).map((e) => e.id)).toEqual([])
    expect(
      asAngularForLayout(edges, { includeBindings: true }).map((e) => e.id),
    ).toEqual([])
  })
})

describe('portFromElk', () => {
  it('derives side and body-band offset from ELK port coordinates', () => {
    const left = portFromElk({ id: 'p', x: 0, y: 60 }, 160, 100)
    expect(left.side).toBe('left')
    expect(left.offset).toBe(
      clampPortOffset(left.offset, 'left', 100),
    )
    expect(left.offset).toBeGreaterThanOrEqual(0.38)
    expect(left.offset).toBeLessThanOrEqual(0.92)

    const right = portFromElk({ id: 'p', x: 160, y: 50 }, 160, 100)
    expect(right.side).toBe('right')

    const top = portFromElk({ id: 'p', x: 80, y: 0 }, 160, 100)
    expect(top.side).toBe('top')

    const bottom = portFromElk({ id: 'p', x: 80, y: 100 }, 160, 100)
    expect(bottom.side).toBe('bottom')
  })
})

describe('layoutStructureWithElk', () => {
  it('places linked parts without overlap and grows the boundary', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 200, h: 160, x: 0, y: 0 }),
      part('a', {
        parentId: 'root',
        label: 'Alpha',
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.4 }],
      }),
      part('b', {
        parentId: 'root',
        label: 'Beta',
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.4 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges)
    expect(result.edges).toBeUndefined()

    const a = result.nodes['a']!
    const b = result.nodes['b']!
    const root = result.nodes['root']!
    expect(a.width).toBeGreaterThan(100)
    expect(b.width).toBeGreaterThan(100)
    expect(a.x).toBeDefined()
    expect(b.x).toBeDefined()
    expect(a.y).toBeDefined()
    expect(b.y).toBeDefined()

    const aR = {
      minX: a.x!,
      minY: a.y!,
      maxX: a.x! + a.width!,
      maxY: a.y! + a.height!,
    }
    const bR = {
      minX: b.x!,
      minY: b.y!,
      maxX: b.x! + b.width!,
      maxY: b.y! + b.height!,
    }
    const overlapX = aR.minX < bR.maxX && bR.minX < aR.maxX
    const overlapY = aR.minY < bR.maxY && bR.minY < aR.maxY
    expect(overlapX && overlapY).toBe(false)

    const gapX = Math.max(0, Math.max(aR.minX, bR.minX) - Math.min(aR.maxX, bR.maxX))
    const gapY = Math.max(0, Math.max(aR.minY, bR.minY) - Math.min(aR.maxY, bR.maxY))
    const gap = overlapX ? gapY : overlapY ? gapX : Math.hypot(gapX, gapY)
    // Stress packs by desiredEdgeLength (centers); gap between boxes can be < 40.
    expect(gap).toBeGreaterThanOrEqual(12)

    expect(root.width).toBeGreaterThanOrEqual(Math.max(aR.maxX, bR.maxX) + 20)
    expect(root.height).toBeGreaterThanOrEqual(Math.max(aR.maxY, bR.maxY) + 20)
  })

  it('places a hub closer to the centroid than a leaf and keeps a ~square span', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 200, h: 160 }),
      part('hub', {
        parentId: 'root',
        ports: [
          { id: 'hub::a', name: 'a', side: 'right', offset: 0.3 },
          { id: 'hub::b', name: 'b', side: 'right', offset: 0.5 },
          { id: 'hub::c', name: 'c', side: 'right', offset: 0.7 },
          { id: 'hub::d', name: 'd', side: 'left', offset: 0.5 },
        ],
      }),
      part('a', {
        parentId: 'root',
        ports: [{ id: 'a::in', name: 'in', side: 'left', offset: 0.5 }],
      }),
      part('b', {
        parentId: 'root',
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.5 }],
      }),
      part('c', {
        parentId: 'root',
        ports: [{ id: 'c::in', name: 'in', side: 'left', offset: 0.5 }],
      }),
      part('d', {
        parentId: 'root',
        ports: [{ id: 'd::in', name: 'in', side: 'right', offset: 0.5 }],
      }),
    ]
    const edges: Edge[] = [
      { id: 'e1', source: 'hub', target: 'a', sourceHandle: 'hub::a', targetHandle: 'target:a::in' },
      { id: 'e2', source: 'hub', target: 'b', sourceHandle: 'hub::b', targetHandle: 'target:b::in' },
      { id: 'e3', source: 'hub', target: 'c', sourceHandle: 'hub::c', targetHandle: 'target:c::in' },
      { id: 'e4', source: 'hub', target: 'd', sourceHandle: 'hub::d', targetHandle: 'target:d::in' },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: true,
      layoutNodes: true,
      directives: {
        portPlacement: 'optimized',
        algorithm: 'stress',
        spacing: 'normal',
        aspectRatio: 1,
      },
    })
    const ids = ['hub', 'a', 'b', 'c', 'd'] as const
    const centers = ids.map((id) => {
      const n = result.nodes[id]!
      return {
        id,
        x: n.x! + (n.width || 140) / 2,
        y: n.y! + (n.height || 80) / 2,
      }
    })
    const cx = centers.reduce((s, p) => s + p.x, 0) / centers.length
    const cy = centers.reduce((s, p) => s + p.y, 0) / centers.length
    const dist = (p: { x: number; y: number }) =>
      Math.hypot(p.x - cx, p.y - cy)
    const hub = centers.find((p) => p.id === 'hub')!
    const leafDists = centers.filter((p) => p.id !== 'hub').map(dist)
    expect(dist(hub)).toBeLessThanOrEqual(Math.min(...leafDists) + 40)

    const xs = ids.map((id) => result.nodes[id]!.x!)
    const ys = ids.map((id) => result.nodes[id]!.y!)
    const spanW =
      Math.max(...ids.map((id) => result.nodes[id]!.x! + (result.nodes[id]!.width || 140))) -
      Math.min(...xs)
    const spanH =
      Math.max(...ids.map((id) => result.nodes[id]!.y! + (result.nodes[id]!.height || 80))) -
      Math.min(...ys)
    const aspect = spanW / Math.max(1, spanH)
    expect(aspect).toBeGreaterThan(0.45)
    expect(aspect).toBeLessThan(2.2)

    // Orthogonal angular waypoints (not empty “direct” stubs for every edge)
    const routed = Object.values(result.edges || {})
    expect(routed.length).toBeGreaterThan(0)
    expect(routed.every((e) => e.routing === 'angular')).toBe(true)
  })

  it('places connection source left of target after stress', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 600, h: 400 }),
      part('wiper', {
        parentId: 'root',
        x: 300,
        y: 200,
        ports: [
          { id: 'wiper::clearOut', name: 'clearOut', side: 'right', offset: 0.5 },
        ],
      }),
      part('glass', {
        parentId: 'root',
        x: 40,
        y: 40,
        ports: [
          { id: 'glass::clearIn', name: 'clearIn', side: 'left', offset: 0.5 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'wiper',
        target: 'glass',
        sourceHandle: 'wiper::clearOut',
        targetHandle: 'target:glass::clearIn',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: false,
      layoutNodes: true,
      directives: {
        portPlacement: 'inputsLeftOutputsRight',
        algorithm: 'stress',
        spacing: 'normal',
        aspectRatio: 1,
      },
    })
    const wiper = result.nodes.wiper!
    const glass = result.nodes.glass!
    expect(glass.x!).toBeGreaterThanOrEqual(
      (wiper.x || 0) + (wiper.width || 140) - 1,
    )
  })

  it('fits boundary around children when includeEdges is false', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 200, h: 120 }),
      part('a', {
        parentId: 'root',
        x: 400,
        y: 300,
        w: 140,
        h: 80,
        ports: [{ id: 'a::out', name: 'out', side: 'right', offset: 0.5 }],
      }),
      part('b', {
        parentId: 'root',
        x: 700,
        y: 500,
        w: 140,
        h: 80,
        ports: [{ id: 'b::in', name: 'in', side: 'left', offset: 0.5 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: false,
      layoutNodes: true,
    })
    const root = result.nodes.root!
    const a = result.nodes.a!
    const b = result.nodes.b!
    expect(a.x!).toBeGreaterThanOrEqual(40)
    expect(a.y!).toBeGreaterThanOrEqual(40)
    expect(b.x! + (b.width || 140)).toBeLessThanOrEqual((root.width || 0) - 40)
    expect(b.y! + (b.height || 80)).toBeLessThanOrEqual((root.height || 0) - 40)
    expect(root.width!).toBeGreaterThan(200)
    expect(root.height!).toBeGreaterThan(120)
  })

  it('inputsLeftOutputsRight puts …In on left and …Out on right', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 400, h: 300 }),
      part('battery', {
        parentId: 'root',
        ports: [
          { id: 'battery::energyOut', name: 'energyOut', side: 'left', offset: 0.4 },
          { id: 'battery::chargeIn', name: 'chargeIn', side: 'right', offset: 0.6 },
        ],
      }),
      part('motor', {
        parentId: 'root',
        ports: [
          { id: 'motor::energyIn', name: 'energyIn', side: 'right', offset: 0.5 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'battery',
        target: 'motor',
        sourceHandle: 'battery::energyOut',
        targetHandle: 'target:motor::energyIn',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      includeEdges: true,
      layoutNodes: true,
      directives: {
        portPlacement: 'inputsLeftOutputsRight',
        algorithm: 'stress',
        spacing: 'normal',
        aspectRatio: 1,
      },
    })
    expect(result.nodes['battery::chargeIn']?.side).toBe('left')
    expect(result.nodes['battery::energyOut']?.side).toBe('right')
    expect(result.nodes['motor::energyIn']?.side).toBe('left')
  })

  it('places child port on left when linked to boundary port on left', async () => {
    const nodes = [
      part('root', {
        isBoundary: true,
        w: 500,
        h: 300,
        ports: [{ id: 'root::p', name: 'p', side: 'left', offset: 0.4 }],
      }),
      part('child', {
        parentId: 'root',
        x: 80,
        y: 60,
        ports: [{ id: 'child::q', name: 'q', side: 'right', offset: 0.5 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'root',
        target: 'child',
        sourceHandle: 'root::p',
        targetHandle: 'target:child::q',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges)
    expect(result.nodes['child::q']?.side).toBe('left')
  })

  it('repositions nested SW away from a bad seed and grows the ECU', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 800, h: 500 }),
      part('batteryEcu', {
        parentId: 'root',
        x: 40,
        y: 40,
        w: 100,
        h: 80,
        ports: [
          { id: 'batteryEcu::energyOut', name: 'energyOut', side: 'right', offset: 0.4 },
        ],
      }),
      part('batteryControlSw', {
        parentId: 'batteryEcu',
        x: 200,
        y: 10,
        w: 140,
        h: 72,
        ports: [
          {
            id: 'batteryControlSw::energyOut',
            name: 'energyOut',
            side: 'right',
            offset: 0.4,
          },
        ],
      }),
      part('electricMotor', {
        parentId: 'root',
        x: 300,
        y: 40,
        w: 140,
        h: 72,
        ports: [
          { id: 'electricMotor::energyIn', name: 'energyIn', side: 'left', offset: 0.4 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'energyMotor',
        source: 'batteryEcu',
        target: 'electricMotor',
        sourceHandle: 'batteryEcu::energyOut',
        targetHandle: 'target:electricMotor::energyIn',
      },
    ]
    const result = await layoutStructureWithElk(nodes, edges, {
      layoutNodes: true,
      includeEdges: false,
    })
    const sw = result.nodes['batteryControlSw']!
    const ecu = result.nodes['batteryEcu']!
    expect(sw.x).not.toBe(200)
    expect(sw.x!).toBeGreaterThanOrEqual(16)
    expect(sw.y!).toBeGreaterThanOrEqual(16)
    expect(ecu.width!).toBeGreaterThanOrEqual(sw.x! + (sw.width || 140) + 16)
    expect(ecu.height!).toBeGreaterThanOrEqual(sw.y! + (sw.height || 72) + 16)
  })
})

describe('buildElkGraph proxy-port edges', () => {
  it('includes batteryEcu↔electricMotor and skips nested SW as endpoint', () => {
    const nodes = [
      part('root', { isBoundary: true, w: 800, h: 500 }),
      part('batteryEcu', {
        parentId: 'root',
        ports: [
          { id: 'batteryEcu::energyOut', name: 'energyOut', side: 'right', offset: 0.4 },
        ],
      }),
      part('batteryControlSw', {
        parentId: 'batteryEcu',
        ports: [
          {
            id: 'batteryControlSw::energyOut',
            name: 'energyOut',
            side: 'right',
            offset: 0.4,
          },
        ],
      }),
      part('electricMotor', {
        parentId: 'root',
        ports: [
          { id: 'electricMotor::energyIn', name: 'energyIn', side: 'left', offset: 0.4 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'internal',
        source: 'batteryControlSw',
        target: 'batteryEcu',
        sourceHandle: 'batteryControlSw::energyOut',
        targetHandle: 'target:batteryEcu::energyOut',
      },
      {
        id: 'energyMotor',
        source: 'batteryEcu',
        target: 'electricMotor',
        sourceHandle: 'batteryEcu::energyOut',
        targetHandle: 'target:electricMotor::energyIn',
      },
    ]
    const g = buildElkGraph(nodes, edges, { layoutNodes: true })
    expect(g.children?.map((c) => c.id).sort()).toEqual([
      'batteryEcu',
      'electricMotor',
    ])
    expect(g.edges?.some((e) => e.id === 'energyMotor')).toBe(true)
    expect(g.edges?.some((e) => e.id === 'internal')).toBe(false)
  })
})

describe('nested containers in AutoLayout', () => {
  it('demotes nested boundaries but keeps the root boundary', () => {
    const nodes = [
      part('car', { isBoundary: true }),
      part('ecu', { parentId: 'car', isBoundary: true }),
      part('cpu', { parentId: 'ecu' }),
    ]
    const out = demoteNestedBoundaries(nodes)
    expect((out[0].data as PartNodeData).isBoundary).toBe(true)
    expect((out[1].data as PartNodeData).isBoundary).toBe(false)
  })

  it('places a nested container among its siblings without overlap', async () => {
    const nodes = [
      part('car', { isBoundary: true, w: 600, h: 400 }),
      part('a', { parentId: 'car', x: 0, y: 0 }),
      // Stale oversized box from an earlier layout must not survive.
      part('ecu', { parentId: 'car', isBoundary: true, x: 0, y: 0, w: 900, h: 700 }),
      part('cpu', { parentId: 'ecu', x: 20, y: 40 }),
    ]
    for (const algorithm of ['favour-grid', 'clustered', 'stress', 'layered'] as const) {
      const r = await layoutStructureWithElk(nodes, [], {
        includeEdges: false,
        layoutNodes: true,
        directives: {
          mode: 'simple',
          algorithm,
          portPlacement: 'optimized',
          spacing: 'normal',
          aspectRatio: 1,
        },
      })
      const a = r.nodes.a
      const ecu = r.nodes.ecu
      const overlap =
        a.x! < ecu.x! + ecu.width! &&
        ecu.x! < a.x! + a.width! &&
        a.y! < ecu.y! + ecu.height! &&
        ecu.y! < a.y! + a.height!
      expect(overlap, algorithm).toBe(false)
      const cpu = r.nodes.cpu
      expect(cpu.x! + cpu.width!, algorithm).toBeLessThanOrEqual(ecu.width! + 1e-6)
      expect(cpu.y! + cpu.height!, algorithm).toBeLessThanOrEqual(ecu.height! + 1e-6)
      expect(ecu.width!, algorithm).toBeLessThan(600)
      expect(ecu.height!, algorithm).toBeLessThan(500)
    }
  })
})

describe('seedPortSide honours the port placement mode', () => {
  const mk = (id: string, x: number, y: number, ports: PartNodeData['ports']) =>
    part(id, { x, y, ports })
  const owner = mk('o', 0, 0, [{ id: 'o.p', name: 'p', side: 'right', offset: 0.5 }])
  const below = mk('b', 0, 400, [{ id: 'b.q', name: 'q', side: 'top', offset: 0.5 }])
  const above = mk('u', 0, -400, [{ id: 'u.q', name: 'q', side: 'bottom', offset: 0.5 }])
  const byId = new Map([owner, below, above].map((n) => [n.id, n]))
  const port = (owner.data as PartNodeData).ports[0]
  const toBelow = [
    { edgeId: 'e', sourcePart: 'o', targetPart: 'b', sourcePort: 'o.p', targetPort: 'b.q' },
  ]
  const toAbove = [
    { edgeId: 'e', sourcePart: 'o', targetPart: 'u', sourcePort: 'o.p', targetPort: 'u.q' },
  ]

  it('optimized faces a peer straight below with the bottom side', () => {
    expect(seedPortSide(port, owner, toBelow, byId, undefined, 'optimized')).toBe('bottom')
    expect(seedPortSide(port, owner, toAbove, byId, undefined, 'optimized')).toBe('top')
  })

  it('optimized – no top uses bottom but never top', () => {
    expect(seedPortSide(port, owner, toBelow, byId, undefined, 'optimizedNoTop')).toBe(
      'bottom',
    )
    expect(['left', 'right']).toContain(
      seedPortSide(port, owner, toAbove, byId, undefined, 'optimizedNoTop'),
    )
  })

  it('optimized – no top/bottom only yields left or right', () => {
    for (const links of [toBelow, toAbove]) {
      expect(['left', 'right']).toContain(
        seedPortSide(port, owner, links, byId, undefined, 'optimizedNoTopBottom'),
      )
    }
  })

  it('inputs left / outputs right follows the role, not the peer', () => {
    const inPort = { id: 'o.p', name: 'dataIn', side: 'top' as const, offset: 0.5 }
    expect(seedPortSide(inPort, owner, toBelow, byId, undefined, 'inputsLeftOutputsRight')).toBe(
      'left',
    )
    const outPort = { id: 'o.p', name: 'dataOut', side: 'top' as const, offset: 0.5 }
    expect(seedPortSide(outPort, owner, toAbove, byId, undefined, 'inputsLeftOutputsRight')).toBe(
      'right',
    )
  })
})
