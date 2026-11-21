import { NodeResizeControl, ResizeControlVariant, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { LaneKind } from './expandRealizationFlow'

export type LaneNodeData = {
  label: string
  laneId: string
  kind: LaneKind
  /** Narrowest width the resizer allows: the widest node of the lane plus a margin. */
  minWidth: number
  headerHeight: number
  /** The model element the lane stands for (an actor, node or part); none for system. */
  artifactId?: string
}

const KIND_LABEL: Record<LaneKind, string> = {
  actor: 'actor',
  node: 'function node',
  part: 'logical part',
  function: 'function',
  system: 'system',
  unallocated: 'no allocation',
}

function LaneNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as LaneNodeData
  return (
    <div
      className={`rlane rlane-${d.kind}${selected ? ' selected' : ''}`}
      data-lane-id={d.laneId}
      data-lane-kind={d.kind}
    >
      {/* Width only: the height follows from the rows. */}
      <NodeResizeControl
        position="right"
        resizeDirection="horizontal"
        variant={ResizeControlVariant.Handle}
        minWidth={d.minWidth}
        className="rlane-resize-handle"
        style={{ top: d.headerHeight / 2, display: selected ? undefined : 'none' }}
      />
      <div className="rlane-header" style={{ height: d.headerHeight }}>
        <span className="stereotype">«{KIND_LABEL[d.kind]}»</span>
        <strong title={d.label}>{d.label}</strong>
      </div>
    </div>
  )
}

export const LaneNode = memo(LaneNodeInner)

export type LaneGroupNodeData = { label: string; groupId: string }

function LaneGroupNodeInner({ data }: NodeProps) {
  const d = data as unknown as LaneGroupNodeData
  return (
    <div className="rlane-group" data-group-id={d.groupId}>
      <span className="rlane-group-label" title={d.label}>
        {d.label}
      </span>
    </div>
  )
}

export const LaneGroupNode = memo(LaneGroupNodeInner)
