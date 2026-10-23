import {
  Handle,
  NodeResizer,
  Position,
  useNodeId,
  useUpdateNodeInternals,
  useViewport,
  type NodeProps,
} from '@xyflow/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { PortSide, ElementStyle } from '../../api'
import type { ViewMode } from '../../settings'
import { nodeInlineStyles, resolveModeStyle } from './elementStyle'
import { portLabelStyle as computePortLabelStyle } from './edgeRouting'
import {
  clampPortOffset,
  flowSizeFromScreenRect,
  PORT_BODY_OFFSET_MAX,
  PORT_BOUNDARY_OFFSET_MAX,
  PORT_BOUNDARY_OFFSET_MIN,
  PORT_TB_INSET,
} from './layout/portPlacement'
import {
  parsePartIconRef,
  partSvgIconUrl,
  resolveLucideIcon,
} from './partIcon'

/** Header icon from `_icon` — Lucide component or SVG library img. */
export function PartHeaderIcon({
  iconName,
}: {
  iconName?: string | null
}) {
  const ref = parsePartIconRef(iconName)
  if (!ref) return null
  if (ref.kind === 'svg') {
    return (
      <img
        className="part-node-icon"
        src={partSvgIconUrl(ref.path)}
        alt=""
        width={16}
        height={16}
        aria-hidden
        data-testid="part-icon"
        data-icon-library={ref.library}
      />
    )
  }
  const Icon = resolveLucideIcon(ref.name)
  if (!Icon) return null
  return (
    <Icon
      className="part-node-icon"
      size={16}
      aria-hidden
      data-testid="part-icon"
      data-icon-library="lucide"
    />
  )
}

/** Default leaf part height (px) — body icon “normal” size is 50% of body at this height. */
export const PART_DEFAULT_HEIGHT = 110

/** Fallback header height before layout measurement (px). */
export const PART_HEADER_HEIGHT_FALLBACK = 40

/**
 * Max body-icon size: 1.5 × (50% of body at PART_DEFAULT_HEIGHT).
 * `headerHeight` is the measured header; fallback keeps the formula usable in tests.
 */
export function partBodyIconMaxPx(
  headerHeight = PART_HEADER_HEIGHT_FALLBACK,
): number {
  const bodyAtDefault = Math.max(0, PART_DEFAULT_HEIGHT - headerHeight)
  return 1.5 * 0.5 * bodyAtDefault
}

/**
 * Which icon refs go in header vs body.
 * Whitebox (children visible): `_icon` wins; else `_icon_body` in header; no body icon.
 * Blackbox: `_icon` in header, `_icon_body` in body.
 */
export function resolvePartIconPlacement(d: {
  childrenVisible?: boolean
  iconName?: string | null
  iconBodyName?: string | null
}): { headerIcon: string | null; bodyIcon: string | null } {
  const icon = d.iconName?.trim() || null
  const body = d.iconBodyName?.trim() || null
  if (d.childrenVisible) {
    return { headerIcon: icon || body, bodyIcon: null }
  }
  return { headerIcon: icon, bodyIcon: body }
}

/**
 * Body icon from `_icon_body` — centered, height = 50% of body (capped), aspect preserved.
 */
export function PartBodyIcon({
  iconName,
  maxPx,
}: {
  iconName?: string | null
  maxPx?: number
}) {
  const ref = parsePartIconRef(iconName)
  if (!ref) return null
  const boxStyle =
    maxPx != null
      ? ({
          ['--part-body-icon-max' as string]: `${maxPx}px`,
        } as CSSProperties)
      : undefined
  if (ref.kind === 'svg') {
    return (
      <div className="part-node-body-icon-wrap" data-testid="part-body-icon-wrap">
        <div className="part-node-body-icon-box" style={boxStyle}>
          <img
            className="part-node-body-icon"
            src={partSvgIconUrl(ref.path)}
            alt=""
            aria-hidden
            data-testid="part-body-icon"
            data-icon-library={ref.library}
          />
        </div>
      </div>
    )
  }
  const Icon = resolveLucideIcon(ref.name)
  if (!Icon) return null
  return (
    <div className="part-node-body-icon-wrap" data-testid="part-body-icon-wrap">
      <div className="part-node-body-icon-box" style={boxStyle}>
        <Icon
          className="part-node-body-icon"
          width="100%"
          height="100%"
          aria-hidden
          data-testid="part-body-icon"
          data-icon-library="lucide"
        />
      </div>
    </div>
  )
}

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
  /** `ref part` — non-composite reference feature */
  isReference?: boolean
  /** Prefix metadata keywords from `#mystereotype part …` */
  metadataKeywords?: string[] | null
  ports: PartPort[]
  menuItems: { viewId: string; name: string }[]
  /** Option/Alt held — port drag (move) mode */
  portMoveMode?: boolean
  /** Port ids selected via Option+Shift click. */
  selectedPortIds?: string[]
  /** Whitebox boundary (composite part frame) */
  isBoundary?: boolean
  /** Child parts are drawn inside this node (whitebox with visible children). */
  childrenVisible?: boolean
  /** Show attribute names inside the part */
  showAttributes?: boolean
  attributeNames?: string[]
  /** From `attribute _icon` — Lucide name or `iconmind/<name>` / `carbon/<name>` */
  iconName?: string | null
  /** From `attribute _icon_body` — centered in body at 50% body height (blackbox) */
  iconBodyName?: string | null
  formatStyle?: ElementStyle | null
  /** Diagram edit lock — no resize or port move. */
  editLocked?: boolean
  viewMode?: ViewMode
  onOpenView?: (viewId: string, opts?: { ctrlKey?: boolean; metaKey?: boolean }) => void
  onPortDrag?: (portId: string, side: PortSide, offset: number) => void
  /** Option+Shift click — multi-select ports for distribute. */
  onPortSelect?: (portId: string) => void
  /** Live drag of a relation endpoint along this part's boundary. */
  onRelationEndDrag?: (
    artifactId: string,
    end: 'source' | 'target',
    side: PortSide,
    offset: number,
    persist?: boolean,
  ) => void
  /** Per-relation boundary attachments (dependency etc.). */
  relationHandles?: {
    id: string
    type: 'source' | 'target'
    side: PortSide
    offset: number
  }[]
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

function offsetStyle(
  side: PortSide,
  offset: number,
  isBoundary = false,
): CSSProperties {
  const lo =
    isBoundary && (side === 'left' || side === 'right')
      ? PORT_BOUNDARY_OFFSET_MIN
      : PORT_TB_INSET
  const hi =
    isBoundary && (side === 'left' || side === 'right')
      ? PORT_BOUNDARY_OFFSET_MAX
      : PORT_BODY_OFFSET_MAX
  const pct = `${clamp(offset, lo, hi) * 100}%`
  if (side === 'left' || side === 'right') {
    return { top: pct }
  }
  return { left: pct }
}

function guillemets(text: string): string {
  return `«${text}»`
}

/** Kind compartment: metadata keywords replace default «part» / «package». */
export function partStereotypeKeyword(d: {
  kind: string
  metadataKeywords?: string[] | null
}): string {
  const keywords = d.metadataKeywords || []
  if (keywords.length > 0) return keywords.join(', ')
  return d.kind === 'package' ? 'package' : 'part'
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
  opts?: { isBoundary?: boolean },
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

  const lrLo = opts?.isBoundary ? PORT_BOUNDARY_OFFSET_MIN : PORT_TB_INSET
  const lrHi = opts?.isBoundary ? PORT_BOUNDARY_OFFSET_MAX : PORT_BODY_OFFSET_MAX

  if (min === distLeft) {
    return { side: 'left', offset: clamp(y / height, lrLo, lrHi) }
  }
  if (min === distRight) {
    return { side: 'right', offset: clamp(y / height, lrLo, lrHi) }
  }
  if (min === distTop) {
    return { side: 'top', offset: clamp(x / width, PORT_TB_INSET, PORT_BODY_OFFSET_MAX) }
  }
  return {
    side: 'bottom',
    offset: clamp(x / width, PORT_TB_INSET, PORT_BODY_OFFSET_MAX),
  }
}

/** True when pointer is inside the node box (not merely clamped onto it). */
export function pointerInsideNodeBox(
  px: number,
  py: number,
  width: number,
  height: number,
): boolean {
  return px >= 0 && px <= width && py >= 0 && py <= height
}

/** Option+Shift (or port-move mode + Shift) selects ports for distribute. */
export function isPortMultiSelectGesture(opts: {
  altKey: boolean
  shiftKey: boolean
  moveMode: boolean
  editLocked: boolean
}): boolean {
  if (opts.editLocked || !opts.shiftKey) return false
  return opts.altKey || opts.moveMode
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
  const [localPorts, setLocalPorts] = useState<PartPort[]>(d.ports ?? [])
  const [headerHeight, setHeaderHeight] = useState(PART_HEADER_HEIGHT_FALLBACK)
  const rootRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const draggingPortId = useRef<string | null>(null)
  const nodeId = useNodeId()
  const updateNodeInternals = useUpdateNodeInternals()
  const { zoom } = useViewport()
  const keyword = partStereotypeKeyword(d)
  const typeTag = d.typeRef ? typeShortTag(d.typeRef) : null
  const moveMode = !!d.portMoveMode
  const selectedPorts = new Set(d.selectedPortIds || [])
  const { headerIcon, bodyIcon } = resolvePartIconPlacement(d)
  const bodyIconMaxPx = partBodyIconMaxPx(headerHeight)

  useEffect(() => {
    if (!draggingPortId.current) {
      setLocalPorts(d.ports ?? [])
    }
  }, [d.ports])

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => {
      const h = el.offsetHeight
      if (h > 0) setHeaderHeight(h)
    }
    measure()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [d.label, d.typeRef, d.metadataKeywords, d.isBoundary, headerIcon])

  // Keep React Flow handle bounds in sync when ports move (drag or Align).
  const portSig = (localPorts ?? [])
    .map((p) => `${p.id}:${p.side}:${p.offset}`)
    .join('|')
  useEffect(() => {
    if (nodeId) updateNodeInternals(nodeId)
  }, [portSig, d.relationHandles, nodeId, updateNodeInternals, moveMode])

  const updatePortFromPointer = useCallback((portId: string, clientX: number, clientY: number) => {
    const el = rootRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    const flow = flowSizeFromScreenRect(rect.width, rect.height, zoom)
    const isBoundary = !!d.isBoundary
    const anchor = nearestBorderAnchor(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
      { isBoundary },
    )
    const offset = clampPortOffset(anchor.offset, anchor.side, flow.height, {
      isBoundary,
    })
    const clamped = { side: anchor.side, offset }
    setLocalPorts((prev) =>
      prev.map((p) =>
        p.id === portId ? { ...p, side: clamped.side, offset: clamped.offset } : p,
      ),
    )
    return clamped
  }, [d.isBoundary, zoom])

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

  const stopPortPointer = (e: ReactPointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
  }

  const onPortPointerDown = (
    port: PartPort,
    e: ReactPointerEvent,
  ) => {
    // Option+Shift — multi-select ports (no drag). Only pointerdown —
    // a paired mousedown would toggle select twice and cancel.
    if (
      isPortMultiSelectGesture({
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        moveMode,
        editLocked: !!d.editLocked,
      })
    ) {
      stopPortPointer(e)
      d.onPortSelect?.(port.id)
      return
    }

    // Option (macOS) / Alt — move port along parent border
    if (d.editLocked || (!e.altKey && !moveMode)) {
      return
    }

    stopPortPointer(e)

    draggingPortId.current = port.id
    document.body.classList.add('port-dragging')
    updatePortFromPointer(port.id, e.clientX, e.clientY)

    const onMove = (ev: PointerEvent) => {
      if (draggingPortId.current !== port.id) return
      updatePortFromPointer(port.id, ev.clientX, ev.clientY)
    }

    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (draggingPortId.current === port.id) {
        endPortDrag(port.id, ev.clientX, ev.clientY)
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const regions = nodeInlineStyles(d.formatStyle, d.viewMode || 'light', {
    isBoundary: d.isBoundary,
  })

  return (
    <div
      ref={rootRef}
      className={`part-node kind-${d.kind}${selected ? ' selected' : ''}${moveMode ? ' port-move-mode' : ''}${d.isBoundary ? ' boundary' : ''}${d.isReference ? ' is-reference' : ''}`}
      style={regions.root}
    >
      <NodeResizer
        minWidth={d.isBoundary ? 280 : 120}
        minHeight={d.isBoundary ? 160 : 72}
        isVisible={!!selected && !moveMode && !d.editLocked}
        lineClassName="part-resize-line"
        handleClassName="part-resize-handle"
      />
      <div ref={headerRef} className="part-node-header" style={regions.header}>
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
          <div className="part-node-title-row">
            <PartHeaderIcon iconName={headerIcon} />
            <span className="part-node-title">
              {d.label}
              {d.multiplicity ? ` [${d.multiplicity}]` : ''}
            </span>
          </div>
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
                        d.onOpenView?.(item.viewId, {
                          ctrlKey: e.ctrlKey,
                          metaKey: e.metaKey,
                        })
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
      <div className="part-node-body" style={regions.body}>
        <PartBodyIcon iconName={bodyIcon} maxPx={bodyIconMaxPx} />
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
        // Ports keep their own fill; do not inherit the part backgroundColor.
        const bg = portMode.backgroundColor
        const border = portMode.lineColor || parentMode.lineColor
        return (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={sideToPosition(port.side)}
          style={{
            ...offsetStyle(port.side, port.offset, !!d.isBoundary),
            zIndex: 5,
            cursor: moveMode ? 'move' : 'crosshair',
            ...(bg ? { background: bg } : {}),
            ...(border ? { borderColor: border } : {}),
          }}
          isConnectable={!moveMode}
          title={
            moveMode
              ? `${port.name} — dra längs kanten (Option+Shift = markera)`
              : `${port.name} — dra till annan port (Option = flytta, Option+Shift = markera)`
          }
          className={
            [
              moveMode ? 'port-handle-move' : 'port-handle-connect',
              'nodrag',
              'nopan',
              selectedPorts.has(port.id) ? 'port-handle-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')
          }
          onPointerDown={(e) => onPortPointerDown(port, e)}
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
            ...offsetStyle(port.side, port.offset, !!d.isBoundary),
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
      {(d.relationHandles || []).map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={sideToPosition(h.side)}
          style={{
            ...offsetStyle(h.side, h.offset),
            width: moveMode ? 10 : 8,
            height: moveMode ? 10 : 8,
            opacity: moveMode ? 0.85 : 0,
            background: moveMode ? 'var(--accent)' : 'transparent',
            border: moveMode ? '1px solid #fff' : 'none',
            pointerEvents: moveMode ? 'all' : 'none',
            zIndex: moveMode ? 5 : 0,
            cursor: moveMode ? 'move' : 'default',
          }}
          isConnectable={false}
          className={moveMode ? 'relation-handle-move' : undefined}
          onPointerDown={(e) => {
            if (!moveMode) return
            e.stopPropagation()
            e.preventDefault()
            const root = rootRef.current
            if (!root) return
            const end: 'source' | 'target' = h.type === 'source' ? 'source' : 'target'
            // artifact id encoded in handle id: rel-src-{id} / rel-tgt-{id}
            const prefix = h.type === 'source' ? 'rel-src-' : 'rel-tgt-'
            const artifactId = h.id.startsWith(prefix) ? h.id.slice(prefix.length) : ''
            if (!artifactId || !d.onRelationEndDrag) return
            let last = { side: h.side, offset: h.offset }
            const readAnchor = (ev: PointerEvent) => {
              const rect = root.getBoundingClientRect()
              const localX =
                ((ev.clientX - rect.left) / rect.width) * root.offsetWidth
              const localY =
                ((ev.clientY - rect.top) / rect.height) * root.offsetHeight
              const inside = pointerInsideNodeBox(
                localX,
                localY,
                root.offsetWidth,
                root.offsetHeight,
              )
              return {
                ...nearestBorderAnchor(
                  localX,
                  localY,
                  root.offsetWidth,
                  root.offsetHeight,
                ),
                inside,
              }
            }
            const onMove = (ev: PointerEvent) => {
              const next = readAnchor(ev)
              if (!next.inside) return
              last = { side: next.side, offset: next.offset }
              d.onRelationEndDrag?.(artifactId, end, last.side, last.offset, false)
            }
            const onUp = () => {
              window.removeEventListener('pointermove', onMove)
              window.removeEventListener('pointerup', onUp)
              d.onRelationEndDrag?.(artifactId, end, last.side, last.offset, true)
            }
            window.addEventListener('pointermove', onMove)
            window.addEventListener('pointerup', onUp)
          }}
        />
      ))}
    </div>
  )
}
