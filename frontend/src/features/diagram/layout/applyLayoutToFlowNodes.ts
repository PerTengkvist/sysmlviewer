import type { Node } from '@xyflow/react'
import type { PortSide, VisualizationNode } from '../../../api'
import type { PartNodeData } from '../PartNode'

/** Apply AutoLayout node/port patches onto React Flow nodes for absolute routing. */
export function applyLayoutToFlowNodes(
  nodes: Node[],
  patch: Record<string, Partial<VisualizationNode>>,
): Node[] {
  return nodes.map((node) => {
    const p = patch[node.id]
    const data = node.data as PartNodeData | undefined
    let nextData: PartNodeData | undefined = data
    if (data?.ports?.length) {
      let portsChanged = false
      const ports = data.ports.map((port) => {
        const pp = patch[port.id]
        if (!pp) return port
        portsChanged = true
        return {
          ...port,
          side: (pp.side as PortSide) || port.side,
          offset: pp.offset ?? port.offset,
        }
      })
      if (portsChanged) nextData = { ...data, ports }
    }
    if (!p && nextData === data) return node
    return {
      ...node,
      position:
        p?.x != null && p?.y != null
          ? { x: p.x, y: p.y }
          : node.position,
      width: p?.width ?? node.width,
      height: p?.height ?? node.height,
      style: {
        ...node.style,
        width: p?.width ?? (node.style?.width as number | undefined),
        height: p?.height ?? (node.style?.height as number | undefined),
      },
      data: nextData ?? node.data,
    }
  })
}
