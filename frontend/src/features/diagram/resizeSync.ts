import type { Node, NodeChange } from '@xyflow/react'

function readPx(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

/**
 * Prefer live measured/resized dimensions over the style snapshot set at
 * graph build time, so port placement and persistence follow a resize.
 */
export function nodeExtentSize(n: Node): { width?: number; height?: number } {
  const width =
    readPx(n.width) ?? readPx(n.style?.width) ?? readPx(n.measured?.width)
  const height =
    readPx(n.height) ?? readPx(n.style?.height) ?? readPx(n.measured?.height)
  return { width, height }
}

/** Best-effort width/height for layout helpers (distribute, align). */
export function nodeBoxSize(
  n: Node,
  fallback?: { width?: number; height?: number },
): { width: number; height: number } {
  const { width, height } = nodeExtentSize(n)
  return {
    width: width ?? fallback?.width ?? 180,
    height: height ?? fallback?.height ?? 120,
  }
}

/**
 * After React Flow `applyNodeChanges` writes `node.width`/`height` on a
 * dimensions change, also mirror those into `style` so consumers that still
 * read `style.width` (preserve geometry, align, distribute) see the new box.
 */
export function applyDimensionChangesToStyle<N extends Node>(
  nodes: N[],
  changes: NodeChange[],
): N[] {
  const dims = new Map<string, { width: number; height: number }>()
  for (const c of changes) {
    if (c.type !== 'dimensions' || !c.dimensions) continue
    dims.set(c.id, {
      width: c.dimensions.width,
      height: c.dimensions.height,
    })
  }
  if (!dims.size) return nodes
  return nodes.map((n) => {
    const d = dims.get(n.id)
    if (!d) return n
    return {
      ...n,
      width: d.width,
      height: d.height,
      style: {
        ...n.style,
        width: d.width,
        height: d.height,
      },
    }
  })
}
