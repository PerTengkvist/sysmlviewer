import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { ElementStyle } from '../../../api'
import type { ViewMode } from '../../../settings'
import { kindBackground, nodeInlineStyle } from '../../elementStyle'

export type TreeNodeData = {
  label: string
  artifactId: string
  kind: string
  collapsed?: boolean
  hasChildren?: boolean
  formatStyle?: ElementStyle | null
  viewMode: ViewMode
  onToggle?: (artifactId: string) => void
}

function TreeNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as TreeNodeData
  const style = nodeInlineStyle(d.formatStyle, d.viewMode)
  const bg = kindBackground('tree', d.viewMode, d.formatStyle)
  return (
    <div
      className={`tree-diagram-node${selected ? ' selected' : ''}`}
      style={{ ...style, backgroundColor: bg || style.backgroundColor }}
    >
      {d.hasChildren ? (
        <button
          type="button"
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation()
            d.onToggle?.(d.artifactId)
          }}
          aria-label={d.collapsed ? 'Expand' : 'Collapse'}
        >
          {d.collapsed ? '▸' : '▾'}
        </button>
      ) : (
        <span className="tree-toggle spacer" />
      )}
      <span className="artifact-kind">{d.kind}</span>
      <strong>{d.label}</strong>
      <Handle type="target" position={Position.Top} id="top" className="tree-handle" />
      <Handle type="target" position={Position.Left} id="in" className="tree-handle" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="tree-handle" />
      <Handle type="source" position={Position.Right} id="out" className="tree-handle" />
    </div>
  )
}

export const TreeDiagramNode = memo(TreeNodeInner)
