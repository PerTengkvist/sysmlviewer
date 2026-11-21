import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { ChainEdge, ChainRole, ViewPayload } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { elementTypeLabel } from '../../../details/elementRelations'
import { edgeStrokeStyle } from '../../elementStyle'
import type { ChainNodeData } from './ChainNode'

/** Fixed x per column: use case | function | function node | logical part. */
export const CHAIN_COLUMN_X: Record<ChainRole, number> = {
  useCase: 40,
  function: 340,
  node: 640,
  part: 940,
}
const COLUMNS: ChainRole[] = ['useCase', 'function', 'node', 'part']
const TOP = 40
const ROW_H = 84
const NODE_W = 200
const NODE_H = 56
const SWEEPS = 4

export type RealizationChainOpts = {
  view: ViewPayload
  viewMode: ViewMode
  /** Redraw: lay everything out again, whatever the view has saved. */
  ignoreSaved?: boolean
  selectedConnectionColor?: string
  selectedConnectionLinewidthFactor?: number
}

function neighbours(id: string, edges: ChainEdge[], inColumn: Set<string>): string[] {
  const out: string[] = []
  for (const e of edges) {
    if (e.source === id && inColumn.has(e.target)) out.push(e.target)
    else if (e.target === id && inColumn.has(e.source)) out.push(e.source)
  }
  return out
}

/** Reorder one column by the mean row of its neighbours in `reference`; no neighbour keeps the row. */
function sortByBarycenter(column: string[], reference: string[], edges: ChainEdge[]): string[] {
  const refRow = new Map(reference.map((id, i) => [id, i]))
  const refSet = new Set(reference)
  const keyed = column.map((id, i) => {
    const rows = neighbours(id, edges, refSet).map((n) => refRow.get(n)!)
    const bary = rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : i
    return { id, bary, i }
  })
  keyed.sort((a, b) => a.bary - b.bary || a.i - b.i)
  return keyed.map((k) => k.id)
}

/** Barycenter ordering: a few sweeps to the right, then to the left. */
export function orderColumns(columns: string[][], edges: ChainEdge[]): string[][] {
  const cols = columns.map((c) => [...c])
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    for (let c = 1; c < cols.length; c++) cols[c] = sortByBarycenter(cols[c], cols[c - 1], edges)
    for (let c = cols.length - 2; c >= 0; c--) cols[c] = sortByBarycenter(cols[c], cols[c + 1], edges)
  }
  return cols
}

/** Crossings between edges of two neighbouring columns; longer edges are not counted. */
export function countCrossings(columns: string[][], edges: ChainEdge[]): number {
  let total = 0
  for (let c = 0; c + 1 < columns.length; c++) {
    const left = new Map(columns[c].map((id, i) => [id, i]))
    const right = new Map(columns[c + 1].map((id, i) => [id, i]))
    const pairs: [number, number][] = []
    for (const e of edges) {
      const a = left.has(e.source) ? left.get(e.source) : left.get(e.target)
      const b = right.has(e.source) ? right.get(e.source) : right.get(e.target)
      const ends = (left.has(e.source) && right.has(e.target)) || (left.has(e.target) && right.has(e.source))
      if (ends && a !== undefined && b !== undefined) pairs.push([a, b])
    }
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) total++
      }
    }
  }
  return total
}

const sideOf = (role: ChainRole | undefined) => (role ? COLUMNS.indexOf(role) : -1)

export function buildRealizationChain(opts: RealizationChainOpts): { nodes: Node[]; edges: Edge[] } {
  const {
    view,
    viewMode,
    ignoreSaved = false,
    selectedConnectionColor = '#2563eb',
    selectedConnectionLinewidthFactor = 3,
  } = opts
  const { semantic, visualization, chainRoles, chainEdges, chainLabels } = view
  if (!chainRoles || !chainEdges) return { nodes: [], edges: [] }

  const ids = Object.keys(chainRoles).filter((id) => semantic[id])
  const present = new Set(ids)
  const edgesIn = chainEdges.filter((e) => present.has(e.source) && present.has(e.target))
  const columns = orderColumns(
    COLUMNS.map((role) => ids.filter((id) => chainRoles[id] === role)),
    edgesIn,
  )

  const nodes: Node[] = []
  columns.forEach((column, c) => {
    const role = COLUMNS[c]
    column.forEach((id, row) => {
      const viz = visualization.nodes[id]
      const saved = !ignoreSaved && typeof viz?.x === 'number' && typeof viz?.y === 'number'
      const savedSize = !ignoreSaved && Number(viz?.width) >= 20 && Number(viz?.height) >= 20
      const data: ChainNodeData = {
        label: chainLabels?.[id] ?? semantic[id].name,
        artifactId: id,
        role,
        typeLabel: elementTypeLabel(semantic[id]),
        formatStyle: viz?.style,
        viewMode,
      }
      nodes.push({
        id,
        type: 'chain',
        position: saved
          ? { x: viz.x, y: viz.y }
          : { x: CHAIN_COLUMN_X[role], y: TOP + row * ROW_H },
        data,
        style: {
          width: savedSize ? viz.width : NODE_W,
          height: savedSize ? viz.height : NODE_H,
        },
      })
    })
  })

  const stroke = edgeStrokeStyle(undefined, viewMode)
  const edges: Edge[] = edgesIn.map((e) => {
    const backwards = sideOf(chainRoles[e.source]) > sideOf(chainRoles[e.target])
    const refine = e.kind === 'refine'
    const label =
      e.kind === 'owns' ? undefined : refine ? `«refine» ${e.precision}` : '«allocate»'
    const width = e.kind === 'owns' || e.precision === 'explicit' ? 1 : 1.8
    return {
      id: `chain::${e.source}->${e.target}::${e.kind}`,
      source: e.source,
      target: e.target,
      sourceHandle: backwards ? 'l-out' : 'r-out',
      targetHandle: backwards ? 'r-in' : 'l-in',
      type: 'smoothstep',
      label,
      markerEnd:
        e.kind === 'owns'
          ? undefined
          : { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke.stroke },
      style: {
        stroke: stroke.stroke,
        strokeWidth: width,
        strokeDasharray: refine ? '6 4' : undefined,
      },
      labelStyle: { fill: stroke.color || undefined, fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: 'var(--canvas)', fillOpacity: 0.85 },
      labelBgPadding: [4, 2] as [number, number],
      data: {
        kind: e.kind,
        precision: e.precision,
        viaInclude: e.viaInclude,
        selectedColor: selectedConnectionColor,
        selectedFactor: selectedConnectionLinewidthFactor,
      },
    } as Edge
  })

  return { nodes, edges }
}
