import { memo, useEffect, useRef } from 'react'
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import type { ElementStyle, PortSide } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { BoundaryHandles } from '../../BoundaryHandles'
import { resolveAnchors, type BoundaryAnchor } from '../../boundaryAnchors'
import { kindBackground } from '../../elementStyle'
import { nearestBorderAnchor } from '../../PartNode'
import { camelCaseSegments } from '../sequence/camelWrap'

export type UseCaseNodeData = {
  label: string
  artifactId: string
  formatStyle?: ElementStyle | null
  viewMode?: ViewMode
  anchors?: BoundaryAnchor[]
  onAnchorDrag?: (
    anchorId: string,
    side: PortSide,
    offset: number,
    persist: boolean,
  ) => void
  onAddAnchor?: (side: PortSide, offset: number) => void
}

function UseCaseNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as UseCaseNodeData
  const rootRef = useRef<HTMLDivElement>(null)
  const updateNodeInternals = useUpdateNodeInternals()
  const anchors = resolveAnchors(d.anchors)
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
      onContextMenu={(e) => {
        if (e.ctrlKey && e.altKey) e.preventDefault()
      }}
      onPointerDown={(e) => {
        if (!e.ctrlKey || !e.altKey || e.metaKey) return
        e.preventDefault()
        e.stopPropagation()
        const el = rootRef.current
        if (!el || !d.onAddAnchor) return
        const rect = el.getBoundingClientRect()
        const localX =
          ((e.clientX - rect.left) / Math.max(rect.width, 1)) * el.offsetWidth
        const localY =
          ((e.clientY - rect.top) / Math.max(rect.height, 1)) * el.offsetHeight
        const hit = nearestBorderAnchor(
          localX,
          localY,
          el.offsetWidth,
          el.offsetHeight,
        )
        d.onAddAnchor(hit.side, hit.offset)
      }}
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
