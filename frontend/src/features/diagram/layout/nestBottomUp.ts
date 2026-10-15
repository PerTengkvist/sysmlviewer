/**
 * Bottom-up nest placement: deepest parents first, size parents from children,
 * then top-level ELK can place peers with correct container sizes.
 */
import type { Edge, Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import { sizePartForPorts } from './structureAutoLayout'

export const DEFAULT_NEST_PAD = 24
const MIN_W = 140
const MIN_H = 72
const CHILD_GAP = 16

export type NestBottomUpResult = {
  nodePatch: Record<string, Partial<VisualizationNode>>
  /** Parent ids processed deepest-first. */
  processedParents: string[]
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

function labelOf(node: Node): string {
  return (node.data as PartNodeData | undefined)?.label || node.id
}

/** Depth under the boundary (boundary = 0). Nodes outside a boundary use full ancestor count. */
export function nestDepth(
  nodeId: string,
  parentOf: Map<string, string | undefined>,
  boundaryId: string | undefined,
): number {
  let depth = 0
  let cur: string | undefined = nodeId
  const seen = new Set<string>()
  while (cur) {
    if (seen.has(cur)) break
    seen.add(cur)
    if (boundaryId && cur === boundaryId) return depth
    const p = parentOf.get(cur)
    if (!p) return depth
    depth += 1
    cur = p
  }
  return depth
}

export function maxNestDepth(nodes: Node[]): number {
  const parentOf = new Map<string, string | undefined>()
  let boundaryId: string | undefined
  for (const n of nodes) {
    if (!isPartNode(n)) continue
    parentOf.set(n.id, n.parentId)
    if (isBoundary(n)) boundaryId = n.id
  }
  let max = 0
  for (const n of nodes) {
    if (!isPartNode(n) || isBoundary(n)) continue
    max = Math.max(max, nestDepth(n.id, parentOf, boundaryId))
  }
  return max
}

/** Direct part children grouped by parent id. */
export function groupChildrenByParent(nodes: Node[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const n of nodes) {
    if (!isPartNode(n) || isBoundary(n)) continue
    if (!n.parentId) continue
    const list = out.get(n.parentId) || []
    list.push(n.id)
    out.set(n.parentId, list)
  }
  return out
}

/**
 * Parents that have at least one part child, ordered deepest-first
 * (highest nestDepth first). Boundary last among ties by id.
 */
export function parentsOrderedDeepestFirst(nodes: Node[]): string[] {
  const parentOf = new Map<string, string | undefined>()
  let boundaryId: string | undefined
  const byId = new Map<string, Node>()
  for (const n of nodes) {
    if (!isPartNode(n)) continue
    byId.set(n.id, n)
    parentOf.set(n.id, n.parentId)
    if (isBoundary(n)) boundaryId = n.id
  }
  const groups = groupChildrenByParent(nodes)
  const parents = [...groups.keys()].filter((id) => byId.has(id))
  parents.sort((a, b) => {
    const da = nestDepth(a, parentOf, boundaryId)
    const db = nestDepth(b, parentOf, boundaryId)
    if (db !== da) return db - da
    return a.localeCompare(b)
  })
  return parents
}

/**
 * Place nested children under each parent (deepest first) and grow parent boxes.
 * Child x/y are parent-relative. Does not place the boundary's top-level peers
 * among themselves (that is the primary ELK step).
 */
export function layoutNestBottomUp(
  nodes: Node[],
  _edges: Edge[],
  opts: { pad?: number } = {},
): NestBottomUpResult {
  const pad = opts.pad ?? DEFAULT_NEST_PAD
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parentOf = new Map<string, string | undefined>()
  let boundaryId: string | undefined
  for (const n of nodes) {
    if (!isPartNode(n)) continue
    parentOf.set(n.id, n.parentId)
    if (isBoundary(n)) boundaryId = n.id
  }

  const nodePatch: Record<string, Partial<VisualizationNode>> = {}
  const groups = groupChildrenByParent(nodes)
  const processedParents = parentsOrderedDeepestFirst(nodes)

  for (const parentId of processedParents) {
    // Skip laying out boundary children among themselves — primary ELK owns that.
    if (parentId === boundaryId) continue

    const childIds = groups.get(parentId) || []
    if (!childIds.length) continue
    const parentNode = byId.get(parentId)
    if (!parentNode) continue

    // Use already-grown child sizes when children are themselves parents.
    const childBoxes: { id: string; w: number; h: number }[] = childIds.map(
      (id) => {
        const n = byId.get(id)!
        const prev = nodePatch[id]
        const base = readSize(n)
        return {
          id,
          w: prev?.width && prev.width > 0 ? prev.width : base.width,
          h: prev?.height && prev.height > 0 ? prev.height : base.height,
        }
      },
    )

    // Deterministic pack: single row left→right (stable for 1–N nested SW).
    let x = pad
    let y = pad
    let rowH = 0
    let maxX = pad
    let maxY = pad
    for (const box of childBoxes) {
      nodePatch[box.id] = {
        artifactId: box.id,
        x,
        y,
        width: box.w,
        height: box.h,
      }
      maxX = Math.max(maxX, x + box.w)
      maxY = Math.max(maxY, y + box.h)
      rowH = Math.max(rowH, box.h)
      x += box.w + CHILD_GAP
    }

    const contentW = maxX + pad
    const contentH = maxY + pad
    const portSized = sizePartForPorts(
      labelOf(parentNode),
      portsOf(parentNode).map((p) => ({ name: p.name, side: p.side })),
    )
    const parentPrev = nodePatch[parentId]
    const parentBase = readSize(parentNode)
    nodePatch[parentId] = {
      artifactId: parentId,
      x: parentPrev?.x ?? parentNode.position.x,
      y: parentPrev?.y ?? parentNode.position.y,
      width: Math.max(
        contentW,
        portSized.width,
        parentPrev?.width ?? 0,
        parentBase.width,
      ),
      height: Math.max(
        contentH,
        portSized.height,
        parentPrev?.height ?? 0,
        parentBase.height,
      ),
    }
  }

  return { nodePatch, processedParents }
}

/** Apply nest patch sizes/positions onto RF nodes for the next ELK pass. */
export function applyNestPatchToNodes(
  nodes: Node[],
  nestPatch: Record<string, Partial<VisualizationNode>>,
): Node[] {
  return nodes.map((n) => {
    const p = nestPatch[n.id]
    if (!p) return n
    const width = p.width ?? readSize(n).width
    const height = p.height ?? readSize(n).height
    return {
      ...n,
      position: {
        x: p.x ?? n.position.x,
        y: p.y ?? n.position.y,
      },
      width,
      height,
      style: { ...n.style, width, height },
    }
  })
}
