import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import type { ElementStyle } from '../../../api'
import type { ViewMode } from '../../../settings'
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
        <Handle type="target" position={Position.Left} id="in" />
        <Handle type="target" position={Position.Top} id="top" />
        <Handle type="source" position={Position.Right} id="out" />
        <Handle type="source" position={Position.Bottom} id="bottom" />
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
        <div className="action-decision-diamond">
          <span className="action-decision-label">{d.label}</span>
        </div>
        <Handle
          type="target"
          position={Position.Top}
          id="in-top"
          className="action-decision-handle"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="in-left"
          className="action-decision-handle"
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="out-bottom"
          className="action-decision-handle"
        />
        <Handle
          type="source"
          position={Position.Left}
          id="out-left"
          className="action-decision-handle"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="out-right"
          className="action-decision-handle"
        />
        <Handle
          type="source"
          position={Position.Top}
          id="out-top"
          className="action-decision-handle"
        />
      </div>
    )
  }

  const style = nodeInlineStyle(d.formatStyle, d.viewMode)
  const bg = kindBackground('action', d.viewMode, d.formatStyle)
  return (
    <div
      className={`action-node${selected ? ' selected' : ''}`}
      style={{ ...style, backgroundColor: bg || style.backgroundColor }}
    >
      <span className="stereotype">«action»</span>
      <strong>{d.label}</strong>
      <Handle type="source" position={Position.Right} id="out" />
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Top} id="top" />
    </div>
  )
}

export const ActionNode = memo(ActionNodeInner)
