import type { Node } from '@xyflow/react'
import type { VisualizationNode } from '../../api'

type GeometryPatch = Record<string, Partial<VisualizationNode>>
type PortLike = { id: string; side?: unknown; offset?: unknown }

/**
 * Put a saved geometry patch (from the Details panel's Size and Position
 * fields) on the canvas nodes at once. A node gets its new x, y, width and
 * height; a port in the patch gets its new side and offset on its owner.
 * Nodes the patch does not touch keep their identity.
 */
export function applySavedGeometry(nodes: Node[], patch: GeometryPatch): Node[] {
  return nodes.map((node) => {
    const own = patch[node.id]
    const data = node.data as { ports?: PortLike[] } | undefined
    const portPatched = data?.ports?.some((p) => patch[p.id])
    if (!own && !portPatched) return node
    let next: Node = node
    if (own) {
      const width = own.width ?? undefined
      const height = own.height ?? undefined
      next = {
        ...next,
        position: {
          x: own.x ?? next.position.x,
          y: own.y ?? next.position.y,
        },
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        style: {
          ...next.style,
          ...(width != null ? { width } : {}),
          ...(height != null ? { height } : {}),
        },
      }
    }
    if (portPatched && data?.ports) {
      next = {
        ...next,
        data: {
          ...next.data,
          ports: data.ports.map((p) => {
            const pp = patch[p.id]
            if (!pp) return p
            return {
              ...p,
              ...(pp.side != null ? { side: pp.side } : {}),
              ...(pp.offset != null ? { offset: pp.offset } : {}),
            }
          }),
        },
      }
    }
    return next
  })
}
