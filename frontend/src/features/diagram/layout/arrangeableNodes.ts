import type { Node } from '@xyflow/react'

/**
 * Node types that align / distribute must not move: port name labels are
 * positioned relative to their port, not as free diagram elements.
 */
const NON_ARRANGEABLE_TYPES = new Set(['portAnnotation'])

/** True for diagram nodes the align / distribute tools may move. */
export function isArrangeableNode(node: Node): boolean {
  return !NON_ARRANGEABLE_TYPES.has(node.type || '')
}

/**
 * The selected ids that are movable diagram nodes (parts, interfaces,
 * requirements, use cases, actors, packages), in selection order.
 * Edges, port labels and ids not on the canvas are dropped.
 */
export function arrangeableNodeIds(
  nodes: Node[],
  selectedIds: string[],
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return selectedIds.filter((id) => {
    const node = byId.get(id)
    return !!node && isArrangeableNode(node)
  })
}
