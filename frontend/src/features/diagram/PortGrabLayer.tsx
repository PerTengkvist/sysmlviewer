import { useStore, ViewportPortal } from '@xyflow/react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { portGrabTargets, samePortGrabTargets } from './portGrabTargets'

function portHandle(from: Element, portId: string): HTMLElement | null {
  return (
    from
      .closest('.react-flow')
      ?.querySelector<HTMLElement>(
        `.react-flow__handle[data-port-id="${CSS.escape(portId)}"]`,
      ) ?? null
  )
}

/** Replay the press on the port itself, so moving and selecting stay in one place. */
function pressPort(portId: string, e: ReactPointerEvent<HTMLDivElement>) {
  const handle = portHandle(e.currentTarget, portId)
  if (!handle) return
  e.preventDefault()
  e.stopPropagation()
  const n = e.nativeEvent
  handle.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: n.clientX,
      clientY: n.clientY,
      screenX: n.screenX,
      screenY: n.screenY,
      altKey: n.altKey,
      shiftKey: n.shiftKey,
      ctrlKey: n.ctrlKey,
      metaKey: n.metaKey,
      button: n.button,
      buttons: n.buttons,
      pointerId: n.pointerId,
      pointerType: n.pointerType,
      isPrimary: n.isPrimary,
    }),
  )
}

/**
 * While Option is held, connection and binding grips are drawn above the parts.
 * This layer sits above them and draws every port again where it already is,
 * so a port is always on top and can be grabbed.
 */
export function PortGrabLayer() {
  const targets = useStore(
    (s) => portGrabTargets(s.nodeLookup.values()),
    samePortGrabTargets,
  )
  return (
    <ViewportPortal>
      {targets.map((t) => (
        <div
          key={t.portId}
          data-port-grab={t.portId}
          className={`port-grab-target nodrag nopan${t.selected ? ' selected' : ''}`}
          style={{
            transform: `translate(${t.x}px, ${t.y}px)`,
            width: t.width,
            height: t.height,
            ...(t.background ? { background: t.background } : {}),
            ...(t.borderColor ? { borderColor: t.borderColor } : {}),
          }}
          onPointerEnter={(e) => {
            const title = portHandle(e.currentTarget, t.portId)?.title
            if (title) e.currentTarget.title = title
          }}
          onPointerDown={(e) => pressPort(t.portId, e)}
        />
      ))}
    </ViewportPortal>
  )
}
