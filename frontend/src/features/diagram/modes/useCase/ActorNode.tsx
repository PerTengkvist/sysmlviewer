import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { ElementStyle } from '../../../../api'
import type { ViewMode } from '../../../../settings'

export type ActorNodeData = {
  label: string
  artifactId: string
  formatStyle?: ElementStyle | null
  viewMode?: ViewMode
}

function ActorNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as ActorNodeData
  return (
    <div className={`actor-node${selected ? ' selected' : ''}`}>
      <Handle type="source" position={Position.Right} id="out" className="actor-handle" />
      <Handle type="target" position={Position.Left} id="in" className="actor-handle" />
      <svg className="actor-figure" viewBox="0 0 48 72" aria-hidden>
        <circle cx="24" cy="10" r="8" />
        <line x1="24" y1="18" x2="24" y2="42" />
        <line x1="8" y1="28" x2="40" y2="28" />
        <line x1="24" y1="42" x2="10" y2="66" />
        <line x1="24" y1="42" x2="38" y2="66" />
      </svg>
      <div className="actor-name">{d.label}</div>
    </div>
  )
}

export const ActorNode = memo(ActorNodeInner)
