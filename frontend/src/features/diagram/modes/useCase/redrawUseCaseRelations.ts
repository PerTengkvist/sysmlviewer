import type { Edge, Node } from '@xyflow/react'
import type { VisualizationEdge, VisualizationNode } from '../../../../api'
import type { BoundaryAnchor } from '../../boundaryAnchors'
import { syncUseCaseAnchors } from './syncUseCaseAnchors'

export type RedrawUseCaseRelationsOpts = {
  /** When set, only this edge is redrawn. */
  onlyId?: string
}

export type RedrawUseCaseRelationsResult = {
  nodes: Node[]
  edges: Edge[]
  edgePatch: Record<string, Partial<VisualizationEdge>>
  nodePatch: Record<string, Partial<VisualizationNode>>
}

type EdgeData = {
  routing?: string
  relationKind?: string
  waypoints?: { x: number; y: number; locked?: boolean }[]
  [key: string]: unknown
}

function isUseCaseRelation(edge: Edge): boolean {
  if (edge.id.startsWith('use:')) return true
  const data = (edge.data || {}) as EdgeData
  return data.relationKind === 'include' || data.relationKind === 'dependency'
}

function relId(edgeId: string): string {
  return `rel:${edgeId}`
}

/**
 * Keep node positions; recompute facing relation-owned anchors for include /
 * extend / actor associations and clear waypoints on redrawn edges.
 */
export function redrawUseCaseRelations(
  nodes: Node[],
  edges: Edge[],
  opts?: RedrawUseCaseRelationsOpts,
): RedrawUseCaseRelationsResult {
  const onlyId = opts?.onlyId
  if (onlyId != null && !edges.some((e) => e.id === onlyId && isUseCaseRelation(e))) {
    return { nodes, edges, edgePatch: {}, nodePatch: {} }
  }

  const redrawIds = new Set(
    edges
      .filter((e) => isUseCaseRelation(e) && (onlyId == null || e.id === onlyId))
      .map((e) => e.id),
  )

  // Keep non-redrawn anchors; drop the redrawn edge's saved point so it is
  // re-placed on the shortest path. Full redraw ignores all saved positions.
  const savedAnchors: Record<string, BoundaryAnchor[]> = {}
  for (const node of nodes) {
    if (node.type !== 'useCase' && node.type !== 'actor') continue
    const current =
      ((node.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors || [])
    if (onlyId == null) {
      savedAnchors[node.id] = []
    } else {
      savedAnchors[node.id] = current.filter((a) => a.id !== relId(onlyId))
    }
  }

  // Clear waypoints on edges that will be redrawn before sync.
  const prepared = edges.map((edge) => {
    if (!redrawIds.has(edge.id)) return edge
    const data = (edge.data || {}) as EdgeData
    return {
      ...edge,
      data: {
        ...data,
        waypoints: [],
      },
    }
  })

  const synced = syncUseCaseAnchors(nodes, prepared, {
    savedAnchors,
    forceRelayout: onlyId == null,
  })

  const edgePatch: Record<string, Partial<VisualizationEdge>> = {}
  const nextEdges = synced.edges.map((edge) => {
    if (!redrawIds.has(edge.id)) {
      // Restore non-redrawn edges from prepared (keep corrupted/old data).
      return prepared.find((e) => e.id === edge.id) || edge
    }
    const data = (edge.data || {}) as EdgeData
    const routing = (data.routing as VisualizationEdge['routing']) || 'direct'
    edgePatch[edge.id] = {
      artifactId: edge.id,
      routing,
      sourceSide: data.sourceSide as VisualizationEdge['sourceSide'],
      sourceOffset: data.sourceOffset as number | undefined,
      sourceAnchorId: data.sourceAnchorId as string | undefined,
      targetSide: data.targetSide as VisualizationEdge['targetSide'],
      targetOffset: data.targetOffset as number | undefined,
      targetAnchorId: data.targetAnchorId as string | undefined,
      waypoints: [],
    }
    return {
      ...edge,
      data: {
        ...data,
        routing,
        waypoints: [],
      },
    }
  })

  // For onlyId, merge synced handles for the redrawn edge onto restored others.
  const finalEdges =
    onlyId == null
      ? nextEdges
      : prepared.map((edge) => {
          if (edge.id !== onlyId) return edge
          return nextEdges.find((e) => e.id === onlyId) || edge
        })

  return {
    nodes: synced.nodes,
    edges: finalEdges,
    edgePatch,
    nodePatch: synced.nodePatch,
  }
}
