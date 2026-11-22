import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { RealizationLaneMode, UseCaseRealizationLayout, ViewPayload } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { edgeStrokeStyle } from '../../elementStyle'
import { orientEdgeHandles } from '../../layout/dependencyLayout'
import { layoutFlowTopDown } from '../../layout/flowLayout'
import type { ActionNodeData } from '../actionFlow/ActionNode'
import { fixedActionNodeSize } from '../actionFlow/actionNodeSize'
import { orderAfterDrop, resolveLifelineOrder } from '../sequence/sequenceLayout'
import { expandRealizationFlow, type RealizationLane, type RealizationFlowNode } from './expandRealizationFlow'
import type { LaneNodeData } from './LaneNode'

/**
 * The swimlane graph of a useCaseRealization view. The nodes are placed here, never by hand:
 * y comes from the rank of a step in the flow, x from its lane. Only the order of the lanes
 * (per lane mode), their widths and the lane mode are saved with the view.
 */

export const LANE_LEFT = 24
export const LANE_GAP = 8
/** Height of the frame row over the lanes of a function. */
export const GROUP_HEADER_H = 26
export const LANE_HEADER_H = 48
/** Space between the lane header and the first row. */
const FIRST_ROW_GAP = 28
const ROW_GAP = 36
const LANE_BOTTOM_PAD = 36
/** A lane is at least this much wider than its widest node, and by default twice as much. */
const MIN_LANE_PAD = 16
const DEFAULT_LANE_PAD = 40
const MIN_LANE_WIDTH = 150
const MIN_LANE_FLOOR = 100
const CHAR_PX = 7.2
const STEP_H = 56
const CALL_H = 44

export type UseCaseRealizationGraphOpts = {
  view: ViewPayload
  viewMode: ViewMode
  /** Overrides `view.useCaseRealizationLayout`. */
  layout?: UseCaseRealizationLayout | null
  selectedConnectionColor?: string
  selectedConnectionLinewidthFactor?: number
}

export type UseCaseRealizationGraph = {
  nodes: Node[]
  edges: Edge[]
  mode: RealizationLaneMode
  /** Lane ids, left to right. */
  order: string[]
}

/** Left x of each lane when packed in `order` with a small gap. */
export function packLanes(
  order: string[],
  widths: Record<string, number>,
  left = LANE_LEFT,
  gap = LANE_GAP,
): Record<string, number> {
  const xs: Record<string, number> = {}
  let x = left
  for (const id of order) {
    xs[id] = x
    x += (widths[id] ?? 0) + gap
  }
  return xs
}

/**
 * The layout after lane `id` was dropped with its centre at `droppedCentre`, or null when that
 * leaves the order as it was (nothing to save).
 */
export function layoutAfterDrop(
  layout: UseCaseRealizationLayout | null | undefined,
  mode: RealizationLaneMode,
  current: string[],
  id: string,
  droppedCentre: number,
  centres: Record<string, number>,
): UseCaseRealizationLayout | null {
  const order = orderAfterDrop(current, id, droppedCentre, centres)
  if (order.length === current.length && order.every((o, i) => o === current[i])) return null
  return { ...(layout ?? {}), order: { ...(layout?.order ?? {}), [mode]: order } }
}

/** The layout after lane `id` was resized to `width`. */
export function layoutAfterResize(
  layout: UseCaseRealizationLayout | null | undefined,
  id: string,
  width: number,
  minWidth: number,
): UseCaseRealizationLayout {
  return {
    ...(layout ?? {}),
    widths: { ...(layout?.widths ?? {}), [id]: Math.max(minWidth, Math.round(width)) },
  }
}

function nodeSize(n: RealizationFlowNode): { width: number; height: number } {
  const fixed = fixedActionNodeSize({
    isStart: n.kind === 'start',
    isDone: n.kind === 'done',
    isDecision: n.kind === 'decision',
  })
  if (fixed) return fixed
  const text = Math.ceil((n.label.length + (n.badge ? 4 : 0) + (n.unrealized ? 2 : 0)) * CHAR_PX) + 36
  return { width: Math.min(240, Math.max(130, text)), height: n.kind === 'call' ? CALL_H : STEP_H }
}

/** Rows: the layers of the flow, with two nodes of one lane never in the same row. */
function rowPositions(
  nodes: Node[],
  edges: Edge[],
  lanes: Map<string, string>,
  startId: string | undefined,
  top: number,
): Record<string, { x: number; y: number }> {
  const extra: Edge[] = []
  let positions = layoutFlowTopDown(nodes, edges, startId, { centerX: 0, top, rowGap: ROW_GAP, laneGap: 0 })
  for (let guard = 0; guard < nodes.length; guard++) {
    const clash = findClash(nodes, positions, lanes)
    if (!clash) break
    // The later node follows the earlier one: one row further down.
    extra.push({ id: `order:${guard}`, source: clash[0], target: clash[1] })
    positions = layoutFlowTopDown(nodes, [...edges, ...extra], startId, {
      centerX: 0,
      top,
      rowGap: ROW_GAP,
      laneGap: 0,
    })
  }
  return positions
}

function findClash(
  nodes: Node[],
  positions: Record<string, { x: number; y: number }>,
  lanes: Map<string, string>,
): [string, string] | null {
  const height = (n: Node) => Number(n.style?.height)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]
      const b = nodes[j]
      if (lanes.get(a.id) !== lanes.get(b.id)) continue
      const pa = positions[a.id].y
      const pb = positions[b.id].y
      if (pa < pb + height(b) && pb < pa + height(a)) return pa <= pb ? [a.id, b.id] : [b.id, a.id]
    }
  }
  return null
}

export function buildUseCaseRealizationGraph(opts: UseCaseRealizationGraphOpts): UseCaseRealizationGraph {
  const { view, viewMode } = opts
  const layout = opts.layout !== undefined ? opts.layout : (view.useCaseRealizationLayout ?? null)
  const mode: RealizationLaneMode = layout?.lanes ?? 'whitebox'
  const flow = expandRealizationFlow(view, mode)
  const color = opts.selectedConnectionColor ?? '#2563eb'
  const factor = opts.selectedConnectionLinewidthFactor ?? 3

  const defaultOrder = flow.lanes.map((l) => l.id)
  const order = resolveLifelineOrder(defaultOrder, layout?.order?.[mode])
  const laneOf = new Map(flow.lanes.map((l) => [l.id, l]))

  // Action nodes, sized, with their lane.
  const sizes = new Map(flow.nodes.map((n) => [n.id, nodeSize(n)]))
  const flowNodes: Node[] = flow.nodes.map((n) => {
    const data: ActionNodeData = {
      label: n.label,
      artifactId: n.artifactId,
      isStart: n.kind === 'start',
      isDone: n.kind === 'done',
      isDecision: n.kind === 'decision',
      isCall: n.kind === 'call',
      flowDir: 'TD',
      formatStyle: view.visualization.nodes[n.artifactId]?.style,
      viewMode,
      ...(n.badge ? { badge: n.badge } : {}),
      ...(n.unrealized ? { unrealized: true } : {}),
      ...(n.coarse ? { coarse: true } : {}),
      ...(n.calledUseCaseId ? { calledUseCaseId: n.calledUseCaseId, calledViewId: n.calledViewId ?? null } : {}),
      laneId: n.lane,
    }
    return {
      id: n.id,
      type: 'action',
      position: { x: 0, y: 0 },
      style: { ...sizes.get(n.id)! },
      draggable: false,
      connectable: false,
      // A node that cannot be dragged is not `nopan` by itself, and a double click on it zooms.
      className: 'nopan',
      zIndex: 2,
      data: data as unknown as Record<string, unknown>,
    }
  })

  const rawEdges: Edge[] = flow.edges.map((e) => {
    const stroke = edgeStrokeStyle(view.visualization.edges[e.id]?.style, viewMode)
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.label === 'YES' ? 'yes' : e.label === 'NO' ? 'no' : 'out',
      targetHandle: 'in',
      type: 'smoothstep',
      label: e.label || undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke.stroke },
      style: { stroke: stroke.stroke, strokeWidth: stroke.strokeWidth },
      labelStyle: { fill: stroke.color || undefined, fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: 'var(--canvas)', fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
      zIndex: 3,
      data: { selectedColor: color, selectedFactor: factor },
    } as Edge
  })
  const startId = flow.nodes.find((n) => n.kind === 'start')?.id
  const edges = orientEdgeHandles(rawEdges, 'TD', flowNodes)

  // Lane geometry.
  const hasGroups = flow.lanes.some((l) => l.group)
  const laneY = hasGroups ? GROUP_HEADER_H : 0
  const firstRow = laneY + LANE_HEADER_H + FIRST_ROW_GAP
  const widest = (laneId: string) =>
    Math.max(0, ...flow.nodes.filter((n) => n.lane === laneId).map((n) => sizes.get(n.id)!.width))
  const minWidths: Record<string, number> = {}
  const widths: Record<string, number> = {}
  for (const l of flow.lanes) {
    minWidths[l.id] = Math.max(MIN_LANE_FLOOR, widest(l.id) + MIN_LANE_PAD)
    const header = Math.ceil(l.label.length * CHAR_PX) + 32
    const natural = Math.max(MIN_LANE_WIDTH, widest(l.id) + DEFAULT_LANE_PAD, header)
    widths[l.id] = Math.max(minWidths[l.id], layout?.widths?.[l.id] ?? natural)
  }
  const xs = packLanes(order, widths)

  const rows = rowPositions(
    flowNodes,
    edges,
    new Map(flow.nodes.map((n) => [n.id, n.lane])),
    startId,
    firstRow,
  )
  let bottom = firstRow
  for (const n of flowNodes) {
    const lane = flow.nodes.find((f) => f.id === n.id)!.lane
    const { width, height } = sizes.get(n.id)!
    n.position = { x: xs[lane] + widths[lane] / 2 - width / 2, y: rows[n.id].y }
    bottom = Math.max(bottom, rows[n.id].y + height)
  }
  const laneH = bottom + LANE_BOTTOM_PAD - laneY

  const laneNodes: Node[] = order.map((id) => {
    const l = laneOf.get(id) as RealizationLane
    const data: LaneNodeData = {
      label: l.label,
      laneId: id,
      kind: l.kind,
      minWidth: minWidths[id],
      headerHeight: LANE_HEADER_H,
      ...(l.reach ? { reach: l.reach } : {}),
      artifactId: l.kind === 'system' || l.kind === 'unallocated' ? undefined : id,
    }
    return {
      id: `lane:${id}`,
      type: 'lane',
      position: { x: xs[id], y: laneY },
      style: { width: widths[id], height: laneH },
      draggable: true,
      // Only the header starts a drag: a click in the body of the lane selects, never moves.
      dragHandle: '.rlane-header',
      connectable: false,
      zIndex: 0,
      data: data as unknown as Record<string, unknown>,
    }
  })

  // One frame over each run of neighbouring lanes of the same function.
  const frames: Node[] = []
  let run: { group: string; label: string; ids: string[] } | null = null
  const flush = () => {
    if (!run) return
    const first = run.ids[0]
    const last = run.ids[run.ids.length - 1]
    frames.push({
      id: `group:${run.group}:${frames.length}`,
      type: 'laneGroup',
      position: { x: xs[first], y: 0 },
      style: { width: xs[last] + widths[last] - xs[first], height: laneY + laneH },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -1,
      data: { label: run.label, groupId: run.group } as unknown as Record<string, unknown>,
    })
    run = null
  }
  for (const id of order) {
    const l = laneOf.get(id)!
    if (!l.group) {
      flush()
      continue
    }
    if (run && run.group !== l.group) flush()
    if (!run) run = { group: l.group, label: l.groupLabel ?? l.group, ids: [] }
    run.ids.push(id)
  }
  flush()

  return { nodes: [...frames, ...laneNodes, ...flowNodes], edges, mode, order }
}
