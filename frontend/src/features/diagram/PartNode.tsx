import {
  Handle,
  NodeResizer,
  Position,
  useNodeId,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PortSide, ElementStyle } from '../../api'
import type { ViewMode } from '../../settings'
import { nodeInlineStyle, resolveModeStyle } from './elementStyle'
import { portLabelStyle as computePortLabelStyle } from './edgeRouting'

export type PartPort = {
  id: string
  name: string
  side: PortSide
  offset: number
  style?: ElementStyle | null
}

export type PartNodeData = {
  label: string
  artifactId: string
  kind: string
  /** SysML type usage, e.g. FunctionalModule from `part x : FunctionalModule` */
  typeRef: string | null
  /** Part multiplicity, e.g. `0..*` from `part x [0..*] : Type` */
  multiplicity?: string | null
  ports: PartPort[]
  menuItems: { viewId: string; name: string }[]
  /** Option/Alt held — port drag (move) mode */
  portMoveMode?: boolean
  /** Whitebox boundary (composite part frame) */
  isBoundary?: boolean
  /** Show attribute names inside the part */
  showAttributes?: boolean
  attributeNames?: string[]
  formatStyle?: ElementStyle | null
  viewMode?: ViewMode
  onOpenView?: (viewId: string) => void
  onPortDrag?: (portId: string, side: PortSide, offset: number) => void
}

function sideToPosition(side: PortSide): Position {
  switch (side) {
    case 'left':
      return Position.Left
    case 'right':
      return Position.Right
    case 'top':
      return Position.Top
    case 'bottom':
      return Position.Bottom
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function offsetStyle(side: PortSide, offset: number): CSSProperties {
  const pct = `${clamp(offset, 0.05, 0.95) * 100}%`
  if (side === 'left' || side === 'right') {
    return { top: pct }
  }
  return { left: pct }
}

function guillemets(text: string): string {
  return `«${text}»`
}

function typeShortTag(typeRef: string): string {
  const caps = typeRef.replace(/[^A-Za-z]/g, '').match(/[A-Z]/g)
  if (caps && caps.length >= 2) return caps.join('')
  return typeRef.slice(0, 3).toUpperCase()
}

/** Map pointer position (relative to node box) onto nearest border edge. */
export function nearestBorderAnchor(
  px: number,
  py: number,
  width: number,
  height: number,
): { side: PortSide; offset: number } {
  if (width <= 0 || height <= 0) {
    return { side: 'right', offset: 0.5 }
  }

  const x = clamp(px, 0, width)
  const y = clamp(py, 0, height)

  const distTop = y
  const distBottom = height - y
  const distLeft = x
  const distRight = width - x
  const min = Math.min(distTop, distBottom, distLeft, distRight)

  if (min === distLeft) {
    return { side: 'left', offset: clamp(y / height, 0.05, 0.95) }
  }
  if (min === distRight) {
    return { side: 'right', offset: clamp(y / height, 0.05, 0.95) }
  }
  if (min === distTop) {
    return { side: 'top', offset: clamp(x / width, 0.05, 0.95) }
  }
  return { side: 'bottom', offset: clamp(x / width, 0.05, 0.95) }
}

function portLabelStyle(side: PortSide, offset: number, outside = false): CSSProperties {
  return {
    color: 'var(--ink)',
    ...(computePortLabelStyle(side, offset, { outside }) as CSSProperties),
  }
}

export function PartNode({ data, selected }: NodeProps) {
  const d = data as PartNodeData
  const [menuOpen, setMenuOpen] = useState(false)
  const [localPorts, setLocalPorts] = useState<PartPort[]>(d.ports)
  const rootRef = useRef<HTMLDivElement>(null)
  const draggingPortId = useRef<string | null>(null)
  const nodeId = useNodeId()
  const updateNodeInternals = useUpdateNodeInternals()
  const keyword = d.kind === 'package' ? 'package' : 'part'
  const typeTag = d.typeRef ? typeShortTag(d.typeRef) : null
  const moveMode = !!d.portMoveMode

  useEffect(() => {
    if (!draggingPortId.current) {
      setLocalPorts(d.ports)
    }
  }, [d.ports])

  const updatePortFromPointer = useCallback((portId: string, clientX: number, clientY: number) => {
    const el = rootRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const anchor = nearestBorderAnchor(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    )
    setLocalPorts((prev) =>
      prev.map((p) =>
        p.id === portId ? { ...p, side: anchor.side, offset: anchor.offset } : p,
      ),
    )
    return anchor
  }, [])

  const endPortDrag = useCallback(
    (portId: string, clientX: number, clientY: number) => {
      const anchor = updatePortFromPointer(portId, clientX, clientY)
      draggingPortId.current = null
      if (anchor) {
        d.onPortDrag?.(portId, anchor.side, anchor.offset)
        if (nodeId) updateNodeInternals(nodeId)
      }
      document.body.classList.remove('port-dragging')
    },
    [d, nodeId, updateNodeInternals, updatePortFromPointer],
  )

  const onPortMouseDown = (
    port: PartPort,
    e: ReactMouseEvent | ReactPointerEvent,
  ) => {
    // Option (macOS) / Alt — move port along parent border
    if (!e.altKey && !moveMode) {
      return
    }

    e.preventDefault()
    e.stopPropagation()

    draggingPortId.current = port.id
    document.body.classList.add('port-dragging')
    updatePortFromPointer(port.id, e.clientX, e.clientY)

    const onMove = (ev: MouseEvent) => {
      if (draggingPortId.current !== port.id) return
      updatePortFromPointer(port.id, ev.clientX, ev.clientY)
    }

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (draggingPortId.current === port.id) {
        endPortDrag(port.id, ev.clientX, ev.clientY)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={rootRef}
      className={`part-node kind-${d.kind}${selected ? ' selected' : ''}${moveMode ? ' port-move-mode' : ''}${d.isBoundary ? ' boundary' : ''}`}
      style={nodeInlineStyle(d.formatStyle, d.viewMode || 'light', {
        isBoundary: d.isBoundary,
      })}
    >
      <NodeResizer
        minWidth={d.isBoundary ? 280 : 120}
        minHeight={d.isBoundary ? 160 : 72}
        isVisible={!!selected && !moveMode}
        lineClassName="part-resize-line"
        handleClassName="part-resize-handle"
      />
      <div className="part-node-header">
        <div className="part-node-heading">
          <div className="part-stereotypes">
            <span className="stereotype">{guillemets(keyword)}</span>
            {d.typeRef && (
              <span className="stereotype type" title={d.typeRef}>
                {guillemets(typeTag || d.typeRef)}
              </span>
            )}
            {d.isBoundary && <span className="stereotype">«whitebox»</span>}
          </div>
          <span className="part-node-title">
            {d.label}
            {d.multiplicity ? ` [${d.multiplicity}]` : ''}
          </span>
        </div>
        {d.menuItems?.length ? (
          <div className="part-menu">
            <button
              type="button"
              className="part-menu-btn"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen((v) => !v)
              }}
              title="Sub-diagrams"
            >
              &gt;&gt;
            </button>
            {menuOpen && (
              <ul className="part-menu-list">
                {d.menuItems.map((item) => (
                  <li key={item.viewId}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpen(false)
                        d.onOpenView?.(item.viewId)
                      }}
                    >
                      {item.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      <div className="part-node-body">
        {d.showAttributes && d.attributeNames && d.attributeNames.length > 0 && (
          <ul className="part-attr-list">
            {d.attributeNames.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      {localPorts.map((port) => {
        // Parent/boundary: L/R labels outside. Child parts: always inside, centered on port.
        const outside =
          !!d.isBoundary && (port.side === 'left' || port.side === 'right')
        const portMode = resolveModeStyle(port.style, d.viewMode || 'light')
        const parentMode = resolveModeStyle(d.formatStyle, d.viewMode || 'light')
        const labelColor = portMode.textColor || parentMode.textColor
        return (
          <span
            key={`label-${port.id}`}
            className={`port-label port-label-${port.side}${outside ? ' outside' : ' inside'}`}
            style={{
              ...portLabelStyle(port.side, port.offset, outside),
              ...(labelColor ? { color: labelColor } : {}),
            }}
          >
            {port.name}
          </span>
        )
      })}
      {localPorts.map((port) => {
        const portMode = resolveModeStyle(port.style, d.viewMode || 'light')
        const parentMode = resolveModeStyle(d.formatStyle, d.viewMode || 'light')
        const bg = portMode.backgroundColor || parentMode.backgroundColor
        const border = portMode.lineColor || parentMode.lineColor
        return (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={sideToPosition(port.side)}
          style={{
            ...offsetStyle(port.side, port.offset),
            zIndex: 5,
            cursor: moveMode ? 'move' : 'crosshair',
            ...(bg ? { background: bg } : {}),
            ...(border ? { borderColor: border } : {}),
          }}
          isConnectable={!moveMode}
          title={
            moveMode
              ? `${port.name} — dra längs kanten`
              : `${port.name} — dra till annan port (Option = flytta)`
          }
          className={
            moveMode
              ? 'port-handle-move nodrag nopan'
              : 'port-handle-connect nodrag nopan'
          }
          onPointerDown={(e) => onPortMouseDown(port, e)}
          onMouseDown={(e) => onPortMouseDown(port, e)}
        />
        )
      })}
      {localPorts.map((port) => (
        <Handle
          key={`t-${port.id}`}
          id={`target:${port.id}`}
          type="target"
          position={sideToPosition(port.side)}
          style={{
            ...offsetStyle(port.side, port.offset),
            // Edge endpoint only — connection uses source handles (Loose mode)
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 1,
          }}
          isConnectable={false}
        />
      ))}
      {(
        [
          ['rel-out-left', 'source', 'left' as PortSide],
          ['rel-out-right', 'source', 'right' as PortSide],
          ['rel-out-top', 'source', 'top' as PortSide],
          ['rel-out-bottom', 'source', 'bottom' as PortSide],
          ['rel-in-left', 'target', 'left' as PortSide],
          ['rel-in-right', 'target', 'right' as PortSide],
          ['rel-in-top', 'target', 'top' as PortSide],
          ['rel-in-bottom', 'target', 'bottom' as PortSide],
        ] as const
      ).map(([id, type, side]) => (
        <Handle
          key={id}
          id={id}
          type={type}
          position={sideToPosition(side)}
          style={{
            ...offsetStyle(side, 0.5),
            opacity: 0,
            pointerEvents: 'none',
            zIndex: 0,
          }}
          isConnectable={false}
        />
      ))}
    </div>
  )
}
