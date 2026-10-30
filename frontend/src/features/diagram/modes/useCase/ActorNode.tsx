import { memo, useEffect, useRef } from 'react'
import { type NodeProps, useUpdateNodeInternals } from '@xyflow/react'
import type { ElementStyle, PortSide } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { BoundaryHandles } from '../../BoundaryHandles'
import type { BoundaryAnchor } from '../../boundaryAnchors'
import { iconUrl } from '../../iconRef'

export type ActorNodeData = {
  label: string
  artifactId: string
  formatStyle?: ElementStyle | null
  viewMode?: ViewMode
  iconName?: string | null
  anchors?: BoundaryAnchor[]
  portMoveMode?: boolean
  onAnchorDrag?: (
    anchorId: string,
    side: PortSide,
    offset: number,
    persist: boolean,
  ) => void
}

function ActorNodeInner({ id, data, selected }: NodeProps) {
  const d = data as unknown as ActorNodeData
  const rootRef = useRef<HTMLDivElement>(null)
  const updateNodeInternals = useUpdateNodeInternals()
  // Relation-owned list may be empty; do not inject the four defaults.
  const liveAnchors = Array.isArray(d.anchors) ? d.anchors : []
  const anchorSig = liveAnchors.map((a) => `${a.id}:${a.side}:${a.offset}`).join('|')

  useEffect(() => {
    updateNodeInternals(id)
  }, [anchorSig, id, updateNodeInternals])

  return (
    <div
      ref={rootRef}
      className={`actor-node${selected ? ' selected' : ''}${
        d.portMoveMode ? ' port-move-mode' : ''
      }`}
    >
      <BoundaryHandles
        boxRef={rootRef}
        anchors={liveAnchors}
        shape="rect"
        onAnchorDrag={d.onAnchorDrag}
      />
      {d.iconName ? (
        <img
          className="actor-icon"
          src={iconUrl(d.iconName)}
          alt=""
          width={48}
          height={48}
        />
      ) : (
        <svg className="actor-figure" viewBox="0 0 48 72" aria-hidden>
          <circle cx="24" cy="10" r="8" />
          <line x1="24" y1="18" x2="24" y2="42" />
          <line x1="8" y1="28" x2="40" y2="28" />
          <line x1="24" y1="42" x2="10" y2="66" />
          <line x1="24" y1="42" x2="38" y2="66" />
        </svg>
      )}
      <div className="actor-name">{d.label}</div>
    </div>
  )
}

export const ActorNode = memo(ActorNodeInner)
