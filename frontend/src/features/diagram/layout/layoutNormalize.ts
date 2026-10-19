/**
 * After AutoLayout, keep diagram content near the origin (0…AUTO_LAYOUT_CANVAS_MAX)
 * when it fits. Projects often ship with huge default Y (~30000); AutoLayout must
 * not leave parts there.
 */
import type { Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import type { PartNodeData } from '../PartNode'

/** Preferred max coordinate for AutoLayout content (inclusive span from origin). */
export const AUTO_LAYOUT_CANVAS_MAX = 3000

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

function isPartNode(node: Node): boolean {
  return !node.type || node.type === 'part'
}

function readSize(
  patch: Partial<VisualizationNode> | undefined,
  node: Node | undefined,
): { width: number; height: number } {
  const w =
    (typeof patch?.width === 'number' && patch.width) ||
    (typeof node?.style?.width === 'number' && node.style.width) ||
    node?.width ||
    140
  const h =
    (typeof patch?.height === 'number' && patch.height) ||
    (typeof node?.style?.height === 'number' && node.style.height) ||
    node?.height ||
    72
  return { width: Number(w) || 140, height: Number(h) || 72 }
}

export type NormalizeAutoLayoutResult = {
  /** True when origin / root positions were adjusted. */
  shifted: boolean
  contentWidth: number
  contentHeight: number
  /** True when content fits entirely in 0…maxCoord after normalize. */
  withinCanvas: boolean
}

/**
 * Pin the whitebox (or root peers) to the origin after AutoLayout.
 * - Always prefer origin (pad, pad) so content starts near 0.
 * - If content size ≤ maxCoord, it lies within 0…maxCoord.
 * - If larger, still start at origin (overflow past maxCoord is allowed).
 * Manual moves are untouched — this only runs on AutoLayout patches.
 */
export function normalizeAutoLayoutCanvas(
  nodePatch: Record<string, Partial<VisualizationNode>>,
  nodes: Node[],
  opts: { maxCoord?: number; pad?: number } = {},
): NormalizeAutoLayoutResult {
  const maxCoord = opts.maxCoord ?? AUTO_LAYOUT_CANVAS_MAX
  const pad = opts.pad ?? 0
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const boundary = nodes.find((n) => isPartNode(n) && isBoundary(n))
  if (boundary && nodePatch[boundary.id]) {
    const sz = readSize(nodePatch[boundary.id], boundary)
    const prevX = nodePatch[boundary.id]?.x ?? boundary.position.x
    const prevY = nodePatch[boundary.id]?.y ?? boundary.position.y
    const shifted = prevX !== pad || prevY !== pad
    nodePatch[boundary.id] = {
      ...nodePatch[boundary.id],
      artifactId: boundary.id,
      x: pad,
      y: pad,
      width: sz.width,
      height: sz.height,
    }
    return {
      shifted,
      contentWidth: sz.width,
      contentHeight: sz.height,
      withinCanvas: sz.width <= maxCoord && sz.height <= maxCoord,
    }
  }

  // No boundary: shift root-level parts so their bbox starts at (pad, pad).
  const rootIds = nodes
    .filter((n) => isPartNode(n) && !n.parentId && nodePatch[n.id])
    .map((n) => n.id)
  if (!rootIds.length) {
    return {
      shifted: false,
      contentWidth: 0,
      contentHeight: 0,
      withinCanvas: true,
    }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const id of rootIds) {
    const p = nodePatch[id]!
    const n = byId.get(id)
    const x = p.x ?? n?.position.x ?? 0
    const y = p.y ?? n?.position.y ?? 0
    const sz = readSize(p, n)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + sz.width)
    maxY = Math.max(maxY, y + sz.height)
  }
  if (!Number.isFinite(minX)) {
    return {
      shifted: false,
      contentWidth: 0,
      contentHeight: 0,
      withinCanvas: true,
    }
  }

  const shiftX = pad - minX
  const shiftY = pad - minY
  const shifted = shiftX !== 0 || shiftY !== 0
  if (shifted) {
    for (const id of rootIds) {
      const p = nodePatch[id]!
      const n = byId.get(id)
      nodePatch[id] = {
        ...p,
        artifactId: id,
        x: (p.x ?? n?.position.x ?? 0) + shiftX,
        y: (p.y ?? n?.position.y ?? 0) + shiftY,
      }
    }
  }

  const contentWidth = maxX - minX
  const contentHeight = maxY - minY
  return {
    shifted,
    contentWidth,
    contentHeight,
    withinCanvas: contentWidth <= maxCoord && contentHeight <= maxCoord,
  }
}

/** Flow-space rectangle visible in the React Flow viewport. */
export function flowViewportBounds(
  viewport: { x: number; y: number; zoom: number },
  widthPx: number,
  heightPx: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const z = viewport.zoom || 1
  // `+ 0` normalizes -0 from `-viewport.x / z` when x is 0.
  return {
    minX: -viewport.x / z + 0,
    minY: -viewport.y / z + 0,
    maxX: (-viewport.x + widthPx) / z + 0,
    maxY: (-viewport.y + heightPx) / z + 0,
  }
}

export function pointInFlowBounds(
  p: { x: number; y: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
  margin = 0,
): boolean {
  return (
    p.x >= b.minX - margin &&
    p.x <= b.maxX + margin &&
    p.y >= b.minY - margin &&
    p.y <= b.maxY + margin
  )
}

export function intersectFlowBounds(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const minX = Math.max(a.minX, b.minX)
  const minY = Math.max(a.minY, b.minY)
  const maxX = Math.min(a.maxX, b.maxX)
  const maxY = Math.min(a.maxY, b.maxY)
  if (minX >= maxX || minY >= maxY) return null
  return { minX, minY, maxX, maxY }
}
