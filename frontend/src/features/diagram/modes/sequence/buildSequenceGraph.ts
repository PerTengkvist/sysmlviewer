import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { ViewPayload } from '../../../api'
import type { ViewMode } from '../../../settings'
import { edgeStrokeStyle } from '../../elementStyle'
import type { LifelineNodeData } from './LifelineNode'

const COL_GAP = 160
const HEADER_H = 48
const MSG_GAP = 56
const TOP = 40
const LEFT = 60
/** Stored x beyond this is treated as merge-index garbage and re-laid out. */
const MAX_TRUSTED_X = 720

export function buildSequenceGraph(
  view: ViewPayload,
  viewMode: ViewMode,
): { nodes: Node[]; edges: Edge[] } {
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId
  const lifelines = Object.values(semantic)
    .filter((e) => e.kind === 'lifeline' && e.parentId === rootId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const messages = Object.values(semantic)
    .filter((e) => e.kind === 'message' && e.parentId === rootId)
    .sort((a, b) => a.id.localeCompare(b.id))

  const lineHeight = Math.max(180, 80 + messages.length * MSG_GAP)
  const totalH = HEADER_H + lineHeight

  // If any lifeline was placed with a global merge index (far right), re-layout all.
  const trustStored = lifelines.every((ll) => {
    const viz = visualization.nodes[ll.id]
    return !viz || (Number.isFinite(viz.x) && viz.x >= 0 && viz.x <= MAX_TRUSTED_X)
  })

  const nodes: Node[] = lifelines.map((ll, index) => {
    const viz = visualization.nodes[ll.id]
    const defaultX = LEFT + index * COL_GAP
    const defaultY = TOP
    const data: LifelineNodeData = {
      label: ll.name,
      artifactId: ll.id,
      formatStyle: viz?.style,
      viewMode,
      lineHeight,
      messageCount: messages.length,
    }
    return {
      id: ll.id,
      type: 'lifeline',
      position: {
        x: trustStored && viz ? viz.x : defaultX,
        y: trustStored && viz && Number.isFinite(viz.y) ? viz.y : defaultY,
      },
      style: {
        width: viz?.width && viz.width >= 80 ? viz.width : 120,
        height: totalH,
      },
      data,
    }
  })

  const llIndex = new Map(lifelines.map((ll, i) => [ll.id, i]))

  const edges: Edge[] = messages
    .map((msg, index) => {
      const src = msg.sourceId || ''
      const tgt = msg.targetId || ''
      if (!llIndex.has(src) || !llIndex.has(tgt)) return null
      const stroke = edgeStrokeStyle(visualization.edges[msg.id]?.style, viewMode)
      return {
        id: msg.id,
        source: src,
        target: tgt,
        sourceHandle: `msg-${index}-out`,
        targetHandle: `msg-${index}-in`,
        type: 'message',
        label: msg.name,
        data: { label: msg.name, sequenceIndex: index },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: stroke.stroke,
        },
        style: {
          stroke: stroke.stroke,
          strokeWidth: stroke.strokeWidth,
        },
      } as Edge
    })
    .filter((e): e is Edge => e !== null)

  return { nodes, edges }
}
