import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { ViewPayload } from '../../../api'
import type { ViewMode } from '../../../settings'
import { edgeStrokeStyle } from '../../elementStyle'
import type { StateNodeData } from './StateNode'

const COL_W = 200
const ROW_H = 110
const LEFT = 80
const TOP = 60

export function buildStateGraph(
  view: ViewPayload,
  viewMode: ViewMode,
): { nodes: Node[]; edges: Edge[] } {
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId

  const states = Object.values(semantic)
    .filter((e) => e.kind === 'state' && e.parentId === rootId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const transitions = Object.values(semantic)
    .filter((e) => e.kind === 'transition' && e.parentId === rootId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const nodes: Node[] = states.map((st, index) => {
    const viz = visualization.nodes[st.id]
    const lower = st.name.toLowerCase()
    const isInitial = lower === 'initial' || st.typeRef === 'initial'
    const isFinal = lower === 'final' || lower === 'done' || st.typeRef === 'final'
    const cols = Math.max(1, Math.min(3, states.length))
    const col = index % cols
    const row = Math.floor(index / cols)
    const data: StateNodeData = {
      label: st.name,
      artifactId: st.id,
      isInitial,
      isFinal,
      formatStyle: viz?.style,
      viewMode,
    }
    return {
      id: st.id,
      type: 'state',
      position: {
        x: viz?.x ?? LEFT + col * COL_W,
        y: viz?.y ?? TOP + row * ROW_H,
      },
      style: {
        width: isInitial || isFinal ? 28 : (viz?.width ?? 140),
        height: isInitial || isFinal ? 28 : (viz?.height ?? 72),
      },
      data,
    }
  })

  const idSet = new Set(nodes.map((n) => n.id))
  const edges: Edge[] = transitions
    .map((tr) => {
      const src = tr.sourceId || ''
      const tgt = tr.targetId || ''
      if (!idSet.has(src) || !idSet.has(tgt)) return null
      const stroke = edgeStrokeStyle(visualization.edges[tr.id]?.style, viewMode)
      return {
        id: tr.id,
        source: src,
        target: tgt,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'smoothstep',
        label: tr.name.startsWith('t') && /^t\d+$/.test(tr.name) ? '' : tr.name,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { stroke: stroke.stroke, strokeWidth: stroke.strokeWidth },
      } as Edge
    })
    .filter((e): e is Edge => e !== null)

  return { nodes, edges }
}
