import type { Edge, Node } from '@xyflow/react'
import type { PortSide, VisualizationEdge, VisualizationNode } from '../../../api'
import { resolveAnchors, type BoundaryAnchor } from '../boundaryAnchors'
import {
  absoluteNodeOrigin,
  applyRelationHandlesToNodes,
} from '../modes/structure/buildStructureGraph'
import { shortestBoundaryHit, type Box } from '../modes/useCase/shortestBoundaryHit'
import { isRelationLayoutEdge } from './layoutEdgeKinds'

export type RedrawStructureRelationsOpts = {
  /** When set, only this edge is redrawn. */
  onlyId?: string
}

export type RedrawStructureRelationsResult = {
  nodes: Node[]
  edges: Edge[]
  edgePatch: Record<string, Partial<VisualizationEdge>>
  nodePatch: Record<string, Partial<VisualizationNode>>
}

type EdgeData = Record<string, unknown>

const REL_ANCHOR = 'rel:'

/** Requirements and use cases carry boundary anchors instead of rel- handles. */
function isAnchoredNode(node: Node | undefined): boolean {
  return node?.type === 'requirement' || node?.type === 'useCase'
}

function isRedrawable(edge: Edge): boolean {
  return edge.source !== edge.target && isRelationLayoutEdge(edge)
}

/** True when the diagram has at least one relation the button can redraw. */
export function hasRedrawableRelations(edges: Edge[]): boolean {
  return edges.some(isRedrawable)
}

function boxOf(node: Node, byId: Map<string, Node>): Box {
  const { x, y } = absoluteNodeOrigin(node, byId)
  const width =
    Number(node.style?.width ?? node.width ?? node.measured?.width) || 180
  const height =
    Number(node.style?.height ?? node.height ?? node.measured?.height) || 110
  return { x, y, width, height }
}

/**
 * Keep every node where it is; re-attach relation edges (dependency, satisfy,
 * include, allocation, …) at the point where the centre-to-centre line leaves
 * each node. Part ends get their own `rel-` handle; requirements and use
 * cases get a dedicated `rel:<edgeId>` anchor beside their default anchors.
 * Waypoints are cleared and the edge is drawn straight.
 */
export function redrawStructureRelations(
  nodes: Node[],
  edges: Edge[],
  opts?: RedrawStructureRelationsOpts,
): RedrawStructureRelationsResult {
  const onlyId = opts?.onlyId
  const redraw = edges.filter(
    (e) => isRedrawable(e) && (onlyId == null || e.id === onlyId),
  )
  if (!redraw.length) return { nodes, edges, edgePatch: {}, nodePatch: {} }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const liveRelationIds = new Set(edges.filter(isRedrawable).map((e) => e.id))
  const anchorsByNode = new Map<string, BoundaryAnchor[]>()
  const anchorsFor = (node: Node): BoundaryAnchor[] => {
    let list = anchorsByNode.get(node.id)
    if (!list) {
      const current = resolveAnchors(
        (node.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors,
      )
      // A full redraw drops anchors left behind by relations that are gone.
      list =
        onlyId == null
          ? current.filter(
              (a) =>
                !a.id.startsWith(REL_ANCHOR) ||
                liveRelationIds.has(a.id.slice(REL_ANCHOR.length)),
            )
          : current
      anchorsByNode.set(node.id, list)
    }
    return list
  }
  const setAnchor = (node: Node, anchor: BoundaryAnchor) => {
    const list = anchorsFor(node).filter((a) => a.id !== anchor.id)
    list.push(anchor)
    anchorsByNode.set(node.id, list)
  }

  const edgePatch: Record<string, Partial<VisualizationEdge>> = {}
  const redrawn = new Map<string, Edge>()
  for (const edge of redraw) {
    const src = byId.get(edge.source)
    const tgt = byId.get(edge.target)
    if (!src || !tgt) continue
    const srcBox = boxOf(src, byId)
    const tgtBox = boxOf(tgt, byId)
    const srcHit = shortestBoundaryHit(srcBox, tgtBox)
    const tgtHit = shortestBoundaryHit(tgtBox, srcBox)
    const anchorId = `${REL_ANCHOR}${edge.id}`

    let sourceHandle = `rel-src-${edge.id}`
    let targetHandle = `rel-tgt-${edge.id}`
    let sourceAnchorId: string | undefined
    let targetAnchorId: string | undefined
    if (isAnchoredNode(src)) {
      setAnchor(src, { id: anchorId, side: srcHit.side, offset: srcHit.offset })
      sourceHandle = anchorId
      sourceAnchorId = anchorId
    }
    if (isAnchoredNode(tgt)) {
      setAnchor(tgt, { id: anchorId, side: tgtHit.side, offset: tgtHit.offset })
      targetHandle = `target:${anchorId}`
      targetAnchorId = anchorId
    }
    const data = (edge.data || {}) as EdgeData
    const ends = {
      sourceSide: srcHit.side as PortSide,
      sourceOffset: srcHit.offset,
      targetSide: tgtHit.side as PortSide,
      targetOffset: tgtHit.offset,
    }
    redrawn.set(edge.id, {
      ...edge,
      sourceHandle,
      targetHandle,
      data: {
        ...data,
        ...ends,
        sourceAnchorId,
        targetAnchorId,
        routing: 'direct',
        waypoints: [],
        // Saved sides keep part ends where the redraw put them.
        manualAttachment: !isAnchoredNode(src) || !isAnchoredNode(tgt),
      },
    })
    edgePatch[edge.id] = {
      artifactId: (data.artifactId as string | undefined) || edge.id,
      routing: 'direct',
      ...ends,
      ...(sourceAnchorId ? { sourceAnchorId } : {}),
      ...(targetAnchorId ? { targetAnchorId } : {}),
      waypoints: [],
    }
  }
  if (!redrawn.size) return { nodes, edges, edgePatch: {}, nodePatch: {} }

  const nextEdges = edges.map((e) => redrawn.get(e.id) || e)
  const nodePatch: Record<string, Partial<VisualizationNode>> = {}
  let nextNodes = nodes.map((n) => {
    const anchors = anchorsByNode.get(n.id)
    if (!anchors) return n
    const artifactId =
      ((n.data as { artifactId?: string } | undefined)?.artifactId) || n.id
    nodePatch[n.id] = { artifactId, anchors }
    return { ...n, data: { ...(n.data as object), anchors } }
  })
  nextNodes = applyRelationHandlesToNodes(nextNodes, nextEdges)
  return { nodes: nextNodes, edges: nextEdges, edgePatch, nodePatch }
}
