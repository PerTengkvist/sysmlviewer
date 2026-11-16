import type { Edge, Node } from '@xyflow/react'
import { branchKind, dependencyLayers } from './dependencyLayout'

/**
 * Top-down layout of an activity flow: the dependency layers of Redraw TD
 * (start on top, done last), with loops left out of the layering, and the
 * branches of a decision in lanes side by side (yes left, else right, as
 * orientEdgeHandles draws them).
 */

/**
 * Edge ids that loop back: depth-first from start, an edge whose target is
 * still on the walk's stack. Converging branches are not loops, so the
 * order of the steps (a preorder walk) is not used for this.
 */
export function feedbackEdgeIds(edges: Edge[], startId: string | undefined): Set<string> {
  const out = new Map<string, Edge[]>()
  for (const e of edges) {
    const list = out.get(e.source)
    if (list) list.push(e)
    else out.set(e.source, [e])
  }
  const feedback = new Set<string>()
  const done = new Set<string>()
  const onStack = new Set<string>()
  const visit = (id: string) => {
    onStack.add(id)
    for (const e of out.get(id) || []) {
      if (onStack.has(e.target)) feedback.add(e.id)
      else if (!done.has(e.target)) visit(e.target)
    }
    onStack.delete(id)
    done.add(id)
  }
  if (startId) visit(startId)
  return feedback
}

/** yes first, else last, anything else between. */
function branchRank(e: Edge): number {
  const kind = branchKind(e)
  return kind === 'yes' ? 0 : kind === 'no' ? 2 : 1
}

/**
 * Lane offset of each edge from its source: 0 when the source goes on in one
 * direction only (loops not counted), else its branches spread around it.
 */
function laneOffsets(edges: Edge[]): Map<string, number> {
  const bySource = new Map<string, Edge[]>()
  for (const e of edges) {
    const list = bySource.get(e.source)
    if (list) list.push(e)
    else bySource.set(e.source, [e])
  }
  const offsets = new Map<string, number>()
  for (const list of bySource.values()) {
    const sorted = [...list].sort((a, b) => branchRank(a) - branchRank(b))
    const n = sorted.length
    sorted.forEach((e, i) => {
      // Two branches go one lane left and right; more fan out lane by lane.
      offsets.set(e.id, n === 1 ? 0 : n === 2 ? (i === 0 ? -1 : 1) : i - (n - 1) / 2)
    })
  }
  return offsets
}

export type FlowLayoutOptions = {
  /** x of the middle lane's centre line. */
  centerX: number
  /** y of the first row. */
  top: number
  /** Free space between two rows. */
  rowGap: number
  /** Free space between two lanes. */
  laneGap: number
}

function size(n: Node): { width: number; height: number } {
  return { width: Number(n.style?.width) || 0, height: Number(n.style?.height) || 0 }
}

/**
 * Positions (top-left) of the flow's nodes; each node is centred on its
 * lane and its row. Rows are the dependency layers without the loop edges,
 * so everything that runs into done is above it.
 */
export function layoutFlowTopDown(
  nodes: Node[],
  edges: Edge[],
  startId: string | undefined,
  opts: FlowLayoutOptions,
): Record<string, { x: number; y: number }> {
  const ids = nodes.map((n) => n.id)
  const idSet = new Set(ids)
  const feedback = feedbackEdgeIds(edges, startId)
  const forward = edges.filter(
    (e) => !feedback.has(e.id) && e.source !== e.target && idSet.has(e.source) && idSet.has(e.target),
  )
  const layers = dependencyLayers(ids, forward)
  // Start leads its row (other sources are steps nothing runs into).
  if (startId && layers[0]?.includes(startId)) {
    layers[0] = [startId, ...layers[0].filter((id) => id !== startId)]
  }

  const offset = laneOffsets(forward)
  const incoming = new Map<string, Edge[]>()
  for (const e of forward) {
    const list = incoming.get(e.target)
    if (list) list.push(e)
    else incoming.set(e.target, [e])
  }

  const lane = new Map<string, number>()
  const order = new Map(ids.map((id, i) => [id, i]))
  for (const layer of layers) {
    const wanted = layer.map((id, i) => {
      const ins = (incoming.get(id) || []).filter((e) => lane.has(e.source))
      const value = ins.length
        ? ins.reduce((sum, e) => sum + lane.get(e.source)! + (offset.get(e.id) || 0), 0) / ins.length
        : i - (layer.length - 1) / 2
      return { id, value }
    })
    wanted.sort((a, b) => a.value - b.value || order.get(a.id)! - order.get(b.id)!)
    // At least one lane apart; then centred on what the row wanted.
    const placed: number[] = []
    for (const w of wanted) {
      const prev = placed.length ? placed[placed.length - 1] : -Infinity
      placed.push(Math.max(w.value, prev + 1))
    }
    const shift =
      wanted.reduce((s, w) => s + w.value, 0) / wanted.length -
      placed.reduce((s, v) => s + v, 0) / placed.length
    wanted.forEach((w, i) => lane.set(w.id, placed[i] + shift))
  }

  const sizes = new Map(nodes.map((n) => [n.id, size(n)]))
  const laneWidth = Math.max(0, ...nodes.map((n) => sizes.get(n.id)!.width)) + opts.laneGap
  const positions: Record<string, { x: number; y: number }> = {}
  let y = opts.top
  for (const layer of layers) {
    const rowH = Math.max(0, ...layer.map((id) => sizes.get(id)!.height))
    for (const id of layer) {
      const { width, height } = sizes.get(id)!
      positions[id] = {
        x: opts.centerX + lane.get(id)! * laneWidth - width / 2,
        y: y + (rowH - height) / 2,
      }
    }
    y += rowH + opts.rowGap
  }
  return positions
}
