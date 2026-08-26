import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import type { ElementStyle } from '../../../api'
import type { ViewMode } from '../../../settings'
import { kindBackground, nodeInlineStyle } from '../../elementStyle'

export type LifelineNodeData = {
  label: string
  artifactId: string
  formatStyle?: ElementStyle | null
  viewMode: ViewMode
  /** Pixel height of the dashed life line below the header */
  lineHeight: number
  messageCount?: number
}

/** Center of the lifeline node — messages attach on the vertical axis. */
const centerHandleStyle = (topPct: string): CSSProperties => ({
  top: topPct,
  left: '50%',
  right: 'auto',
  transform: 'translate(-50%, -50%)',
})

function LifelineNodeInner({ data, selected }: NodeProps) {
  const d = data as unknown as LifelineNodeData
  const base = nodeInlineStyle(d.formatStyle, d.viewMode)
  const bg = kindBackground('lifeline', d.viewMode, d.formatStyle)
  const msgCount = d.messageCount ?? 0
  const totalH = 48 + d.lineHeight
  const isDark = d.viewMode === 'dark'

  return (
    <div
      className={`lifeline-node${selected ? ' selected' : ''}${isDark ? ' theme-dark' : ' theme-light'}`}
      style={{ ...base, height: '100%' }}
    >
      <div
        className="lifeline-header"
        style={bg ? { backgroundColor: bg } : undefined}
      >
        <span className="stereotype">«lifeline»</span>
        <strong>{d.label}</strong>
      </div>
      <div className="lifeline-axis" style={{ height: d.lineHeight }} />
      {Array.from({ length: msgCount }, (_, index) => {
        const y = 48 + 40 + index * 56
        const topPct = `${(y / totalH) * 100}%`
        const centered = centerHandleStyle(topPct)
        return (
          <span key={index}>
            <Handle
              type="source"
              position={Position.Right}
              id={`msg-${index}-out`}
              className="lifeline-handle"
              style={centered}
            />
            <Handle
              type="target"
              position={Position.Left}
              id={`msg-${index}-in`}
              className="lifeline-handle"
              style={centered}
            />
          </span>
        )
      })}
    </div>
  )
}

export const LifelineNode = memo(LifelineNodeInner)
