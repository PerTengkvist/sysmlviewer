/**
 * Option+Shift drag → rectangle-select ports (React Flow only marquees nodes).
 *
 * Activation uses pointer-event modifiers (same as click-select), not React
 * key state — otherwise the listener arms one frame too late and RF steals
 * the drag.
 */
import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react'
import type { Node } from '@xyflow/react'
import {
  allPortIdsFromNodes,
  collectPortsInScreenRect,
} from './layout/portMarquee'

type Props = {
  /** Structure diagram, not print — listeners may run. */
  enabled: boolean
  nodesRef: MutableRefObject<Node[]>
  onPortsBoxed: (portIds: string[]) => void
  /** Set when a drag-marquee completed so pane click does not clear selection. */
  suppressPaneClickRef: MutableRefObject<boolean>
}

const MIN_DRAG_PX = 4

export function PortMarqueeLayer({
  enabled,
  nodesRef,
  onPortsBoxed,
  suppressPaneClickRef,
}: Props) {
  const onPortsBoxedRef = useRef(onPortsBoxed)
  onPortsBoxedRef.current = onPortsBoxed

  const [screenBox, setScreenBox] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!enabled) {
      startRef.current = null
      draggingRef.current = false
      setScreenBox(null)
      return
    }

    const onDown = (e: PointerEvent) => {
      // Match click-select: read modifiers from the pointer event itself.
      if (!e.altKey || !e.shiftKey || e.button !== 0) return
      const el = e.target as Element | null
      if (!el?.closest?.('.diagram-canvas .react-flow')) return
      // Port click-toggle owns handle hits.
      if (el.closest('.react-flow__handle')) return
      if (
        el.closest(
          'button, input, textarea, a, .icon-toolbar-btn, .tool-banner',
        )
      ) {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      draggingRef.current = true
      startRef.current = { x: e.clientX, y: e.clientY }
      setScreenBox({
        left: e.clientX,
        top: e.clientY,
        width: 0,
        height: 0,
      })
      try {
        document.body.setPointerCapture(e.pointerId)
      } catch {
        /* some browsers reject capture on body */
      }
    }

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || !startRef.current) return
      const a = startRef.current
      setScreenBox({
        left: Math.min(a.x, e.clientX),
        top: Math.min(a.y, e.clientY),
        width: Math.abs(e.clientX - a.x),
        height: Math.abs(e.clientY - a.y),
      })
    }

    const finish = (e: PointerEvent) => {
      if (!draggingRef.current || !startRef.current) return
      draggingRef.current = false
      const a = startRef.current
      startRef.current = null
      try {
        document.body.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      const width = Math.abs(e.clientX - a.x)
      const height = Math.abs(e.clientY - a.y)
      const box = {
        left: Math.min(a.x, e.clientX),
        top: Math.min(a.y, e.clientY),
        width,
        height,
      }
      setScreenBox(null)
      if (width < MIN_DRAG_PX && height < MIN_DRAG_PX) return

      suppressPaneClickRef.current = true
      const portIds = allPortIdsFromNodes(nodesRef.current)
      const hit = collectPortsInScreenRect(portIds, box)
      if (hit.length) onPortsBoxedRef.current(hit)
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', finish, true)
    window.addEventListener('pointercancel', finish, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', finish, true)
      window.removeEventListener('pointercancel', finish, true)
    }
  }, [enabled, nodesRef, suppressPaneClickRef])

  if (!screenBox || (screenBox.width < 1 && screenBox.height < 1)) return null

  return (
    <div
      className="port-marquee-rect"
      style={{
        left: screenBox.left,
        top: screenBox.top,
        width: screenBox.width,
        height: screenBox.height,
      }}
      aria-hidden
    />
  )
}
