import { memo, useEffect, useRef } from 'react'
import {
  NodeResizer,
  type NodeProps,
  useUpdateNodeInternals,
} from '@xyflow/react'
import type { ElementStyle, PortSide } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { BoundaryHandles } from '../../BoundaryHandles'
import { resolveAnchors, type BoundaryAnchor } from '../../boundaryAnchors'
import { nodeInlineStyles } from '../../elementStyle'
import { nearestBorderAnchor } from '../../PartNode'
import { requirementStereotype } from '../../requirementStereotype'

export type RequirementNodeData = {
  label: string
  artifactId: string
  shortId?: string | null
  /** Resolved header line from settings (e.g. "R-01 Safety"). */
  headerText?: string
  /** Resolved body text from settings (doc or attribute). */
  bodyText?: string
  documentation?: string | null
  typeAttr?: string | null
  formatStyle?: ElementStyle | null
  viewMode?: ViewMode
  anchors?: BoundaryAnchor[]
  editLocked?: boolean
  portMoveMode?: boolean
  onAnchorDrag?: (
    anchorId: string,
    side: PortSide,
    offset: number,
    persist: boolean,
  ) => void
  onAddAnchor?: (side: PortSide, offset: number) => void
}

function RequirementNodeInner({ id, data, selected, width, height }: NodeProps) {
  const d = data as unknown as RequirementNodeData
  const rootRef = useRef<HTMLDivElement>(null)
  const updateNodeInternals = useUpdateNodeInternals()
  const anchors = resolveAnchors(d.anchors)
  const anchorSig = anchors.map((a) => `${a.id}:${a.side}:${a.offset}`).join('|')
  const stereo = requirementStereotype({ typeAttr: d.typeAttr })
  const regions = nodeInlineStyles(d.formatStyle, d.viewMode || 'light')
  const headerText =
    d.headerText ??
    [d.shortId, d.label].filter(Boolean).join(' ')
  const bodyText = d.bodyText ?? d.documentation ?? ''

  useEffect(() => {
    updateNodeInternals(id)
  }, [anchorSig, id, updateNodeInternals, width, height])

  return (
    <div
      ref={rootRef}
      className={`requirement-node${selected ? ' selected' : ''}`}
      style={regions.root}
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
      <NodeResizer
        minWidth={160}
        minHeight={72}
        isVisible={!!selected && !d.portMoveMode && !d.editLocked}
        lineClassName="part-resize-line"
        handleClassName="part-resize-handle"
      />
      <BoundaryHandles
        boxRef={rootRef}
        anchors={anchors}
        shape="rect"
        onAnchorDrag={d.onAnchorDrag}
      />
      <div className="requirement-header" style={regions.header}>
        <div className="stereotype">«{stereo}»</div>
        <div className="requirement-title">{headerText}</div>
      </div>
      <div className="requirement-body" style={regions.body}>
        {bodyText}
      </div>
    </div>
  )
}

export const RequirementNode = memo(RequirementNodeInner)
