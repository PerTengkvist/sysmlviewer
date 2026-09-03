import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  angularSegmentHandles,
  clampWaypointsToFlow,
  defaultFlowWaypoints,
  moveAngularSegment,
  moveWaypointInFlow,
  reattachWaypointsToEnds,
  resolveRoutePoints,
  type FlowBounds,
  type Pt,
} from './edgeRouting'
import {
  angularPathDWithJumps,
  type PathJump,
} from './layout/connectionSeparation'
import { boundaryFlowBounds } from './layout/connectionRouting'
import { nearestBorderAnchor, pointerInsideNodeBox } from './PartNode'
import { absoluteNodeOrigin } from './modes/structure/buildStructureGraph'

export type SysmlEdgeData = {
  artifactId: string
  routing: 'angular' | 'direct' | 'spline' | string
  waypoints?: Pt[]
  jumps?: PathJump[]
  labelOffset?: { x: number; y: number } | null
  altHeld?: boolean
  /** Absolute flow rect of parent whitebox; clamps routing when set. */
  parentBounds?: FlowBounds
  /** Edge lives inside a whitebox parent (waypoints track parent moves). */
  internal?: boolean
  labelColor?: string
  selectedColor?: string
  selectedLinewidth?: number
  onWaypointsChange?: (artifactId: string, waypoints: Pt[]) => void
  onLabelOffsetChange?: (
    artifactId: string,
    offset: { x: number; y: number },
  ) => void
  /** Select this connection (used by mid-path handles on direct/spline). */
  onSelect?: (artifactId: string) => void
  relationKind?: string
  manualAttachment?: boolean
  sourceOffset?: number
  targetOffset?: number
  markerStartKind?: string
  onRelationEndMoved?: (
    artifactId: string,
    end: 'source' | 'target',
    side: import('../../api').PortSide,
    offset: number,
    /** false while dragging; true on pointer-up (persist to server). */
    persist?: boolean,
  ) => void
}

const LOOSE_BOUNDS: FlowBounds = {
  minX: -5000,
  minY: -5000,
  maxX: 5000,
  maxY: 5000,
}

export function SysmlEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  markerStart,
  label,
  data,
  selected,
  source,
  target,
}: EdgeProps) {
  const d = (data || {}) as SysmlEdgeData
  const routing = d.routing || 'angular'
  const altHeld = !!d.altHeld
  const { screenToFlowPosition, getNode, getNodes } = useReactFlow()
  const strokeStyle = useMemo(() => {
    if (!selected) return style
    return {
      ...style,
      stroke: d.selectedColor || '#2563eb',
      strokeWidth: d.selectedLinewidth ?? Math.max(4, Number(style?.strokeWidth) * 2 || 4),
    }
  }, [selected, style, d.selectedColor, d.selectedLinewidth])
  const liveBoundary = useStore((state) => boundaryFlowBounds(state.nodes))
  const bounds = useMemo<FlowBounds>(() => {
    if (!d.internal && !d.parentBounds) return LOOSE_BOUNDS
    if (liveBoundary) return liveBoundary
    if (d.parentBounds) return d.parentBounds
    return LOOSE_BOUNDS
  }, [
    d.internal,
    d.parentBounds,
    liveBoundary?.minX,
    liveBoundary?.minY,
    liveBoundary?.maxX,
    liveBoundary?.maxY,
  ])

  const [localWps, setLocalWps] = useState<Pt[]>(() => d.waypoints || [])
  const [labelOff, setLabelOff] = useState(() => ({
    x: d.labelOffset?.x ?? 0,
    y: d.labelOffset?.y ?? 0,
  }))

  useEffect(() => {
    setLocalWps(d.waypoints || [])
  }, [d.waypoints])

  // When port endpoints move, re-attach to nearest point on the existing route
  // (do not discard unlocked corners — that made wires jump to a default L).
  useEffect(() => {
    setLocalWps((prev) => {
      if (!prev.length) return prev
      const first = prev[0]
      const last = prev[prev.length - 1]
      const startOk =
        Math.abs(first.x - sourceX) < 0.75 || Math.abs(first.y - sourceY) < 0.75
      const endOk =
        Math.abs(last.x - targetX) < 0.75 || Math.abs(last.y - targetY) < 0.75
      if (startOk && endOk) return prev
      return reattachWaypointsToEnds(
        sourceX,
        sourceY,
        targetX,
        targetY,
        prev,
      )
    })
  }, [sourceX, sourceY, targetX, targetY])

  useEffect(() => {
    setLabelOff({
      x: d.labelOffset?.x ?? 0,
      y: d.labelOffset?.y ?? 0,
    })
  }, [d.labelOffset?.x, d.labelOffset?.y])

  // Cheap display path only — never A*/obstacle search here (that belongs in Redraw).
  const displayWps = useMemo(() => {
    if (routing !== 'angular') return []
    const raw = localWps.length > 0 ? localWps : d.waypoints || []
    if (raw.length > 0) return clampWaypointsToFlow(raw, bounds)
    return defaultFlowWaypoints(sourceX, sourceY, targetX, targetY, bounds)
  }, [
    routing,
    localWps,
    d.waypoints,
    bounds,
    sourceX,
    sourceY,
    targetX,
    targetY,
  ])

  const points = useMemo(() => {
    if (routing !== 'angular') return []
    return resolveRoutePoints(
      sourceX,
      sourceY,
      targetX,
      targetY,
      displayWps,
    )
  }, [routing, sourceX, sourceY, targetX, targetY, displayWps])

  const segments = useMemo(
    () => (routing === 'angular' ? angularSegmentHandles(points) : []),
    [routing, points],
  )

  const { path, labelX, labelY } = useMemo(() => {
    if (routing === 'direct') {
      return {
        path: `M ${sourceX},${sourceY} L ${targetX},${targetY}`,
        labelX: (sourceX + targetX) / 2,
        labelY: (sourceY + targetY) / 2,
      }
    }
    if (routing === 'spline') {
      const [p, lx, ly] = getBezierPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
      })
      return { path: p, labelX: lx, labelY: ly }
    }
    const p = angularPathDWithJumps(points, d.jumps || [], 5)
    const mid = points[Math.floor(points.length / 2)] || {
      x: (sourceX + targetX) / 2,
      y: (sourceY + targetY) / 2,
    }
    return { path: p, labelX: mid.x, labelY: mid.y }
  }, [
    routing,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    points,
    d.jumps,
  ])

  const commit = useCallback(
    (next: Pt[]) => {
      const clamped = clampWaypointsToFlow(next, bounds)
      setLocalWps(clamped)
      d.onWaypointsChange?.(d.artifactId || id, clamped)
    },
    [bounds, d, id],
  )

  const onLabelPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!altHeld) return
      e.preventDefault()
      e.stopPropagation()
      const startOff = { ...labelOff }
      const origin = screenToFlowPosition({ x: e.clientX, y: e.clientY })

      const move = (ev: PointerEvent) => {
        const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
        setLabelOff({
          x: startOff.x + (flow.x - origin.x),
          y: startOff.y + (flow.y - origin.y),
        })
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
        const next = {
          x: startOff.x + (flow.x - origin.x),
          y: startOff.y + (flow.y - origin.y),
        }
        setLabelOff(next)
        // Ignore clicks without a real drag — avoids accidental routing side-effects.
        if (Math.hypot(next.x - startOff.x, next.y - startOff.y) < 2) return
        d.onLabelOffsetChange?.(d.artifactId || id, next)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [altHeld, d, id, labelOff, screenToFlowPosition],
  )

  const onWpPointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      if (!altHeld) return
      e.preventDefault()
      e.stopPropagation()
      const start = displayWps
      setLocalWps(start)

      const move = (ev: PointerEvent) => {
        const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
        setLocalWps((prev) =>
          moveWaypointInFlow(prev.length ? prev : start, index, flow, bounds),
        )
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
        setLocalWps((prev) => {
          const next = moveWaypointInFlow(
            prev.length ? prev : start,
            index,
            flow,
            bounds,
          )
          commit(next)
          return next
        })
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [altHeld, bounds, commit, displayWps, screenToFlowPosition],
  )

  const onSegPointerDown = useCallback(
    (segmentIndex: number, e: React.PointerEvent) => {
      if (!altHeld || routing !== 'angular') return
      e.preventDefault()
      e.stopPropagation()
      const start = displayWps
      setLocalWps(start)

      const move = (ev: PointerEvent) => {
        const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
        // Always derive from the gesture start so segmentIndex stays valid.
        setLocalWps(
          moveAngularSegment(
            sourceX,
            sourceY,
            targetX,
            targetY,
            start,
            segmentIndex,
            flow,
            bounds,
          ),
        )
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        const flow = screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
        const next = moveAngularSegment(
          sourceX,
          sourceY,
          targetX,
          targetY,
          start,
          segmentIndex,
          flow,
          bounds,
        )
        commit(next)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [
      altHeld,
      bounds,
      commit,
      displayWps,
      routing,
      screenToFlowPosition,
      sourceX,
      sourceY,
      targetX,
      targetY,
    ],
  )

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={strokeStyle}
        markerEnd={markerEnd}
        markerStart={markerStart}
        interactionWidth={24}
      />
      {altHeld && d.onRelationEndMoved && d.relationKind && d.relationKind !== 'connection' && (
        <EdgeLabelRenderer>
          {(['source', 'target'] as const).map((end) => {
            const x = end === 'source' ? sourceX : targetX
            const y = end === 'source' ? sourceY : targetY
            const nodeId = end === 'source' ? source : target
            return (
              <div
                key={end}
                className="nodrag nopan edge-waypoint editable relation-end-grip"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${x}px,${y}px)`,
                  pointerEvents: 'all',
                  cursor: 'move',
                  zIndex: 1003,
                }}
                title="Option-drag along part boundary"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  const node = getNode(nodeId)
                  if (!node) return
                  const width =
                    Number(node.style?.width ?? node.width ?? node.measured?.width) ||
                    180
                  const height =
                    Number(
                      node.style?.height ?? node.height ?? node.measured?.height,
                    ) || 110
                  const readAnchor = (ev: PointerEvent) => {
                    const flow = screenToFlowPosition({
                      x: ev.clientX,
                      y: ev.clientY,
                    })
                    // Nested whitebox parts use parent-relative position; walk to
                    // absolute flow so the pointer maps onto the true boundary.
                    const byId = new Map(getNodes().map((n) => [n.id, n]))
                    const origin = absoluteNodeOrigin(node, byId)
                    const localX = flow.x - origin.x
                    const localY = flow.y - origin.y
                    const inside = pointerInsideNodeBox(
                      localX,
                      localY,
                      width,
                      height,
                    )
                    return {
                      ...nearestBorderAnchor(localX, localY, width, height),
                      inside,
                    }
                  }
                  let last = readAnchor(e.nativeEvent)
                  d.onRelationEndMoved?.(
                    d.artifactId,
                    end,
                    last.side,
                    last.offset,
                    false,
                  )
                  const onMove = (ev: PointerEvent) => {
                    const next = readAnchor(ev)
                    // Outside the box: freeze at last on-boundary preview
                    // (avoids diagonal corner jumps).
                    if (!next.inside) return
                    last = next
                    d.onRelationEndMoved?.(
                      d.artifactId,
                      end,
                      last.side,
                      last.offset,
                      false,
                    )
                  }
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                    // Persist the displayed boundary point, not a re-sample outside.
                    d.onRelationEndMoved?.(
                      d.artifactId,
                      end,
                      last.side,
                      last.offset,
                      true,
                    )
                  }
                  window.addEventListener('pointermove', onMove)
                  window.addEventListener('pointerup', onUp)
                }}
              />
            )
          })}
        </EdgeLabelRenderer>
      )}
      {label != null && label !== '' && (
        <EdgeLabelRenderer>
          <>
            {Math.hypot(labelOff.x, labelOff.y) > 0.5 && (
              <svg
                className="edge-label-leader"
                style={{
                  position: 'absolute',
                  overflow: 'visible',
                  pointerEvents: 'none',
                  zIndex: 1000,
                  left: 0,
                  top: 0,
                }}
              >
                <line
                  x1={labelX}
                  y1={labelY}
                  x2={labelX + labelOff.x}
                  y2={labelY + labelOff.y}
                  className="edge-label-leader-line"
                />
                <circle
                  cx={labelX}
                  cy={labelY}
                  r={2.5}
                  className="edge-label-leader-anchor"
                />
              </svg>
            )}
            <div
              className={`nodrag nopan edge-label${altHeld ? ' editable' : ''}`}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX + labelOff.x}px,${labelY + labelOff.y}px)`,
                pointerEvents: altHeld ? 'all' : 'none',
                zIndex: 1002,
                ...(d.labelColor ? { color: d.labelColor } : {}),
              }}
              onPointerDown={onLabelPointerDown}
              title={altHeld ? 'Drag to move connection name' : undefined}
            >
              {String(label)}
            </div>
          </>
        </EdgeLabelRenderer>
      )}
      {(routing === 'direct' || routing === 'spline') && altHeld && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan edge-waypoint editable${selected ? ' selected' : ''}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              cursor: 'move',
              zIndex: 1001,
            }}
            title="Drag to move connection name; click to select"
            onPointerDown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              d.onSelect?.(d.artifactId || id)
              onLabelPointerDown(e)
            }}
          />
        </EdgeLabelRenderer>
      )}
      {routing === 'angular' &&
        altHeld &&
        segments.map((seg) => (
          <EdgeLabelRenderer key={`${id}-seg-${seg.index}`}>
            <div
              className={`edge-segment-handle ${seg.orient}`}
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${seg.mid.x}px,${seg.mid.y}px)`,
                pointerEvents: 'all',
                cursor: seg.orient === 'v' ? 'ew-resize' : 'ns-resize',
                zIndex: 1000,
              }}
              onPointerDown={(e) => onSegPointerDown(seg.index, e)}
              title={
                seg.orient === 'v'
                  ? 'Drag left/right'
                  : 'Drag up/down'
              }
            />
          </EdgeLabelRenderer>
        ))}
      {routing === 'angular' &&
        altHeld &&
        displayWps.map((wp, index) => (
          <EdgeLabelRenderer key={`${id}-wp-${index}`}>
            <div
              className="edge-waypoint editable"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${wp.x}px,${wp.y}px)`,
                pointerEvents: 'all',
                cursor: 'move',
                zIndex: 1001,
              }}
              onPointerDown={(e) => onWpPointerDown(index, e)}
              title="Drag to move connection point"
            />
          </EdgeLabelRenderer>
        ))}
    </>
  )
}
