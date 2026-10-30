import { memo, useEffect, useRef } from 'react'
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import type { ElementStyle, PortSide } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { BoundaryHandles } from '../../BoundaryHandles'
import type { BoundaryAnchor } from '../../boundaryAnchors'
import { kindBackground } from '../../elementStyle'
import { camelCaseSegments } from '../sequence/camelWrap'

export type UseCaseNodeData = {
  label: string
  artifactId: string
  formatStyle?: ElementStyle | null
  viewMode?: ViewMode
  anchors?: BoundaryAnchor[]
  portMoveMode?: boolean
  onAnchorDrag?: (
    anchorId: string,
    side: PortSide,
    offset: number,
    persist: boolean,
  ) => void
}

function UseCaseNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as UseCaseNodeData
  const rootRef = useRef<HTMLDivElement>(null)
  const updateNodeInternals = useUpdateNodeInternals()
  // Relation-owned anchors only — never inject the four side defaults.
  const anchors = Array.isArray(d.anchors) ? d.anchors : []
  const anchorSig = anchors.map((a) => `${a.id}:${a.side}:${a.offset}`).join('|')
  const bg =
    kindBackground('action', d.viewMode || 'light', d.formatStyle) ||
    'var(--part-fill)'

  useEffect(() => {
    updateNodeInternals(id)
  }, [anchorSig, id, updateNodeInternals])

  return (
    <div
      ref={rootRef}
      className={`usecase-node${selected ? ' selected' : ''}`}
      style={{ background: bg }}
    >
      <BoundaryHandles
        boxRef={rootRef}
        anchors={anchors}
        shape="ellipse"
        onAnchorDrag={d.onAnchorDrag}
      />
      <div className="usecase-label">
        {camelCaseSegments(d.label).map((part, index) => (
          <span key={`${part}-${index}`}>
            {index > 0 ? <wbr /> : null}
            {part}
          </span>
        ))}
      </div>
    </div>
  )
}

export const UseCaseNode = memo(UseCaseNodeInner)
