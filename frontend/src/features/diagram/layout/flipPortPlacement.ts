/**
 * Mirror port side/offset on a part.
 * Horizontal = mirror across the vertical center line (left↔right).
 * Vertical = mirror across the horizontal center line (top↔bottom).
 */
import type { PortSide, VisualizationNode } from '../../../api'
import { clampPortOffset } from './portPlacement'

export type FlipAxis = 'horizontal' | 'vertical'

export type PortPlacement = {
  side: PortSide
  offset: number
}

export type FlippablePort = {
  id: string
  side: PortSide
  offset: number
}

function flipSide(side: PortSide, axis: FlipAxis): PortSide {
  if (axis === 'horizontal') {
    if (side === 'left') return 'right'
    if (side === 'right') return 'left'
    return side
  }
  if (side === 'top') return 'bottom'
  if (side === 'bottom') return 'top'
  return side
}

function flipOffset(side: PortSide, offset: number, axis: FlipAxis): number {
  // Across vertical midline: top/bottom slide along the edge (offset → 1-offset).
  // Across horizontal midline: left/right slide along the edge.
  const mirrorsAlongWidth =
    axis === 'horizontal' && (side === 'top' || side === 'bottom')
  const mirrorsAlongHeight =
    axis === 'vertical' && (side === 'left' || side === 'right')
  if (mirrorsAlongWidth || mirrorsAlongHeight) return 1 - offset
  return offset
}

/** Flip a single port placement; clamps offset for the resulting side. */
export function flipPortPlacement(
  placement: PortPlacement,
  axis: FlipAxis,
  partHeight = 120,
  opts?: { isBoundary?: boolean },
): PortPlacement {
  const side = flipSide(placement.side, axis)
  const raw = flipOffset(placement.side, placement.offset, axis)
  return {
    side,
    offset: clampPortOffset(raw, side, partHeight, opts),
  }
}

/** Flip every port in the list (live part ports, including unsaved placements). */
export function flipPortList(
  ports: FlippablePort[],
  axis: FlipAxis,
  partHeight = 120,
  opts?: { isBoundary?: boolean },
): FlippablePort[] {
  return ports.map((p) => {
    const next = flipPortPlacement(
      { side: p.side, offset: p.offset },
      axis,
      partHeight,
      opts,
    )
    return { id: p.id, side: next.side, offset: next.offset }
  })
}

/**
 * Build a viz node patch for ports belonging to `partIds` that already have
 * saved side/offset in visualization (legacy helper).
 */
export function flipPortsForParts(
  partIds: string[],
  nodes: Record<string, VisualizationNode>,
  portParent: (portId: string) => string | null,
  axis: FlipAxis,
): Record<string, Partial<VisualizationNode>> {
  const parts = new Set(partIds)
  const patch: Record<string, Partial<VisualizationNode>> = {}
  for (const [id, viz] of Object.entries(nodes)) {
    if (viz.side == null || viz.offset == null) continue
    const parent = portParent(id)
    if (!parent || !parts.has(parent)) continue
    const partH = nodes[parent]?.height ?? 120
    const next = flipPortPlacement(
      { side: viz.side, offset: viz.offset },
      axis,
      partH,
    )
    patch[id] = {
      artifactId: id,
      side: next.side,
      offset: next.offset,
    }
  }
  return patch
}
