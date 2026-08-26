import type { Edge, Node } from '@xyflow/react'

export type RedrawDirection = 'TD' | 'LR'

export type Size = { width: number; height: number }

const ORIGIN_X = 48
const ORIGIN_Y = 48
const FALLBACK_W = 140
const FALLBACK_H = 56

function readDim(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    if (Number.isFinite(n) && n > 0) return n
  }
  return fallback
}

function nodeSize(n: Node): Size {
  return {
    width: readDim(n.style?.width ?? n.width ?? n.measured?.width, FALLBACK_W),
    height: readDim(n.style?.height ?? n.height ?? n.measured?.height, FALLBACK_H),
  }
}

/** Gap = 100% of the larger of the two related element sizes. */
function marginBetween(a: number, b: number): number {
  return Math.max(a, b)
}

/**
 * Layer nodes by dependency (Kahn): A→B→C→D → [[A],[B],[C],[D]];
 * A→B, A→C, A→D → [[A],[B,C,D]].
 */
export function dependencyLayers(
  nodeIds: string[],
  edges: { source: string; target: string }[],
): string[][] {
  const idSet = new Set(nodeIds)
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of nodeIds) {
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of edges) {
    if (!idSet.has(e.source) || !idSet.has(e.target) || e.source === e.target) continue
    adj.get(e.source)!.push(e.target)
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1)
  }

  const layers: string[][] = []
  let frontier = nodeIds.filter((id) => (indeg.get(id) || 0) === 0).sort()
  const placed = new Set<string>()

  while (frontier.length) {
    layers.push([...frontier])
    for (const id of frontier) placed.add(id)
    const next: string[] = []
    for (const u of frontier) {
      for (const v of adj.get(u) || []) {
        if (placed.has(v)) continue
        const d = (indeg.get(v) || 0) - 1
        indeg.set(v, d)
        if (d === 0) next.push(v)
      }
    }
    frontier = [...new Set(next)].sort()
  }

  const rest = nodeIds.filter((id) => !placed.has(id)).sort()
  if (rest.length) layers.push(rest)
  return layers
}

export type LayoutResult = {
  positions: Record<string, { x: number; y: number }>
}

/**
 * Place nodes by dependency layers.
 * TD: layers top→bottom (arrows down); siblings side-by-side.
 * LR: layers left→right (arrows right); siblings stacked.
 * Gap between neighbours = 100% of the larger element's size on that axis.
 */
export function layoutByDependency(
  nodes: Node[],
  edges: Edge[],
  direction: RedrawDirection,
): LayoutResult {
  if (!nodes.length) return { positions: {} }

  const byParent = new Map<string | null, Node[]>()
  for (const n of nodes) {
    const p = (n.parentId as string | undefined) || null
    const list = byParent.get(p) || []
    list.push(n)
    byParent.set(p, list)
  }

  const positions: Record<string, { x: number; y: number }> = {}

  for (const [, group] of byParent) {
    const ids = group.map((n) => n.id)
    const idSet = new Set(ids)
    const groupEdges = edges
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }))

    const layers = dependencyLayers(ids, groupEdges)
    const sizeOf = new Map(group.map((n) => [n.id, nodeSize(n)]))

    if (direction === 'TD') {
      let y = ORIGIN_Y
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li]
        const heights = layer.map((id) => sizeOf.get(id)!.height)
        const layerH = heights.length ? Math.max(...heights) : FALLBACK_H

        let x = ORIGIN_X
        for (let i = 0; i < layer.length; i++) {
          const id = layer[i]
          const sz = sizeOf.get(id)!
          positions[id] = { x, y }
          if (i + 1 < layer.length) {
            const nextSz = sizeOf.get(layer[i + 1])!
            x += sz.width + marginBetween(sz.width, nextSz.width)
          }
        }

        if (li + 1 < layers.length) {
          const nextLayer = layers[li + 1]
          const nextHeights = nextLayer.map((id) => sizeOf.get(id)!.height)
          const nextH = nextHeights.length ? Math.max(...nextHeights) : FALLBACK_H
          y += layerH + marginBetween(layerH, nextH)
        }
      }
    } else {
      let x = ORIGIN_X
      for (let li = 0; li < layers.length; li++) {
        const layer = layers[li]
        const widths = layer.map((id) => sizeOf.get(id)!.width)
        const layerW = widths.length ? Math.max(...widths) : FALLBACK_W

        let y = ORIGIN_Y
        for (let i = 0; i < layer.length; i++) {
          const id = layer[i]
          const sz = sizeOf.get(id)!
          positions[id] = { x, y }
          if (i + 1 < layer.length) {
            const nextSz = sizeOf.get(layer[i + 1])!
            y += sz.height + marginBetween(sz.height, nextSz.height)
          }
        }

        if (li + 1 < layers.length) {
          const nextLayer = layers[li + 1]
          const nextWidths = nextLayer.map((id) => sizeOf.get(id)!.width)
          const nextW = nextWidths.length ? Math.max(...nextWidths) : FALLBACK_W
          x += layerW + marginBetween(layerW, nextW)
        }
      }
    }
  }

  return { positions }
}

function isDecisionNode(n: Node | undefined): boolean {
  const d = n?.data as { isDecision?: boolean } | undefined
  return !!d?.isDecision
}

function branchKind(e: Edge): 'yes' | 'no' | null {
  const label = typeof e.label === 'string' ? e.label.toUpperCase() : ''
  if (label === 'YES') return 'yes'
  if (label === 'NO') return 'no'
  if (e.sourceHandle === 'yes') return 'yes'
  if (e.sourceHandle === 'no') return 'no'
  return null
}

/**
 * Prefer handles so flow reads TD (down) or LR (right).
 * Decision nodes:
 * - TD: inflow → top; outflows → bottom / left / right
 * - LR: inflow → left; outflows → top / bottom / right
 */
export function orientEdgeHandles(
  edges: Edge[],
  direction: RedrawDirection,
  nodes: Node[] = [],
): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  return edges.map((e) => {
    const data = { ...((e.data || {}) as Record<string, unknown>), flowDir: direction }
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)

    // Structure / sequence: keep specialized handles
    if (
      e.sourceHandle?.startsWith('msg-') ||
      e.targetHandle?.startsWith('msg-') ||
      e.sourceHandle?.includes(':') ||
      e.targetHandle?.startsWith('target:')
    ) {
      return { ...e, data }
    }

    const fromDecision = isDecisionNode(src)
    const toDecision = isDecisionNode(tgt)
    const branch = branchKind(e)

    if (direction === 'TD') {
      let sourceHandle = 'bottom'
      let targetHandle = 'top'

      if (fromDecision) {
        if (branch === 'yes') sourceHandle = 'out-left'
        else if (branch === 'no') sourceHandle = 'out-right'
        else sourceHandle = 'out-bottom'
      }
      if (toDecision) targetHandle = 'in-top'

      return { ...e, sourceHandle, targetHandle, data }
    }

    // LR
    let sourceHandle = 'out'
    let targetHandle = 'in'

    if (fromDecision) {
      if (branch === 'yes') sourceHandle = 'out-top'
      else if (branch === 'no') sourceHandle = 'out-bottom'
      else sourceHandle = 'out-right'
    }
    if (toDecision) targetHandle = 'in-left'

    return { ...e, sourceHandle, targetHandle, data }
  })
}
