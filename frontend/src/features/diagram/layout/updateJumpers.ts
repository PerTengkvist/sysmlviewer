import type { Edge, Node } from '@xyflow/react'
import { resolveRoutePoints } from '../edgeRouting'
import type { SysmlEdgeData } from '../InternalEdge'
import { edgePortEndpoints } from './connectionRouting'
import {
  type RoutedPoly,
  updateJumpersFromRoutes,
  type PathJump,
} from './connectionSeparation'

function portIdFromHandle(handleId: string | null | undefined): string {
  if (!handleId) return ''
  return handleId.startsWith('target:')
    ? handleId.slice('target:'.length)
    : handleId
}

/**
 * Build full orthogonal polylines for angular edges (including port ends),
 * matching the geometry drawn by SysmlEdge.
 */
export function buildJumperPolys(nodes: Node[], edges: Edge[]): RoutedPoly[] {
  const polys: RoutedPoly[] = []
  edges.forEach((edge, index) => {
    const data = (edge.data || {}) as SysmlEdgeData
    const routing = data.routing || 'angular'
    if (routing !== 'angular') return
    const ends = edgePortEndpoints(nodes, edge)
    if (!ends) return
    const wps = (data.waypoints || []).map((w) => ({
      x: w.x,
      y: w.y,
      locked: w.locked,
    }))
    const points = resolveRoutePoints(ends.sx, ends.sy, ends.tx, ends.ty, wps)
    if (points.length < 2) return
    const zBase = typeof edge.zIndex === 'number' ? edge.zIndex : 0
    polys.push({
      id: edge.id,
      points,
      sourcePort: portIdFromHandle(edge.sourceHandle) || edge.source,
      targetPort: portIdFromHandle(edge.targetHandle) || edge.target,
      // Fractional tie-break: `edges` order must match React Flow paint order
      // so later edges win crossings. Safe while edge count ≪ 1e6.
      z: zBase + index * 1e-6,
    })
  })
  return polys
}

export function computeUpdateJumpers(
  nodes: Node[],
  edges: Edge[],
): Map<string, PathJump[]> {
  return updateJumpersFromRoutes(buildJumperPolys(nodes, edges))
}
