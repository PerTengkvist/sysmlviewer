import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { ViewPayload } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { edgeStrokeStyle } from '../../elementStyle'
import { strokeDasharray } from '../../relationshipStyle'
import type { LifelineNodeData } from './LifelineNode'
import { eventName, isReplyMessage, sequenceParticipants } from './sequenceParticipants'
import {
  LIFELINE_TOP,
  minLifelineWidth,
  sequenceGeometry,
} from './sequenceLayout'

const MSG_GAP = 56

export type HighlightOpts = {
  selectedConnectionColor?: string
  selectedConnectionLinewidthFactor?: number
}

export function buildSequenceGraph(
  view: ViewPayload,
  viewMode: ViewMode,
  highlight: HighlightOpts = {},
): { nodes: Node[]; edges: Edge[] } {
  const selectedConnectionColor = highlight.selectedConnectionColor ?? '#2563eb'
  const selectedConnectionLinewidthFactor =
    highlight.selectedConnectionLinewidthFactor ?? 3
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId
  // Lifeline elements under an interaction, parts that messages use under an
  // occurrence; both go through the same layout below.
  const { lifelines, messages } = sequenceParticipants(semantic, rootId)

  const lineHeight = Math.max(180, 80 + messages.length * MSG_GAP)
  // Stored x/y/width are not read: they are global defaults that cannot be
  // told apart from user choices. The user's choices live in sequenceLayout.
  const geometry = sequenceGeometry(
    lifelines.map((ll) => ({ id: ll.id, name: ll.name })),
    messages.map((m) => ({
      sourceId: m.sourceId || '',
      targetId: m.targetId || '',
      label: m.name,
    })),
    view.sequenceLayout,
  )
  const { headerHeight } = geometry
  const totalH = headerHeight + lineHeight

  const byId = new Map(lifelines.map((ll) => [ll.id, ll]))
  const nodes: Node[] = geometry.order.map((id) => {
    const ll = byId.get(id)!
    const viz = visualization.nodes[ll.id]
    const data: LifelineNodeData = {
      label: ll.name,
      artifactId: ll.id,
      formatStyle: viz?.style,
      viewMode,
      lineHeight,
      headerHeight,
      messageCount: messages.length,
      minWidth: minLifelineWidth(ll.name),
    }
    return {
      id: ll.id,
      type: 'lifeline',
      position: { x: geometry.xs[ll.id], y: LIFELINE_TOP },
      style: { width: geometry.widths[ll.id], height: totalH },
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
      // `#Reply message` acknowledgements render dashed unless a format style says otherwise.
      const isReply = isReplyMessage(msg)
      const dash = stroke.strokeDasharray ?? (isReply ? strokeDasharray('dashed') : undefined)
      return {
        id: msg.id,
        source: src,
        target: tgt,
        sourceHandle: `msg-${index}-out`,
        targetHandle: `msg-${index}-in`,
        type: 'message',
        label: msg.name,
        data: {
          label: msg.name,
          sequenceIndex: index,
          isReply,
          sourceEvent: eventName(semantic, msg.sourceEventId),
          targetEvent: eventName(semantic, msg.targetEventId),
          selectedColor: selectedConnectionColor,
          selectedFactor: selectedConnectionLinewidthFactor,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: stroke.stroke,
        },
        style: {
          stroke: stroke.stroke,
          strokeWidth: stroke.strokeWidth,
          ...(dash ? { strokeDasharray: dash } : {}),
        },
      } as Edge
    })
    .filter((e): e is Edge => e !== null)

  return { nodes, edges }
}
