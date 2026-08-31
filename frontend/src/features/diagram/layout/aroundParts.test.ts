import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  pathCrossesObstacles,
  polylineHitsRect,
  redrawStructureConnections,
  routeOrthogonal,
  type Rect,
} from './connectionRouting'
import { resolveRoutePoints } from '../edgeRouting'

function partNode(opts: {
  id: string
  x: number
  y: number
  w: number
  h: number
  parentId?: string
  isBoundary?: boolean
  ports?: PartNodeData['ports']
}): Node {
  return {
    id: opts.id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x, y: opts.y },
    width: opts.w,
    height: opts.h,
    style: { width: opts.w, height: opts.h },
    data: {
      label: opts.id,
      artifactId: opts.id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

/**
 * Layout matching the reported DataCenter bug: vertical wires from
 * monitoring/cluster must not cut through iaac on the way to orchestrator.
 */
describe('routing must go around intervening parts', () => {
  const root = partNode({
    id: 'DC',
    x: 60,
    y: 40,
    w: 720,
    h: 520,
    isBoundary: true,
  })
  const monitoring = partNode({
    id: 'monitoring',
    x: 48,
    y: 48,
    w: 180,
    h: 150,
    parentId: 'DC',
    ports: [
      { id: 'monitoring::orch', name: 'orch', side: 'right', offset: 0.75 },
    ],
  })
  const cluster = partNode({
    id: 'cluster',
    x: 400,
    y: 40,
    w: 220,
    h: 170,
    parentId: 'DC',
    ports: [
      { id: 'cluster::left', name: 'left', side: 'left', offset: 0.45 },
    ],
  })
  // Sits between cluster and orchestrator — the reported “behind iaac” case
  const iaac = partNode({
    id: 'iaac',
    x: 390,
    y: 230,
    w: 210,
    h: 130,
    parentId: 'DC',
    ports: [{ id: 'iaac::p', name: 'p', side: 'left', offset: 0.5 }],
  })
  const orch = partNode({
    id: 'orchestrator',
    x: 370,
    y: 380,
    w: 240,
    h: 110,
    parentId: 'DC',
    ports: [
      { id: 'orchestrator::in', name: 'in', side: 'left', offset: 0.55 },
    ],
  })

  const iaacAbs: Rect = {
    minX: 60 + 390,
    minY: 40 + 230,
    maxX: 60 + 390 + 210,
    maxY: 40 + 230 + 130,
  }

  const nodes = [root, monitoring, cluster, iaac, orch]

  it('routeOrthogonal does not cut through a blocker between two points', () => {
    const path = routeOrthogonal(
      { x: 60 + 48 + 180, y: 40 + 48 + 150 * 0.75 },
      { x: 60 + 370, y: 40 + 380 + 110 * 0.55 },
      [iaacAbs],
      { minX: 60, minY: 40, maxX: 60 + 720, maxY: 40 + 520 },
    )
    expect(polylineHitsRect(path, iaacAbs)).toBe(false)
  })

  it('redrawStructureConnections routes monitoring→orchestrator around iaac', () => {
    const edges: Edge[] = [
      {
        id: 'mon_to_orch',
        source: 'monitoring',
        target: 'orchestrator',
        sourceHandle: 'monitoring::orch',
        targetHandle: 'target:orchestrator::in',
      },
    ]
    const routed = redrawStructureConnections(nodes, edges, undefined, [], {
      separation: 5,
    })
    expect(routed).toHaveLength(1)
    const start = {
      x: 60 + 48 + 180,
      y: 40 + 48 + 150 * 0.75,
    }
    const end = {
      x: 60 + 370,
      y: 40 + 380 + 110 * 0.55,
    }
    const path = resolveRoutePoints(
      start.x,
      start.y,
      end.x,
      end.y,
      routed[0].waypoints,
    )
    expect(polylineHitsRect(path, iaacAbs)).toBe(false)
    expect(pathCrossesObstacles(path, [iaacAbs])).toBe(false)
  })

  it('redrawStructureConnections routes cluster→orchestrator around iaac', () => {
    const edges: Edge[] = [
      {
        id: 'clu_to_orch',
        source: 'cluster',
        target: 'orchestrator',
        sourceHandle: 'cluster::left',
        targetHandle: 'target:orchestrator::in',
      },
    ]
    const routed = redrawStructureConnections(nodes, edges, undefined, [], {
      separation: 5,
    })
    const start = {
      x: 60 + 400,
      y: 40 + 40 + 170 * 0.45,
    }
    const end = {
      x: 60 + 370,
      y: 40 + 380 + 110 * 0.55,
    }
    const path = resolveRoutePoints(
      start.x,
      start.y,
      end.x,
      end.y,
      routed[0].waypoints,
    )
    expect(polylineHitsRect(path, iaacAbs)).toBe(false)
  })
})
