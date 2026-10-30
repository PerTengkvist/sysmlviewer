import type { Edge, Node } from '@xyflow/react'
import type { PortSide, VisualizationNode } from '../../../../api'
import type { BoundaryAnchor } from '../../boundaryAnchors'
import { absoluteNodeOrigin } from '../structure/buildStructureGraph'
import { shortestBoundaryHit } from './shortestBoundaryHit'

const UC_W = 168
const UC_H = 72
const ACTOR_W = 88
const ACTOR_H = 108

export type SyncUseCaseAnchorsOpts = {
  /** Saved anchors keyed by node id (from visualization). */
  savedAnchors?: Record<string, BoundaryAnchor[] | null | undefined>
  /**
   * Ignore saved positions; place every end on the nearest boundary point
   * along the centre-to-centre line. Overlap between points is allowed.
   */
  forceRelayout?: boolean
}

export type SyncUseCaseAnchorsResult = {
  nodes: Node[]
  edges: Edge[]
  nodePatch: Record<string, Partial<VisualizationNode>>
}

type EdgeData = {
  relationKind?: string
  routing?: string
  sourceSide?: PortSide
  targetSide?: PortSide
  sourceOffset?: number
  targetOffset?: number
  sourceAnchorId?: string
  targetAnchorId?: string
  [key: string]: unknown
}

function isRelationEdge(edge: Edge): boolean {
  if (edge.id.startsWith('use:')) return true
  const data = (edge.data || {}) as EdgeData
  return data.relationKind === 'include' || data.relationKind === 'dependency'
}

function relAnchorId(edgeId: string): string {
  return `rel:${edgeId}`
}

function boxOf(node: Node, byId: Map<string, Node>) {
  const origin = absoluteNodeOrigin(node, byId)
  const isActor = node.type === 'actor'
  return {
    x: origin.x,
    y: origin.y,
    width: Number(node.style?.width) || (isActor ? ACTOR_W : UC_W),
    height: Number(node.style?.height) || (isActor ? ACTOR_H : UC_H),
  }
}

function clampOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0.5
  return Math.min(0.95, Math.max(0.05, offset))
}

type Pending = {
  nodeId: string
  edgeId: string
  side: PortSide
  offset: number
}

/**
 * Ensure each use-case / actor has exactly one boundary anchor per incident
 * relation and wire edge handles to those ids. Each end sits on the nearest
 * boundary point toward its peer; multiple relations may share the same point.
 */
export function syncUseCaseAnchors(
  nodes: Node[],
  edges: Edge[],
  opts?: SyncUseCaseAnchorsOpts,
): SyncUseCaseAnchorsResult {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const savedByNode = opts?.savedAnchors ?? {}
  const forceRelayout = !!opts?.forceRelayout
  const relationEdges = edges.filter(isRelationEdge)

  const pending: Pending[] = []
  for (const edge of relationEdges) {
    const src = byId.get(edge.source)
    const tgt = byId.get(edge.target)
    if (!src || !tgt) continue
    const srcBox = boxOf(src, byId)
    const tgtBox = boxOf(tgt, byId)
    const srcHit = shortestBoundaryHit(srcBox, tgtBox)
    const tgtHit = shortestBoundaryHit(tgtBox, srcBox)
    const anchorId = relAnchorId(edge.id)

    const pushEnd = (
      node: Node,
      ideal: { side: PortSide; offset: number },
    ) => {
      const savedList =
        savedByNode[node.id] ??
        (node.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors
      const saved = forceRelayout
        ? undefined
        : savedList?.find((a) => a.id === anchorId)
      pending.push({
        nodeId: node.id,
        edgeId: edge.id,
        side: saved?.side ?? ideal.side,
        offset: clampOffset(saved?.offset ?? ideal.offset),
      })
    }

    if (src.type === 'useCase' || src.type === 'actor') {
      if (src.type === 'useCase' || edge.id.startsWith('use:')) {
        pushEnd(src, srcHit)
      }
    }
    if (tgt.type === 'useCase') {
      pushEnd(tgt, tgtHit)
    }
  }

  const anchorsByNode = new Map<string, BoundaryAnchor[]>()
  for (const p of pending) {
    const list = anchorsByNode.get(p.nodeId) || []
    list.push({
      id: relAnchorId(p.edgeId),
      side: p.side,
      offset: p.offset,
    })
    anchorsByNode.set(p.nodeId, list)
  }

  for (const node of nodes) {
    if (node.type !== 'useCase' && node.type !== 'actor') continue
    if (!anchorsByNode.has(node.id)) anchorsByNode.set(node.id, [])
  }

  const nodePatch: Record<string, Partial<VisualizationNode>> = {}
  const nextNodes = nodes.map((node) => {
    if (node.type !== 'useCase' && node.type !== 'actor') return node
    const anchors = anchorsByNode.get(node.id) || []
    nodePatch[node.id] = { artifactId: node.id, anchors }
    return {
      ...node,
      data: {
        ...(node.data as object),
        anchors,
      },
    }
  })

  const nextById = new Map(nextNodes.map((n) => [n.id, n]))
  const nextEdges = edges.map((edge) => {
    if (!isRelationEdge(edge)) return edge
    const data = { ...((edge.data || {}) as EdgeData) }
    const anchorId = relAnchorId(edge.id)
    let sourceHandle = edge.sourceHandle
    let targetHandle = edge.targetHandle

    const src = nextById.get(edge.source)
    const tgt = nextById.get(edge.target)
    const srcAnchors =
      (src?.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors || []
    const tgtAnchors =
      (tgt?.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors || []

    if (src && (src.type === 'useCase' || src.type === 'actor')) {
      if (src.type === 'useCase' || edge.id.startsWith('use:')) {
        const a = srcAnchors.find((x) => x.id === anchorId)
        if (a) {
          sourceHandle = a.id
          data.sourceSide = a.side
          data.sourceOffset = a.offset
          data.sourceAnchorId = a.id
        }
      }
    }

    if (tgt?.type === 'useCase') {
      const a = tgtAnchors.find((x) => x.id === anchorId)
      if (a) {
        targetHandle = `target:${a.id}`
        data.targetSide = a.side
        data.targetOffset = a.offset
        data.targetAnchorId = a.id
      }
    }

    return {
      ...edge,
      sourceHandle,
      targetHandle,
      data,
    }
  })

  return { nodes: nextNodes, edges: nextEdges, nodePatch }
}
