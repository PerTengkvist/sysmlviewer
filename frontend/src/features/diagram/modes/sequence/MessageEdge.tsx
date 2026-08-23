import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import { memo } from 'react'

export type MessageEdgeData = {
  label?: string
  sequenceIndex?: number
}

/**
 * Straight message between lifeline centers. sourceX/targetX already sit on the
 * vertical axis when handles are centered on the lifeline node.
 */
function MessageEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  data,
  label,
}: EdgeProps) {
  const d = (data || {}) as MessageEdgeData
  // Keep a tiny horizontal gap so arrowheads don't sit on the axis stroke
  const goingRight = targetX >= sourceX
  const inset = 2
  const x0 = goingRight ? sourceX + inset : sourceX - inset
  const x1 = goingRight ? targetX - inset : targetX + inset
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: x0,
    sourceY,
    targetX: x1,
    targetY,
  })
  const text = label || d.label || ''
  const idx = d.sequenceIndex
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="message-edge-label"
            style={{
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 4}px)`,
            }}
          >
            {typeof idx === 'number' ? `${idx + 1}. ` : ''}
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  )
}

export const MessageEdge = memo(MessageEdgeInner)
