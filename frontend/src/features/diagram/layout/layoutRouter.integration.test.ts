import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { planStructureRoutes } from './layoutRouter'
import {
  absoluteRectsOverlap,
  type ParentOfMap,
} from './flowPlacement'
import { boundaryFlowBounds } from './connectionRouting'

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
    width: opts.w ?? 140,
    height: opts.h ?? 80,
    style: { width: opts.w ?? 140, height: opts.h ?? 80 },
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

describe('planStructureRoutes absolute waypoints', () => {
  it('keeps AutoLayout routes inside the absolute Car boundary frame', async () => {
    // Boundary far from origin — relative waypoints would sit near (0,0) and look "outside".
    const nodes = [
      part('Car', {
        isBoundary: true,
        x: -800,
        y: 5000,
        w: 400,
        h: 300,
      }),
      part('a', {
        parentId: 'Car',
        x: 40,
        y: 40,
        ports: [{ id: 'a::out', name: 'energyOut', side: 'right', offset: 0.5 }],
      }),
      part('b', {
        parentId: 'Car',
        x: 220,
        y: 160,
        ports: [{ id: 'b::in', name: 'energyIn', side: 'left', offset: 0.5 }],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
        data: { routing: 'angular', relationKind: 'connection', internal: true },
      },
    ]

    const planned = await planStructureRoutes({
      mode: 'full',
      layoutNodes: true,
      nodes,
      edges,
      separation: 11,
      directives: {
        portPlacement: 'inputsLeftOutputsRight',
        algorithm: 'stress',
        spacing: 'normal',
        aspectRatio: 1,
      },
    })

    const nextNodes = nodes.map((n) => {
      const p = planned.nodes[n.id]
      if (!p) return n
      return {
        ...n,
        position:
          p.x != null && p.y != null ? { x: p.x, y: p.y } : n.position,
        width: p.width ?? n.width,
        height: p.height ?? n.height,
        style: {
          ...n.style,
          width: p.width ?? n.width,
          height: p.height ?? n.height,
        },
      }
    })
    const frame = boundaryFlowBounds(nextNodes)!
    expect(frame.maxX - frame.minX).toBeGreaterThan(200)

    const route = planned.routes.find((r) => r.id === 'c1')
    expect(route).toBeTruthy()
    for (const w of route!.waypoints) {
      expect(w.x).toBeGreaterThanOrEqual(frame.minX - 1)
      expect(w.x).toBeLessThanOrEqual(frame.maxX + 1)
      expect(w.y).toBeGreaterThanOrEqual(frame.minY - 1)
      expect(w.y).toBeLessThanOrEqual(frame.maxY + 1)
      // Must be absolute (near Car at y≈5000), not parent-relative (y≈0–300).
      expect(w.y).toBeGreaterThan(4000)
    }
  })

  it('PhysicalView-like: nested SW and peer mech do not overlap after AutoLayout', async () => {
    const nodes = [
      part('VehiclePhysical', { isBoundary: true, w: 900, h: 600 }),
      part('batteryEcu', { parentId: 'VehiclePhysical', x: 40, y: 40, w: 120, h: 80 }),
      part('batteryControlSw', {
        parentId: 'batteryEcu',
        x: 200,
        y: 10,
        w: 140,
        h: 72,
        ports: [
          { id: 'batteryControlSw::energyOut', name: 'energyOut', side: 'right', offset: 0.4 },
        ],
      }),
      part('brakePedalMech', {
        parentId: 'VehiclePhysical',
        x: 50,
        y: 50,
        w: 140,
        h: 72,
        ports: [
          { id: 'brakePedalMech::brakeOut', name: 'brakeOut', side: 'right', offset: 0.4 },
        ],
      }),
      part('wheelSet', {
        parentId: 'VehiclePhysical',
        x: 300,
        y: 200,
        w: 140,
        h: 72,
        ports: [
          { id: 'wheelSet::brakeIn', name: 'brakeIn', side: 'left', offset: 0.4 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'brake',
        source: 'brakePedalMech',
        target: 'wheelSet',
        sourceHandle: 'brakePedalMech::brakeOut',
        targetHandle: 'target:wheelSet::brakeIn',
        data: { routing: 'angular', relationKind: 'connection' },
      },
    ]
    const planned = await planStructureRoutes({
      mode: 'full',
      layoutNodes: true,
      nodes,
      edges,
      directives: {
        mode: 'simple',
        algorithm: 'stress',
        portPlacement: 'inputsLeftOutputsRight',
        spacing: 'normal',
        aspectRatio: 1,
      },
    })
    const parentOf: ParentOfMap = new Map(
      nodes.map((n) => [n.id, n.parentId] as const),
    )
    const ids = ['batteryEcu', 'batteryControlSw', 'brakePedalMech', 'wheelSet']
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!
        const b = ids[j]!
        if (parentOf.get(a) === b || parentOf.get(b) === a) continue
        expect(
          absoluteRectsOverlap(planned.nodes, a, b, parentOf, 8),
        ).toBe(false)
      }
    }
    const ecu = planned.nodes['batteryEcu']!
    const sw = planned.nodes['batteryControlSw']!
    expect(ecu.width!).toBeGreaterThanOrEqual(sw.x! + (sw.width || 140) + 16)
    expect(ecu.height!).toBeGreaterThanOrEqual(sw.y! + (sw.height || 72) + 16)
  })
})
