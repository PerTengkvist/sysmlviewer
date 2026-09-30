import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import type { ElementStyle } from '../../../api'
import type { ViewMode } from '../../../settings'
import { kindBackground, nodeInlineStyle } from '../../elementStyle'
import { camelCaseSegments } from './camelWrap'

export type LifelineNodeData = {
  label: string
  artifactId: string
  formatStyle?: ElementStyle | null
  viewMode: ViewMode
  /** Pixel height of the dashed life line below the header */
  lineHeight: number
  /** Shared header box so wrapped names stay above the message rows */
  headerHeight: number
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
  const headerHeight = d.headerHeight || 48
  const totalH = headerHeight + d.lineHeight
  const isDark = d.viewMode === 'dark'
  const nameParts = camelCaseSegments(d.label)

  return (
    <div
      className={`lifeline-node${selected ? ' selected' : ''}${isDark ? ' theme-dark' : ' theme-light'}`}
      style={{ ...base, height: '100%' }}
    >
      <div
        className="lifeline-header"
        style={{
          minHeight: headerHeight,
          ...(bg ? { backgroundColor: bg } : {}),
        }}
      >
        <span className="stereotype">«lifeline»</span>
        <strong className="lifeline-name">
          {nameParts.map((part, index) => (
            <span key={`${part}-${index}`}>
              {index > 0 ? <wbr /> : null}
              {part}
            </span>
          ))}
        </strong>
      </div>
      <div className="lifeline-axis" style={{ height: d.lineHeight }} />
      {Array.from({ length: msgCount }, (_, index) => {
        const y = headerHeight + 40 + index * 56
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
