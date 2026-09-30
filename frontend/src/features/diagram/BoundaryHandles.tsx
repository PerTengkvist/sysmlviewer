import { Handle, Position } from '@xyflow/react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import type { PortSide } from '../../api'
import {
  anchorHandleStyle,
  type BoundaryAnchor,
} from './boundaryAnchors'
import { nearestBorderAnchor } from './PartNode'

const POSITION: Record<PortSide, Position> = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

type Props = {
  boxRef: RefObject<HTMLDivElement | null>
  anchors: BoundaryAnchor[]
  shape: 'ellipse' | 'rect'
  onAnchorDrag?: (
    anchorId: string,
    side: PortSide,
    offset: number,
    persist: boolean,
  ) => void
}

/** Four (or more) boundary connection points, shared by incoming and outgoing edges. */
export function BoundaryHandles({ boxRef, anchors, shape, onAnchorDrag }: Props) {
  const drag = (
    anchor: BoundaryAnchor,
    event: ReactPointerEvent,
  ) => {
    event.stopPropagation()
    event.preventDefault()
    const root = boxRef.current
    if (!root || !onAnchorDrag) return
    let last = { side: anchor.side, offset: anchor.offset }
    const read = (ev: PointerEvent) => {
      const rect = root.getBoundingClientRect()
      const localX =
        ((ev.clientX - rect.left) / Math.max(rect.width, 1)) * root.offsetWidth
      const localY =
        ((ev.clientY - rect.top) / Math.max(rect.height, 1)) * root.offsetHeight
      return nearestBorderAnchor(
        localX,
        localY,
        root.offsetWidth,
        root.offsetHeight,
      )
    }
    const move = (ev: PointerEvent) => {
      last = read(ev)
      onAnchorDrag(anchor.id, last.side, last.offset, false)
    }
    const up = (ev: PointerEvent) => {
      last = read(ev)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onAnchorDrag(anchor.id, last.side, last.offset, true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <>
      {anchors.map((anchor) => {
        const style = anchorHandleStyle(anchor.side, anchor.offset, shape)
        const position = POSITION[anchor.side]
        return (
          <span key={anchor.id}>
            <Handle
              type="target"
              position={position}
              id={`target:${anchor.id}`}
              style={{ ...style, pointerEvents: 'none' }}
              className="boundary-anchor"
              isConnectable={false}
            />
            <Handle
              type="source"
              position={position}
              id={anchor.id}
              style={style}
              className="boundary-anchor"
              isConnectable={false}
              onPointerDown={(e) => drag(anchor, e)}
            />
          </span>
        )
      })}
    </>
  )
}
