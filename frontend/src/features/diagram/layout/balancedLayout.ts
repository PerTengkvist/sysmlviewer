/**
 * N-based composition placement (Simple: clustered / favour-grid).
 * Shared: 1→center+25%, 2→H/V stack, 3→onion
 * N≥4: clustered prefers onion (hub/density); favour-grid prefers matrix.
 */
import type { Edge, Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import {
  spacingToNodeNode,
  type SpacingPreset,
} from './autoLayoutOptions'
import {
  groupChildrenByParent,
  parentsOrderedDeepestFirst,
} from './nestBottomUp'
import { sizePartForPorts } from './structureAutoLayout'
import { packAroundCore } from './clusteredPack'

const MIN_W = 140
const MIN_H = 72

/** clustered = packed core + rings at N≥4; favour-grid = matrix-leaning at N≥4. */
export type CompositionVariant = 'clustered' | 'favour-grid'

export type BalancedBox = { id: string; w: number; h: number }

export type BalancedPlacement = {
  /** Child positions relative to parent (or absolute for boundary kids). */
  children: Record<string, { x: number; y: number; width: number; height: number }>
  parentWidth: number
  parentHeight: number
  strategy: 'center' | 'stack-h' | 'stack-v' | 'onion' | 'matrix' | 'cluster-pack'
}

function isBoundary(node: Node): boolean {
  return !!(node.data as PartNodeData | undefined)?.isBoundary
}

function isPartNode(node: Node): boolean {
  return !node.type || node.type === 'part'
}

function portsOf(node: Node): PartPort[] {
  return ((node.data as PartNodeData | undefined)?.ports || []) as PartPort[]
}

function labelOf(node: Node): string {
  return (node.data as PartNodeData | undefined)?.label || node.id
}

function readSize(n: Node): { width: number; height: number } {
  const w =
    (typeof n.style?.width === 'number' && n.style.width) ||
    n.width ||
    MIN_W
  const h =
    (typeof n.style?.height === 'number' && n.style.height) ||
    n.height ||
    MIN_H
  return { width: Number(w) || MIN_W, height: Number(h) || MIN_H }
}

/** Gap fraction from spacing preset: compact 15%, normal 20%, spacious 25%. */
export function balancedGapFraction(spacing: SpacingPreset): number {
  switch (spacing) {
    case 'compact':
      return 0.15
    case 'spacious':
      return 0.25
    default:
      return 0.2
  }
}

function degreeMap(
  childIds: string[],
  edges: Edge[],
): Map<string, number> {
  const set = new Set(childIds)
  const deg = new Map<string, number>()
  for (const id of childIds) deg.set(id, 0)
  for (const e of edges) {
    if (!set.has(e.source) || !set.has(e.target) || e.source === e.target) {
      continue
    }
    deg.set(e.source, (deg.get(e.source) || 0) + 1)
    deg.set(e.target, (deg.get(e.target) || 0) + 1)
  }
  return deg
}

function edgeCountAmong(childIds: string[], edges: Edge[]): number {
  const set = new Set(childIds)
  let n = 0
  for (const e of edges) {
    if (set.has(e.source) && set.has(e.target) && e.source !== e.target) n += 1
  }
  return n
}

/** Prefer horizontal stack when there is a clear L→R flow among the pair. */
export function preferHorizontalStack(
  a: string,
  b: string,
  edges: Edge[],
): boolean {
  let aToB = 0
  let bToA = 0
  for (const e of edges) {
    if (e.source === a && e.target === b) aToB += 1
    if (e.source === b && e.target === a) bToA += 1
  }
  if (aToB !== bToA) return true // directed → horizontal
  return true
}

/**
 * Order boxes for favour-grid: connected hubs first, then orphans (degree 0)
 * so isolierten parts fill later matrix cells instead of stretching a ring.
 */
function orderForGrid(
  boxes: BalancedBox[],
  deg: Map<string, number>,
): BalancedBox[] {
  return [...boxes].sort((a, b) => {
    const da = deg.get(a.id) || 0
    const db = deg.get(b.id) || 0
    if (db !== da) return db - da
    return a.id.localeCompare(b.id)
  })
}

/**
 * Place sibling boxes inside a parent according to composition rules.
 * Coordinates are parent-relative with origin at top-left of content area.
 */
export function placeBalancedSiblings(
  boxes: BalancedBox[],
  edges: Edge[],
  opts: {
    gapFraction?: number
    aspectRatio?: number
    variant?: CompositionVariant
  } = {},
): BalancedPlacement {
  const gapFrac = opts.gapFraction ?? 0.2
  const aspectRatio = opts.aspectRatio ?? 1
  const variant = opts.variant ?? 'clustered'
  const n = boxes.length
  if (n === 0) {
    return {
      children: {},
      parentWidth: MIN_W,
      parentHeight: MIN_H,
      strategy: 'center',
    }
  }

  if (n === 1) {
    const b = boxes[0]
    const padX = b.w * 0.125
    const padY = b.h * 0.125
    return {
      children: {
        [b.id]: { x: padX, y: padY, width: b.w, height: b.h },
      },
      parentWidth: b.w * 1.25,
      parentHeight: b.h * 1.25,
      strategy: 'center',
    }
  }

  if (n === 2) {
    const [a, b] = boxes
    const horizontal = preferHorizontalStack(a.id, b.id, edges)
    if (horizontal) {
      const gap = Math.max(a.w, b.w) * gapFrac
      const pad = Math.max(a.w, b.w) * gapFrac
      const rowH = Math.max(a.h, b.h)
      const children = {
        [a.id]: {
          x: pad,
          y: pad + (rowH - a.h) / 2,
          width: a.w,
          height: a.h,
        },
        [b.id]: {
          x: pad + a.w + gap,
          y: pad + (rowH - b.h) / 2,
          width: b.w,
          height: b.h,
        },
      }
      return {
        children,
        parentWidth: pad + a.w + gap + b.w + pad,
        parentHeight: pad + rowH + pad,
        strategy: 'stack-h',
      }
    }
    const gap = Math.max(a.h, b.h) * gapFrac
    const pad = Math.max(a.h, b.h) * gapFrac
    const colW = Math.max(a.w, b.w)
    return {
      children: {
        [a.id]: {
          x: pad + (colW - a.w) / 2,
          y: pad,
          width: a.w,
          height: a.h,
        },
        [b.id]: {
          x: pad + (colW - b.w) / 2,
          y: pad + a.h + gap,
          width: b.w,
          height: b.h,
        },
      },
      parentWidth: pad + colW + pad,
      parentHeight: pad + a.h + gap + b.h + pad,
      strategy: 'stack-v',
    }
  }

  const deg = degreeMap(
    boxes.map((b) => b.id),
    edges,
  )
  const eCount = edgeCountAmong(
    boxes.map((b) => b.id),
    edges,
  )
  const density = eCount / Math.max(n, 1)
  const hubId = [...deg.entries()].sort((x, y) => {
    if (y[1] !== x[1]) return y[1] - x[1]
    return x[0].localeCompare(y[0])
  })[0]?.[0]

  // N === 3: both variants use onion.
  if (n === 3) {
    return placeOnion(boxes, hubId, gapFrac)
  }

  // N ≥ 4
  if (variant === 'favour-grid') {
    // Prefer matrix; only tiny dense clusters may still onion.
    const satelliteCount = n - 1
    const useOnion =
      satelliteCount <= 4 &&
      density >= 1.0 &&
      hubId != null &&
      (deg.get(hubId) || 0) >= n - 1
    if (useOnion) {
      return placeOnion(boxes, hubId, gapFrac)
    }
    return placeMatrix(orderForGrid(boxes, deg), gapFrac, aspectRatio)
  }

  // clustered: dense core + packed rings (matrix when nothing is connected)
  if (eCount === 0) {
    return placeMatrix(boxes, gapFrac, aspectRatio)
  }
  return placeClusterPack(boxes, edges, gapFrac)
}

/** Core via the ≤3 composition rules, satellites in rectangular rings. */
function placeClusterPack(
  boxes: BalancedBox[],
  edges: Edge[],
  gapFrac: number,
): BalancedPlacement {
  const packEdges = edges
    .filter((e) => e.source !== e.target)
    .map((e) => ({ source: e.source, target: e.target }))
  const avg = Math.max(
    boxes.reduce((s, b) => s + b.w, 0) / boxes.length,
    boxes.reduce((s, b) => s + b.h, 0) / boxes.length,
  )
  const packed = packAroundCore(
    boxes,
    packEdges,
    { gapFraction: gapFrac, minChannel: avg * (0.35 + gapFrac) },
    (core, coreEdges) =>
      placeBalancedSiblings(
        core,
        coreEdges.map((e, i) => ({ id: `core-${i}`, ...e }) as Edge),
        { gapFraction: gapFrac, variant: 'clustered' },
      ),
  )
  return {
    children: packed.children,
    parentWidth: packed.parentWidth,
    parentHeight: packed.parentHeight,
    strategy: 'cluster-pack',
  }
}

function placeOnion(
  boxes: BalancedBox[],
  hubId: string | undefined,
  gapFrac: number,
): BalancedPlacement {
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const hub = (hubId && byId.get(hubId)) || boxes[0]
  const satellites = boxes.filter((b) => b.id !== hub.id)
  const avgW =
    boxes.reduce((s, b) => s + b.w, 0) / Math.max(boxes.length, 1)
  const avgH =
    boxes.reduce((s, b) => s + b.h, 0) / Math.max(boxes.length, 1)
  const ringGap = Math.max(avgW, avgH) * (0.35 + gapFrac)
  // Grow radius with satellite count so a single ring does not collapse.
  const radius =
    Math.max(hub.w, hub.h) / 2 +
    ringGap *
      Math.max(1, Math.ceil(Math.sqrt(Math.max(satellites.length, 1))))

  const angles: number[] = []
  const m = Math.max(satellites.length, 1)
  for (let i = 0; i < satellites.length; i++) {
    angles.push(-Math.PI / 2 + (i * 2 * Math.PI) / m)
  }

  const children: BalancedPlacement['children'] = {}
  const placed: { id: string; cx: number; cy: number; w: number; h: number }[] =
    [{ id: hub.id, cx: 0, cy: 0, w: hub.w, h: hub.h }]
  satellites.forEach((b, i) => {
    const ang = angles[i]
    placed.push({
      id: b.id,
      cx: Math.cos(ang) * radius,
      cy: Math.sin(ang) * radius,
      w: b.w,
      h: b.h,
    })
  })

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of placed) {
    minX = Math.min(minX, p.cx - p.w / 2)
    minY = Math.min(minY, p.cy - p.h / 2)
    maxX = Math.max(maxX, p.cx + p.w / 2)
    maxY = Math.max(maxY, p.cy + p.h / 2)
  }
  const pad = Math.max(avgW, avgH) * gapFrac
  const shiftX = -minX + pad
  const shiftY = -minY + pad
  for (const p of placed) {
    children[p.id] = {
      x: p.cx - p.w / 2 + shiftX,
      y: p.cy - p.h / 2 + shiftY,
      width: p.w,
      height: p.h,
    }
  }
  return {
    children,
    parentWidth: maxX - minX + 2 * pad,
    parentHeight: maxY - minY + 2 * pad,
    strategy: 'onion',
  }
}

function placeMatrix(
  boxes: BalancedBox[],
  gapFrac: number,
  aspectRatio: number,
): BalancedPlacement {
  const n = boxes.length
  const cols = Math.max(1, Math.round(Math.sqrt(n * Math.max(aspectRatio, 0.5))))
  const rows = Math.ceil(n / cols)
  const cellW = Math.max(...boxes.map((b) => b.w))
  const cellH = Math.max(...boxes.map((b) => b.h))
  const gapX = cellW * gapFrac
  const gapY = cellH * gapFrac
  const pad = Math.max(cellW, cellH) * gapFrac

  const children: BalancedPlacement['children'] = {}
  boxes.forEach((b, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = pad + col * (cellW + gapX) + (cellW - b.w) / 2
    const y = pad + row * (cellH + gapY) + (cellH - b.h) / 2
    children[b.id] = { x, y, width: b.w, height: b.h }
  })
  return {
    children,
    parentWidth: pad + cols * cellW + (cols - 1) * gapX + pad,
    parentHeight: pad + rows * cellH + (rows - 1) * gapY + pad,
    strategy: 'matrix',
  }
}

export type BalancedLayoutResult = {
  nodePatch: Record<string, Partial<VisualizationNode>>
  processedParents: string[]
  strategies: Record<string, BalancedPlacement['strategy']>
}

/**
 * Bottom-up composition layout for every parent (including boundary peers).
 * Child x/y are parent-relative. Boundary position is preserved; only size grows.
 */
export function layoutBalancedBottomUp(
  nodes: Node[],
  edges: Edge[],
  opts: {
    spacing?: SpacingPreset
    aspectRatio?: number
    variant?: CompositionVariant
  } = {},
): BalancedLayoutResult {
  const spacing = opts.spacing ?? 'normal'
  const aspectRatio = opts.aspectRatio ?? 1
  const variant = opts.variant ?? 'clustered'
  const gapFraction = balancedGapFraction(spacing)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let boundaryId: string | undefined
  for (const n of nodes) {
    if (!isPartNode(n)) continue
    if (isBoundary(n)) boundaryId = n.id
  }

  const nodePatch: Record<string, Partial<VisualizationNode>> = {}
  const strategies: Record<string, BalancedPlacement['strategy']> = {}
  const groups = groupChildrenByParent(nodes)
  const processedParents = parentsOrderedDeepestFirst(nodes)

  for (const n of nodes) {
    if (!isPartNode(n) || isBoundary(n)) continue
    const fitted = sizePartForPorts(
      labelOf(n),
      portsOf(n).map((p) => ({ name: p.name, side: p.side })),
    )
    const base = readSize(n)
    nodePatch[n.id] = {
      artifactId: n.id,
      x: n.position.x,
      y: n.position.y,
      width: Math.max(base.width, fitted.width),
      height: Math.max(base.height, fitted.height),
    }
  }

  for (const parentId of processedParents) {
    const childIds = groups.get(parentId) || []
    if (!childIds.length) continue
    const parentNode = byId.get(parentId)
    if (!parentNode) continue

    const boxes: BalancedBox[] = childIds.map((id) => {
      const prev = nodePatch[id]
      const n = byId.get(id)!
      const base = readSize(n)
      return {
        id,
        w: prev?.width && prev.width > 0 ? prev.width : base.width,
        h: prev?.height && prev.height > 0 ? prev.height : base.height,
      }
    })

    const scopeEdges = edges.filter((e) => {
      const a = childIds.includes(e.source)
      const b = childIds.includes(e.target)
      return a && b
    })

    const placed = placeBalancedSiblings(boxes, scopeEdges, {
      gapFraction,
      aspectRatio,
      variant,
    })
    strategies[parentId] = placed.strategy

    for (const id of childIds) {
      const c = placed.children[id]
      if (!c) continue
      nodePatch[id] = {
        artifactId: id,
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
      }
    }

    const portSized = sizePartForPorts(
      labelOf(parentNode),
      portsOf(parentNode).map((p) => ({ name: p.name, side: p.side })),
    )
    const parentPrev = nodePatch[parentId]
    const parentBase = readSize(parentNode)
    const margin = Math.max(16, spacingToNodeNode(spacing) * 0.2)

    if (parentId === boundaryId) {
      nodePatch[parentId] = {
        artifactId: parentId,
        x: parentNode.position.x,
        y: parentNode.position.y,
        width: Math.max(
          placed.parentWidth + margin,
          portSized.width,
          parentPrev?.width ?? 0,
          parentBase.width,
        ),
        height: Math.max(
          placed.parentHeight + margin,
          portSized.height,
          parentPrev?.height ?? 0,
          parentBase.height,
        ),
      }
    } else {
      // Nested containers are sized from their content (no stale saved box).
      nodePatch[parentId] = {
        artifactId: parentId,
        x: parentPrev?.x ?? parentNode.position.x,
        y: parentPrev?.y ?? parentNode.position.y,
        width: Math.max(placed.parentWidth, portSized.width),
        height: Math.max(placed.parentHeight, portSized.height),
      }
    }
  }

  return { nodePatch, processedParents, strategies }
}
