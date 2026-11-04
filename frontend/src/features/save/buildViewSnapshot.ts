import type { Edge, Node } from '@xyflow/react'

import type { EdgeGeometry, VisualizationEdge, ViewSnapshot } from '../../api'
import type { PartNodeData } from '../diagram/PartNode'
import { nodeExtentSize } from '../diagram/resizeSync'

const EDGE_KEYS = [
  'routing',
  'waypoints',
  'labelOffset',
  'sourceSide',
  'sourceOffset',
  'targetSide',
  'targetOffset',
  'sourceAnchorId',
  'targetAnchorId',
] as const

type Waypoints = NonNullable<EdgeGeometry['waypoints']>

function edgeGeometry(source: Partial<EdgeGeometry> | undefined): EdgeGeometry {
  const out: Record<string, unknown> = {}
  for (const key of EDGE_KEYS) {
    const value = source?.[key]
    if (value !== undefined && value !== null) out[key] = value
  }
  return out as EdgeGeometry
}

/**
 * The geometry of what the diagram shows, in the shape the backend stores.
 *
 * Saved edge values are the base because a snapshot replaces an edge's stored
 * geometry, and not every diagram mode keeps every field on the canvas.
 * `displayedRoutes` wins over edge data: a connection re-attaches its route
 * locally while a part moves, so edge data can lag behind the screen.
 */
export function buildViewSnapshot(
  nodes: Node[],
  edges: Edge[],
  saved: { edges: Record<string, VisualizationEdge> },
  displayedRoutes?: ReadonlyMap<string, Waypoints>,
): ViewSnapshot {
  const snapshot: ViewSnapshot = { parts: {}, ports: {}, edges: {} }
  for (const node of nodes) {
    snapshot.parts[node.id] = {
      x: node.position.x,
      y: node.position.y,
      ...nodeExtentSize(node),
    }
    const ports = (node.data as Partial<PartNodeData> | undefined)?.ports ?? []
    for (const port of ports) {
      snapshot.ports[port.id] = {
        side: port.side,
        offset: port.offset,
        labelOffset: port.labelOffset ?? { x: 0, y: 0 },
      }
    }
  }
  for (const edge of edges) {
    const data = edge.data as (Partial<EdgeGeometry> & { artifactId?: string }) | undefined
    const artifactId = data?.artifactId
    if (!artifactId) continue
    const geometry = {
      ...edgeGeometry(saved.edges[artifactId]),
      ...edgeGeometry(data),
    }
    const displayed = displayedRoutes?.get(artifactId)
    if (displayed?.length) geometry.waypoints = displayed
    snapshot.edges[artifactId] = geometry
  }
  return snapshot
}
