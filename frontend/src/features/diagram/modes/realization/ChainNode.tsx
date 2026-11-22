import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { ChainRole, ElementStyle } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { nodeInlineStyle } from '../../elementStyle'

export type ChainNodeData = {
  label: string
  artifactId: string
  role: ChainRole
  /** `use case def`, `part`, ... */
  typeLabel: string
  formatStyle?: ElementStyle | null
  viewMode: ViewMode
}

function ChainNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as ChainNodeData
  return (
    <div
      className={`chain-node chain-node-${d.role}${selected ? ' selected' : ''}`}
      style={nodeInlineStyle(d.formatStyle, d.viewMode)}
      data-chain-role={d.role}
    >
      <span className="stereotype">«{d.typeLabel}»</span>
      <strong title={d.label}>{d.label}</strong>
      {/* Links to a column on the left leave from the left side, the others from the right. */}
      <Handle type="target" position={Position.Left} id="l-in" className="flow-handle" />
      <Handle type="source" position={Position.Left} id="l-out" className="flow-handle" />
      <Handle type="target" position={Position.Right} id="r-in" className="flow-handle" />
      <Handle type="source" position={Position.Right} id="r-out" className="flow-handle" />
    </div>
  )
}

export const ChainNode = memo(ChainNodeInner)
