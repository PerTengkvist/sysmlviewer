import type { Node } from '@xyflow/react'

import type { VisualizationNode } from '../../api'
import { nodeExtentSize } from './resizeSync'

export type NodePatch = Record<string, Partial<VisualizationNode>>

/** React Flow's drag callbacks only list dragged nodes, which routing cannot use. */
export function mergeMovedNodes(live: Node[], moved: Node[]): Node[] {
  const byId = new Map(moved.map((node) => [node.id, node]))
  return live.map((node) => byId.get(node.id) ?? node)
}

/** Moving a part moves what is nested in it, along with its ports. */
export function withDescendants(nodes: Node[], ids: string[]): Set<string> {
  const found = new Set(ids)
  let grew = true
  while (grew) {
    grew = false
    for (const node of nodes) {
      if (node.parentId && found.has(node.parentId) && !found.has(node.id)) {
        found.add(node.id)
        grew = true
      }
    }
  }
  return found
}

function positionAndSize(node: Node): Partial<VisualizationNode> {
  return {
    artifactId: node.id,
    x: node.position.x,
    y: node.position.y,
    ...nodeExtentSize(node),
  }
}

export function buildDragStopPatch(dragged: Node[]): NodePatch {
  return Object.fromEntries(dragged.map((n) => [n.id, positionAndSize(n)]))
}

/**
 * The final resize batch holds only dimensions. A resize from the top or left
 * has already moved the node and its children in earlier batches.
 */
export function buildResizeEndPatch(
  resized: { id: string; width: number; height: number }[],
  live: Node[],
): NodePatch {
  const byId = new Map(live.map((node) => [node.id, node]))
  const resizedIds = new Set(resized.map((entry) => entry.id))
  const patch: NodePatch = {}
  for (const { id, width, height } of resized) {
    const node = byId.get(id)
    patch[id] = {
      artifactId: id,
      ...(node ? { x: node.position.x, y: node.position.y } : {}),
      width,
      height,
    }
  }
  for (const node of live) {
    if (node.parentId && resizedIds.has(node.parentId) && !patch[node.id]) {
      patch[node.id] = {
        artifactId: node.id,
        x: node.position.x,
        y: node.position.y,
      }
    }
  }
  return patch
}
