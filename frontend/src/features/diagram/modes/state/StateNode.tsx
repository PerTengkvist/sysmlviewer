import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { ElementStyle } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { kindBackground, nodeInlineStyle } from '../../elementStyle'

export type StateNodeData = {
  label: string
  artifactId: string
  isInitial?: boolean
  isFinal?: boolean
  formatStyle?: ElementStyle | null
  viewMode: ViewMode
}

function StateNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as StateNodeData
  if (d.isInitial) {
    return (
      <div className={`state-pseudo initial${selected ? ' selected' : ''}`}>
        <Handle type="source" position={Position.Right} id="out" className="flow-handle" />
        <Handle type="target" position={Position.Left} id="in" className="flow-handle" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="flow-handle" />
        <Handle type="target" position={Position.Top} id="top" className="flow-handle" />
      </div>
    )
  }
  if (d.isFinal) {
    return (
      <div className={`state-pseudo final${selected ? ' selected' : ''}`}>
        <Handle type="source" position={Position.Right} id="out" className="flow-handle" />
        <Handle type="target" position={Position.Left} id="in" className="flow-handle" />
        <Handle type="source" position={Position.Bottom} id="bottom" className="flow-handle" />
        <Handle type="target" position={Position.Top} id="top" className="flow-handle" />
      </div>
    )
  }
  const style = nodeInlineStyle(d.formatStyle, d.viewMode)
  const bg = kindBackground('state', d.viewMode, d.formatStyle)
  return (
    <div
      className={`state-node${selected ? ' selected' : ''}`}
      style={{ ...style, backgroundColor: bg || style.backgroundColor }}
    >
      <span className="stereotype">«state»</span>
      <strong>{d.label}</strong>
      <Handle type="source" position={Position.Right} id="out" className="flow-handle" />
      <Handle type="target" position={Position.Left} id="in" className="flow-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="flow-handle" />
      <Handle type="target" position={Position.Top} id="top" className="flow-handle" />
    </div>
  )
}

export const StateNode = memo(StateNodeInner)
