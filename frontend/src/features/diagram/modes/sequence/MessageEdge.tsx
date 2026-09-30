import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react'
import { memo } from 'react'
import { selectedEdgeStyle } from '../../selectedEdgeStyle'

export type MessageEdgeData = {
  label?: string
  sequenceIndex?: number
  artifactId?: string
  selectedColor?: string
  selectedFactor?: number
  onSelect?: (artifactId: string) => void
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
  selected,
}: EdgeProps) {
  const d = (data || {}) as MessageEdgeData
  const stroke = selectedEdgeStyle(style, !!selected, d.selectedColor, d.selectedFactor)
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
      <BaseEdge
        id={id}
        path={edgePath}
        style={stroke}
        markerEnd={markerEnd}
        interactionWidth={24}
      />
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="message-edge-label"
            style={{
              transform: `translate(-50%, -100%) translate(${labelX}px,${labelY - 4}px)`,
              pointerEvents: 'all',
              cursor: 'pointer',
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              d.onSelect?.(d.artifactId || id)
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
