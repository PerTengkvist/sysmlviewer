import type { Node } from '@xyflow/react'
import type { PortSide } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import { clampPortOffset, type ClampPortOpts } from './portPlacement'

export type PortPlacement = {
  id: string
  side: PortSide
  offset: number
}

export type PortMove = {
  portId: string
  side: PortSide
  offset: number
}

/**
 * Move a group of selected ports relative to the grabbed port's new anchor.
 * Same side: apply offset delta. Side change: move all to the new side with
 * the same relative offset delta (clamped).
 */
export function applyPortGroupDelta(
  starts: PortPlacement[],
  grabbedId: string,
  anchor: { side: PortSide; offset: number },
  partHeight: number,
  opts?: ClampPortOpts,
): PortMove[] {
  const grabbed = starts.find((p) => p.id === grabbedId)
  if (!grabbed) return []
  const delta = anchor.offset - grabbed.offset
  const sideChanged = anchor.side !== grabbed.side
  return starts.map((p) => {
    if (p.id === grabbedId) {
      return {
        portId: p.id,
        side: anchor.side,
        offset: clampPortOffset(anchor.offset, anchor.side, partHeight, opts),
      }
    }
    const side = sideChanged ? anchor.side : p.side
    const offset = clampPortOffset(p.offset + delta, side, partHeight, opts)
    return { portId: p.id, side, offset }
  })
}

/** Apply port placement moves onto React Flow part nodes. */
export function applyPortMovesToNodes(
  nodes: Node[],
  moves: PortMove[],
): Node[] {
  if (!moves.length) return nodes
  const byId = new Map(moves.map((m) => [m.portId, m]))
  return nodes.map((node) => {
    const data = node.data as PartNodeData | undefined
    if (!data?.ports?.length) return node
    let changed = false
    const ports = data.ports.map((p: PartPort) => {
      const m = byId.get(p.id)
      if (!m) return p
      changed = true
      return { ...p, side: m.side, offset: m.offset }
    })
    if (!changed) return node
    return { ...node, data: { ...data, ports } }
  })
}
