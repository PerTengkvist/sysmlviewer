import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  useReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  angularPathD,
  angularSegmentHandles,
  clampWaypointsToFlow,
  defaultFlowWaypoints,
  moveAngularSegment,
  moveWaypointInFlow,
  resolveRoutePoints,
  type FlowBounds,
  type Pt,
} from './edgeRouting'

export type SysmlEdgeData = {
  artifactId: string
  routing: 'angular' | 'direct' | 'spline' | string
  waypoints?: Pt[]
  labelOffset?: { x: number; y: number } | null
  altHeld?: boolean
  /** Absolute flow rect of parent whitebox; clamps routing when set. */
  parentBounds?: FlowBounds
  /** Edge lives inside a whitebox parent (waypoints track parent moves). */
  internal?: boolean
  onWaypointsChange?: (artifactId: string, waypoints: Pt[]) => void
  onLabelOffsetChange?: (
    artifactId: string,
    offset: { x: number; y: number },
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
  label,
  data,
}: EdgeProps) {
  const d = (data || {}) as SysmlEdgeData
  const routing = d.routing || 'angular'
  const altHeld = !!d.altHeld
  const bounds = useMemo<FlowBounds>(() => {
    const b = d.parentBounds
    if (!b) return LOOSE_BOUNDS
    return b
  }, [
    d.parentBounds?.minX,
    d.parentBounds?.minY,
    d.parentBounds?.maxX,
    d.parentBounds?.maxY,
  ])
  const { screenToFlowPosition } = useReactFlow()

  const [localWps, setLocalWps] = useState<Pt[]>(() => d.waypoints || [])
  const [labelOff, setLabelOff] = useState(() => ({
    x: d.labelOffset?.x ?? 0,
    y: d.labelOffset?.y ?? 0,
  }))

  useEffect(() => {
    setLocalWps(d.waypoints || [])
  }, [d.waypoints])

  useEffect(() => {
    setLabelOff({
      x: d.labelOffset?.x ?? 0,
      y: d.labelOffset?.y ?? 0,
    })
  }, [d.labelOffset?.x, d.labelOffset?.y])

  const displayWps = useMemo(() => {
    if (routing !== 'angular') return []
    const raw = localWps.length > 0 ? localWps : d.waypoints || []
    if (raw.length > 0) return clampWaypointsToFlow(raw, bounds)
    // Unsaved default route corners (so segment drag has something to persist)
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
    const p = angularPathD(points)
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
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {label != null && label !== '' && (
        <EdgeLabelRenderer>
          <div
            className={`nodrag nopan edge-label${altHeld ? ' editable' : ''}`}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX + labelOff.x}px,${labelY + labelOff.y}px)`,
              pointerEvents: altHeld ? 'all' : 'none',
              zIndex: 1002,
            }}
            onPointerDown={onLabelPointerDown}
            title={altHeld ? 'Drag to move connection name' : undefined}
          >
            {String(label)}
          </div>
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
