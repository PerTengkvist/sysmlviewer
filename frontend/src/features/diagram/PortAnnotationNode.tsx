import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type PortAnnotationNodeData = {
  label: string
  portId: string
}

function PortAnnotationNodeImpl({ data }: NodeProps) {
  const d = data as PortAnnotationNodeData
  return (
    <div className="port-annotation-node" data-port-annotation={d.portId}>
      <Handle
        type="target"
        id="anno-target"
        position={Position.Left}
        style={{ opacity: 0, pointerEvents: 'none' }}
        isConnectable={false}
      />
      <span className="port-annotation-label">{d.label}</span>
    </div>
  )
}

export const PortAnnotationNode = memo(PortAnnotationNodeImpl)
