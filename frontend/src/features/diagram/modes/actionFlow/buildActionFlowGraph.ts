import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { SemanticElement, ViewPayload } from '../../../api'
import type { ViewMode } from '../../../settings'
import { edgeStrokeStyle } from '../../elementStyle'
import type { RedrawDirection } from '../../layout/dependencyLayout'
import { orientEdgeHandles } from '../../layout/dependencyLayout'
import type { ActionNodeData } from './ActionNode'

const COL_W = 200
const ROW_H = 100
const LEFT = 40
const TOP = 140

function prettyLabel(name: string, isDecision: boolean): string {
  const spaced = name.includes(' ')
    ? name
    : name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase())
  if (isDecision && !spaced.trim().endsWith('?')) return `${spaced}?`
  return spaced
}

function isStartEl(el: SemanticElement): boolean {
  const lower = el.name.toLowerCase()
  return lower === 'start' || el.typeRef === 'start'
}

function isDoneEl(el: SemanticElement): boolean {
  const lower = el.name.toLowerCase()
  return (
    lower === 'done' ||
    lower === 'end' ||
    lower === 'stop' ||
    el.typeRef === 'done'
  )
}

function isDecisionEl(
  el: SemanticElement,
  outgoingCount = 0,
): boolean {
  const t = (el.typeRef || '').toLowerCase()
  if (t === 'decision' || t === 'condition' || t === 'decide') return true
  // Fallback: branching node (2+ outgoing successions) renders as decision
  return outgoingCount >= 2
}

function edgeLabel(succ: SemanticElement): string {
  const n = succ.name.toLowerCase()
  if (n === 'yes') return 'YES'
  if (n === 'no') return 'NO'
  if (/^s\d+$/i.test(succ.name)) return ''
  return succ.name
}

export function buildActionFlowGraph(
  view: ViewPayload,
  viewMode: ViewMode,
  flowDir: RedrawDirection = 'LR',
): { nodes: Node[]; edges: Edge[] } {
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId

  const actions = Object.values(semantic).filter(
    (e) => e.kind === 'action' && e.parentId === rootId,
  )

  const successions = Object.values(semantic)
    .filter((e) => e.kind === 'succession' && e.parentId === rootId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const outs = new Map<string, SemanticElement[]>()
  for (const s of successions) {
    if (!s.sourceId) continue
    const list = outs.get(s.sourceId) || []
    list.push(s)
    outs.set(s.sourceId, list)
  }

  // Layered positions: walk from start; YES branch row -1, NO branch row +1
  const pos = new Map<string, { col: number; row: number }>()
  const start =
    actions.find(isStartEl) ||
    actions.find((a) => !(successions.some((s) => s.targetId === a.id)))

  if (start) {
    const queue: { id: string; col: number; row: number }[] = [
      { id: start.id, col: 0, row: 0 },
    ]
    const seen = new Set<string>()
    while (queue.length) {
      const cur = queue.shift()!
      if (seen.has(cur.id)) {
        // Prefer earlier column when converging
        const prev = pos.get(cur.id)
        if (prev && cur.col > prev.col) pos.set(cur.id, { col: cur.col, row: prev.row })
        continue
      }
      seen.add(cur.id)
      pos.set(cur.id, { col: cur.col, row: cur.row })
      const nexts = outs.get(cur.id) || []
      if (nexts.length <= 1) {
        for (const s of nexts) {
          if (s.targetId) queue.push({ id: s.targetId, col: cur.col + 1, row: cur.row })
        }
      } else {
        const ordered = [...nexts].sort((a, b) => {
          const ra = a.name.toLowerCase() === 'yes' ? 0 : a.name.toLowerCase() === 'no' ? 2 : 1
          const rb = b.name.toLowerCase() === 'yes' ? 0 : b.name.toLowerCase() === 'no' ? 2 : 1
          return ra - rb
        })
        ordered.forEach((s, i) => {
          if (!s.targetId) return
          const row =
            s.name.toLowerCase() === 'yes'
              ? cur.row - 1
              : s.name.toLowerCase() === 'no'
                ? cur.row + 1
                : cur.row + (i === 0 ? -1 : 1)
          queue.push({ id: s.targetId, col: cur.col + 1, row })
        })
      }
    }
  }

  for (const a of actions) {
    if (!pos.has(a.id)) {
      pos.set(a.id, { col: pos.size, row: 0 })
    }
  }

  const nodes: Node[] = actions.map((act) => {
    const viz = visualization.nodes[act.id]
    const startNode = isStartEl(act)
    const doneNode = isDoneEl(act)
    const outCount = (outs.get(act.id) || []).length
    const decisionNode = !startNode && !doneNode && isDecisionEl(act, outCount)
    const p = pos.get(act.id) || { col: 0, row: 0 }
    const data: ActionNodeData = {
      label: prettyLabel(act.name, decisionNode),
      artifactId: act.id,
      isStart: startNode,
      isDone: doneNode,
      isDecision: decisionNode,
      flowDir,
      formatStyle: viz?.style,
      viewMode,
    }
    const defaultW = startNode || doneNode ? 28 : decisionNode ? 120 : 150
    const defaultH = startNode || doneNode ? 28 : decisionNode ? 80 : 56
    // Prefer mode-appropriate size for pseudo/decision nodes even if old viz exists
    const useDefaultSize = startNode || doneNode || decisionNode
    return {
      id: act.id,
      type: 'action',
      position: {
        x: viz?.x ?? LEFT + p.col * COL_W,
        y: viz?.y ?? TOP + p.row * ROW_H,
      },
      style: {
        width: useDefaultSize
          ? defaultW
          : viz?.width && viz.width >= 20
            ? viz.width
            : defaultW,
        height: useDefaultSize
          ? defaultH
          : viz?.height && viz.height >= 20
            ? viz.height
            : defaultH,
      },
      data,
    }
  })

  const idSet = new Set(nodes.map((n) => n.id))
  const rawEdges: Edge[] = successions
    .map((s) => {
      const src = s.sourceId || ''
      const tgt = s.targetId || ''
      if (!idSet.has(src) || !idSet.has(tgt)) return null
      const stroke = edgeStrokeStyle(visualization.edges[s.id]?.style, viewMode)
      const label = edgeLabel(s)
      return {
        id: s.id,
        source: src,
        target: tgt,
        sourceHandle: label === 'YES' ? 'yes' : label === 'NO' ? 'no' : 'out',
        targetHandle: 'in',
        type: 'smoothstep',
        label: label || undefined,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 14,
          height: 14,
          color: stroke.stroke,
        },
        style: { stroke: stroke.stroke, strokeWidth: stroke.strokeWidth },
        labelStyle: { fill: stroke.color || undefined, fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: 'var(--canvas)', fillOpacity: 0.85 },
        labelBgPadding: [4, 2] as [number, number],
      } as Edge
    })
    .filter((e): e is Edge => e !== null)

  return {
    nodes,
    edges: orientEdgeHandles(rawEdges, flowDir, nodes),
  }
}
