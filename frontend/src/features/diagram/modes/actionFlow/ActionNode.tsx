import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import type { ElementStyle } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { kindBackground, nodeInlineStyle } from '../../elementStyle'
import type { RedrawDirection } from '../../layout/dependencyLayout'

export type ActionNodeData = {
  label: string
  artifactId: string
  isStart?: boolean
  isDone?: boolean
  isDecision?: boolean
  flowDir?: RedrawDirection
  formatStyle?: ElementStyle | null
  viewMode: ViewMode
  /** Names of the parts that perform this action (`perform flow.step;`). */
  performedBy?: string[]
  /** useCaseRealization: `+n`, the step also belongs to n more lanes. */
  badge?: string
  /** useCaseRealization: a system step that nothing realizes. */
  unrealized?: boolean
  /** useCaseRealization: a system step that a flow realizes as a whole. */
  coarse?: boolean
  /** useCaseRealization: `▸ Start`, a step that calls an included use case. */
  isCall?: boolean
  calledUseCaseId?: string
  /** useCaseRealization: the lane the node sits in. */
  laneId?: string
}

const centerHandle: CSSProperties = {
  top: '50%',
  left: '50%',
  right: 'auto',
  transform: 'translate(-50%, -50%)',
}

function ActionNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as ActionNodeData
  const flowDir: RedrawDirection = d.flowDir || 'LR'

  if (d.isStart) {
    // Always mount both source handles: Redraw TD/LR switches edge
    // sourceHandle between "bottom" and "out". A single swapping Handle
    // id leaves React Flow unable to attach the edge (missing handle).
    return (
      <div
        className={`action-pseudo start${selected ? ' selected' : ''}`}
        title={d.label}
        data-flow={flowDir}
      >
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className="action-center-handle"
          style={centerHandle}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="bottom"
          className="action-center-handle"
          style={centerHandle}
        />
      </div>
    )
  }

  if (d.isDone) {
    return (
      <div
        className={`action-pseudo done${selected ? ' selected' : ''}`}
        title={d.label}
      >
        <Handle type="target" position={Position.Left} id="in" className="flow-handle" />
        <Handle type="target" position={Position.Top} id="top" className="flow-handle" />
        <Handle type="source" position={Position.Right} id="out" className="flow-handle" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="flow-handle" />
        {/* Last, so edges without a handle id keep their old default. */}
        <Handle type="target" position={Position.Right} id="in-right" className="flow-handle" />
      </div>
    )
  }

  if (d.isDecision) {
    // TD: in at top; out at bottom / left / right
    // LR: in at left; out at top / bottom / right
    return (
      <div
        className={`action-decision${selected ? ' selected' : ''}`}
        data-flow={flowDir}
      >
        {/* Drawn across the whole node box, so its tips are the middle of
            each side, where React Flow puts the handles. */}
        <svg
          className="action-decision-diamond"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points="50,0 100,50 50,100 0,50" vectorEffect="non-scaling-stroke" />
        </svg>
        <span className="action-decision-label">{d.label}</span>
        <Handle
          type="target"
          position={Position.Top}
          id="in-top"
          className="action-decision-handle flow-handle"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="in-left"
          className="action-decision-handle flow-handle"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="out-bottom"
          className="action-decision-handle flow-handle"
        />
        <Handle
          type="source"
          position={Position.Left}
          id="out-left"
          className="action-decision-handle flow-handle"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="out-right"
          className="action-decision-handle flow-handle"
        />
        <Handle
          type="source"
          position={Position.Top}
          id="out-top"
          className="action-decision-handle flow-handle"
        />
        {/* Loop back into the decision; last so defaults stay unchanged. */}
        <Handle
          type="target"
          position={Position.Right}
          id="in-right"
          className="action-decision-handle flow-handle"
        />
      </div>
    )
  }

  const style = nodeInlineStyle(d.formatStyle, d.viewMode)
  const bg = kindBackground('action', d.viewMode, d.formatStyle)
  const marks = [
    d.unrealized ? ' unrealized' : '',
    d.coarse ? ' coarse' : '',
    d.isCall ? ' call' : '',
  ].join('')
  return (
    <div
      className={`action-node${marks}${selected ? ' selected' : ''}`}
      style={{ ...style, backgroundColor: bg || style.backgroundColor }}
      data-lane-id={d.laneId}
      title={d.unrealized ? 'No function step realizes this step' : d.coarse ? 'Realized by a whole flow' : undefined}
    >
      {d.isCall ? null : <span className="stereotype">«action»</span>}
      <strong>
        {d.unrealized ? <span className="action-warning">⚠ </span> : null}
        {d.label}
      </strong>
      {d.badge ? <span className="action-badge">{d.badge}</span> : null}
      {d.performedBy?.length ? (
        <span className="action-performer" title="Performed by">
          ⟨{d.performedBy.join(', ')}⟩
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} id="out" className="flow-handle" />
      <Handle type="target" position={Position.Left} id="in" className="flow-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="flow-handle" />
      <Handle type="target" position={Position.Top} id="top" className="flow-handle" />
      {/* Loop back from a later step; last so defaults stay unchanged. */}
      <Handle type="target" position={Position.Right} id="in-right" className="flow-handle" />
    </div>
  )
}

export const ActionNode = memo(ActionNodeInner)
