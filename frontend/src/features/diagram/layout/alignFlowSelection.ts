import type { Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import { absoluteNodeOrigin } from '../modes/structure/buildStructureGraph'
import {
  alignSelection,
  type AlignableNode,
  type AlignAxis,
  type AlignResult,
} from './align'

/** Map React Flow nodes to AlignableNode with absolute parent origins. */
export function flowNodesToAlignable(nodes: Node[]): AlignableNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes.map((n) => {
    const parentAbs = n.parentId
      ? (() => {
          const parent = byId.get(n.parentId)
          return parent ? absoluteNodeOrigin(parent, byId) : undefined
        })()
      : undefined
    return {
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      width: Number(n.style?.width) || 100,
      height: Number(n.style?.height) || 40,
      parentAbs,
    }
  })
}

/**
 * Align selected flow nodes (general / structure diagram parts).
 * Returns visualization patches; caller must also apply x/y to live nodes.
 */
export function alignFlowSelection(
  nodes: Node[],
  selectedIds: string[],
  axis: AlignAxis,
): AlignResult {
  const items = flowNodesToAlignable(nodes)
  return alignSelection(items, axis, selectedIds)
}

/** Apply align x/y patches onto React Flow node positions. */
export function applyAlignPatchToFlowNodes(
  nodes: Node[],
  patch: Record<string, Partial<VisualizationNode>>,
): Node[] {
  return nodes.map((n) => {
    const p = patch[n.id]
    if (!p || (p.x === undefined && p.y === undefined)) return n
    return {
      ...n,
      position: {
        x: p.x !== undefined ? p.x : n.position.x,
        y: p.y !== undefined ? p.y : n.position.y,
      },
    }
  })
}
