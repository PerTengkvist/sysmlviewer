/**
 * After undirected placement (e.g. ELK stress), nudge parts so each directed
 * connection has its source to the left of its target. Matches Inputs-left /
 * Outputs-right port sides and shortens orthogonal routes.
 *
 * Also: absolute non-overlap + nest-fit so nested SW cannot sit on peers.
 */
import type { VisualizationNode } from '../../../api'

const MIN_W = 140
const MIN_H = 72
const DEFAULT_NEST_PAD = 24

export type FlowLink = {
  sourcePart: string
  targetPart: string
}

export type ParentOfMap = Map<string, string | undefined>

function sizeOf(p: Partial<VisualizationNode>): { w: number; h: number } {
  return {
    w: p.width && p.width > 0 ? p.width : MIN_W,
    h: p.height && p.height > 0 ? p.height : MIN_H,
  }
}

function overlaps(
  a: Partial<VisualizationNode>,
  b: Partial<VisualizationNode>,
  gap: number,
): boolean {
  if (a.x == null || a.y == null || b.x == null || b.y == null) return false
  const as = sizeOf(a)
  const bs = sizeOf(b)
  return !(
    a.x + as.w + gap <= b.x ||
    b.x + bs.w + gap <= a.x ||
    a.y + as.h + gap <= b.y ||
    b.y + bs.h + gap <= a.y
  )
}

/** Absolute origin of a node (sum of relative positions up the parent chain). */
export function absoluteOrigin(
  id: string,
  nodePatch: Record<string, Partial<VisualizationNode>>,
  parentOf: ParentOfMap,
): { x: number; y: number } {
  let x = 0
  let y = 0
  let cur: string | undefined = id
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const p = nodePatch[cur]
    if (p?.x != null) x += p.x
    if (p?.y != null) y += p.y
    cur = parentOf.get(cur)
  }
  return { x, y }
}

export function absoluteRect(
  id: string,
  nodePatch: Record<string, Partial<VisualizationNode>>,
  parentOf: ParentOfMap,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const p = nodePatch[id]
  if (!p || p.x == null || p.y == null) return null
  const o = absoluteOrigin(id, nodePatch, parentOf)
  // absoluteOrigin already includes this node's x,y
  const sz = sizeOf(p)
  return {
    minX: o.x,
    minY: o.y,
    maxX: o.x + sz.w,
    maxY: o.y + sz.h,
  }
}

export function absoluteRectsOverlap(
  nodePatch: Record<string, Partial<VisualizationNode>>,
  aId: string,
  bId: string,
  parentOf: ParentOfMap,
  gap: number,
): boolean {
  const a = absoluteRect(aId, nodePatch, parentOf)
  const b = absoluteRect(bId, nodePatch, parentOf)
  if (!a || !b) return false
  return !(
    a.maxX + gap <= b.minX ||
    b.maxX + gap <= a.minX ||
    a.maxY + gap <= b.minY ||
    b.maxY + gap <= a.minY
  )
}

function isAncestor(
  ancestor: string,
  node: string,
  parentOf: ParentOfMap,
): boolean {
  let cur: string | undefined = node
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    if (cur === ancestor) return true
    cur = parentOf.get(cur)
  }
  return false
}

/** Push overlapping peers apart (prefer vertical when x-aligned). Same parent frame. */
export function separateOverlappingParts(
  nodePatch: Record<string, Partial<VisualizationNode>>,
  childIds: string[],
  gap: number,
): void {
  const ids = childIds.filter((id) => nodePatch[id]?.x != null)
  for (let iter = 0; iter < ids.length * 3; iter++) {
    let moved = false
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodePatch[ids[i]]!
        const b = nodePatch[ids[j]]!
        if (!overlaps(a, b, gap)) continue
        const as = sizeOf(a)
        const bs = sizeOf(b)
        const sameColumn = Math.abs((a.x || 0) - (b.x || 0)) < as.w * 0.5
        if (sameColumn || Math.abs((a.y || 0) - (b.y || 0)) < Math.abs((a.x || 0) - (b.x || 0))) {
          // Separate vertically — keep lower part below.
          if ((a.y || 0) <= (b.y || 0)) {
            b.y = (a.y || 0) + as.h + gap
          } else {
            a.y = (b.y || 0) + bs.h + gap
          }
        } else if ((a.x || 0) <= (b.x || 0)) {
          b.x = (a.x || 0) + as.w + gap
        } else {
          a.x = (b.x || 0) + bs.w + gap
        }
        moved = true
      }
    }
    if (!moved) break
  }
}

/**
 * Clamp nested children into their parent content box; grow parent if needed.
 * Child x/y are parent-relative.
 */
export function fitNestedChildrenInParents(
  nodePatch: Record<string, Partial<VisualizationNode>>,
  parentOf: ParentOfMap,
  pad: number = DEFAULT_NEST_PAD,
): void {
  const childrenByParent = new Map<string, string[]>()
  for (const [child, parent] of parentOf) {
    if (!parent || !nodePatch[child] || !nodePatch[parent]) continue
    const list = childrenByParent.get(parent) || []
    list.push(child)
    childrenByParent.set(parent, list)
  }

  for (const [parentId, childIds] of childrenByParent) {
    const parent = nodePatch[parentId]!
    let needW = sizeOf(parent).w
    let needH = sizeOf(parent).h
    for (const cid of childIds) {
      const c = nodePatch[cid]!
      if (c.x == null || c.y == null) continue
      const sz = sizeOf(c)
      if (c.x < pad) c.x = pad
      if (c.y < pad) c.y = pad
      needW = Math.max(needW, c.x + sz.w + pad)
      needH = Math.max(needH, c.y + sz.h + pad)
    }
    parent.width = needW
    parent.height = needH
  }
}

/**
 * Separate parts that overlap in absolute flow space, skipping parent/child pairs.
 * Moves the node that sits further down/right (stable preference).
 */
export function separateAbsoluteOverlaps(
  nodePatch: Record<string, Partial<VisualizationNode>>,
  ids: string[],
  parentOf: ParentOfMap,
  gap: number,
): void {
  const live = ids.filter((id) => nodePatch[id]?.x != null)
  const maxIter = Math.max(8, live.length * 4)
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = false
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const aId = live[i]!
        const bId = live[j]!
        if (isAncestor(aId, bId, parentOf) || isAncestor(bId, aId, parentOf)) {
          continue
        }
        if (!absoluteRectsOverlap(nodePatch, aId, bId, parentOf, gap)) continue
        const a = absoluteRect(aId, nodePatch, parentOf)!
        const b = absoluteRect(bId, nodePatch, parentOf)!

        // Prefer moving the node whose absolute top-left is further down/right.
        const moveB =
          b.minY > a.minY || (b.minY === a.minY && b.minX >= a.minX)
        const moveId = moveB ? bId : aId
        const keep = moveB ? a : b
        const moveNode = nodePatch[moveId]!

        const overlapW =
          Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
        const overlapH =
          Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY)
        let parentOnly = { x: 0, y: 0 }
        const parentId = parentOf.get(moveId)
        if (parentId) {
          parentOnly = absoluteOrigin(parentId, nodePatch, parentOf)
        }
        if (overlapH <= overlapW) {
          moveNode.y = keep.maxY + gap - parentOnly.y
        } else {
          moveNode.x = keep.maxX + gap - parentOnly.x
        }
        moved = true
      }
    }
    if (!moved) break
  }
}

/**
 * Ensure each directed edge has source.right + gap <= target.left.
 * Preserves Y from the prior layout as much as possible.
 */
export function enforceFlowLeftToRight(
  nodePatch: Record<string, Partial<VisualizationNode>>,
  links: FlowLink[],
  childIds: Iterable<string>,
  gap: number,
): void {
  const ids = [...childIds].filter((id) => {
    const p = nodePatch[id]
    return p != null && p.x != null && p.y != null
  })
  if (ids.length < 2) return

  const idSet = new Set(ids)
  const directed = links.filter(
    (l) =>
      idSet.has(l.sourcePart) &&
      idSet.has(l.targetPart) &&
      l.sourcePart !== l.targetPart,
  )
  if (!directed.length) return

  for (let iter = 0; iter < ids.length + 4; iter++) {
    let moved = false
    for (const l of directed) {
      const s = nodePatch[l.sourcePart]!
      const t = nodePatch[l.targetPart]!
      const sw = sizeOf(s).w
      const need = (s.x || 0) + sw + gap
      if ((t.x || 0) >= need) continue
      t.x = need
      moved = true
    }
    separateOverlappingParts(nodePatch, ids, Math.max(16, gap * 0.5))
    if (!moved) break
  }
}
