/** A port name's distance from its default place, in diagram pixels. */
export type PortLabelOffset = { x: number; y: number }

type Point = { x: number; y: number }
type Box = { left: number; top: number; right: number; bottom: number }

/** A name dropped closer than this to its default place goes back there. */
export const PORT_LABEL_SNAP_PX = 8

export function isMovedPortLabel(
  offset: PortLabelOffset | null | undefined,
): offset is PortLabelOffset {
  return !!offset && (offset.x !== 0 || offset.y !== 0)
}

export function samePortLabelOffset(
  a: PortLabelOffset | null | undefined,
  b: PortLabelOffset | null | undefined,
): boolean {
  return (a?.x ?? 0) === (b?.x ?? 0) && (a?.y ?? 0) === (b?.y ?? 0)
}

/** Where a dragged name ends up. Null is the default place. */
export function dragPortLabelOffset(
  start: PortLabelOffset | null | undefined,
  screenDelta: Point,
  zoom: number,
): PortLabelOffset | null {
  const x = Math.round((start?.x ?? 0) + screenDelta.x / zoom)
  const y = Math.round((start?.y ?? 0) + screenDelta.y / zoom)
  return Math.hypot(x, y) < PORT_LABEL_SNAP_PX ? null : { x, y }
}

/** The point on the name's box nearest the port. Null when the box covers the port. */
export function leaderLineEnd(port: Point, label: Box): Point | null {
  const x = Math.min(label.right, Math.max(label.left, port.x))
  const y = Math.min(label.bottom, Math.max(label.top, port.y))
  return x === port.x && y === port.y ? null : { x, y }
}

export function applyPortLabelMoveToNodes<N extends { data: Record<string, unknown> }>(
  nodes: N[],
  portId: string,
  labelOffset: PortLabelOffset | null,
): N[] {
  return nodes.map((node) => {
    const ports = node.data.ports as { id: string }[] | undefined
    if (!ports?.some((port) => port.id === portId)) return node
    return {
      ...node,
      data: {
        ...node.data,
        ports: ports.map((port) =>
          port.id === portId ? { ...port, labelOffset } : port,
        ),
      },
    }
  })
}

/** Show saved offsets on nodes that are already drawn, such as after undo. */
export function syncPortLabelOffsets<N extends { data: Record<string, unknown> }>(
  nodes: N[],
  saved: Record<string, { labelOffset?: PortLabelOffset | null }>,
): N[] {
  return nodes.map((node) => {
    const ports = node.data.ports as
      | { id: string; labelOffset?: PortLabelOffset | null }[]
      | undefined
    const differs = ports?.some(
      (port) => !samePortLabelOffset(port.labelOffset, saved[port.id]?.labelOffset),
    )
    if (!differs) return node
    return {
      ...node,
      data: {
        ...node.data,
        ports: ports!.map((port) => ({
          ...port,
          labelOffset: saved[port.id]?.labelOffset ?? null,
        })),
      },
    }
  })
}
