import {
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type OnConnect,
  type OnNodeDrag,
  type OnNodesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DiagramMode,
  PortSide,
  RoutingType,
  ViewPayload,
  VisualizationEdge,
  VisualizationNode,
} from '../../api'
import type { ViewMode } from '../../settings'
import type { ProjectSheet } from '../sheet/sheet'
import { paperSizeMm } from '../sheet/sheet'
import { PartNode, type PartNodeData } from './PartNode'
import { SysmlEdge, type SysmlEdgeData } from './InternalEdge'
import {
  translateFlowBounds,
  translatePoints,
  type FlowBounds,
  type Pt,
} from './edgeRouting'
import { EdgeMarkerDefs } from './EdgeMarkerDefs'
import { buildStructureGraph, orientRelationBoundaryHandles, applyRelationHandlesToNodes } from './modes/structure/buildStructureGraph'
import { buildSequenceGraph } from './modes/sequence/buildSequenceGraph'
import { LifelineNode } from './modes/sequence/LifelineNode'
import { MessageEdge } from './modes/sequence/MessageEdge'
import { buildStateGraph } from './modes/state/buildStateGraph'
import { StateNode } from './modes/state/StateNode'
import { buildActionFlowGraph } from './modes/actionFlow/buildActionFlowGraph'
import { ActionNode } from './modes/actionFlow/ActionNode'
import { buildTreeGraph } from './modes/tree/buildTreeGraph'
import { TreeDiagramNode } from './modes/tree/TreeNode'
import { buildAllocationGraph } from './modes/allocation/buildAllocationGraph'
import {
  layoutByDependency,
  orientEdgeHandles,
  type RedrawDirection,
} from './layout/dependencyLayout'
import { redrawStructureConnections, boundaryFlowBounds, syncInternalEdgeBounds } from './layout/connectionRouting'
import { autoLayoutStructure } from './layout/structureAutoLayout'

/** All custom types registered together — React Flow caches nodeTypes on mount. */
const allNodeTypes: NodeTypes = {
  part: PartNode,
  lifeline: LifelineNode,
  state: StateNode,
  action: ActionNode,
  tree: TreeDiagramNode,
}

const allEdgeTypes: EdgeTypes = {
  sysml: SysmlEdge,
  message: MessageEdge,
}

function FitViewOnViewKey({
  viewKey,
  layoutEpoch,
  onReady,
}: {
  viewKey: string | null
  layoutEpoch: number
  onReady?: () => void
}) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (!viewKey) return
    const id = requestAnimationFrame(() => {
      fitView({ padding: 0.15, duration: 0 })
      if (onReady) {
        requestAnimationFrame(() => onReady())
      }
    })
    return () => cancelAnimationFrame(id)
  }, [viewKey, layoutEpoch, fitView, onReady])
  return null
}

export const DIAGRAM_MODE_LABELS: Record<DiagramMode, string> = {
  whitebox: 'Interconnection',
  structure: 'Structure',
  sequence: 'Sequence',
  state: 'State',
  actionFlow: 'Action flow',
  tree: 'Tree',
  allocation: 'Allocation',
}

function routingToConnectionLine(routing: RoutingType): ConnectionLineType {
  switch (routing) {
    case 'direct':
      return ConnectionLineType.Straight
    case 'spline':
      return ConnectionLineType.Bezier
    default:
      return ConnectionLineType.SmoothStep
  }
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
}

/** Skip auto-route on view open when saved connection geometry exists. */
function viewHasSavedConnectionLayout(
  edges: Record<string, VisualizationEdge>,
): boolean {
  return Object.values(edges).some((e) => (e.waypoints?.length ?? 0) > 0)
}

function readPx(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function nodeExtentSize(n: Node): { width?: number; height?: number } {
  const width =
    readPx(n.style?.width) ?? readPx(n.width) ?? readPx(n.measured?.width)
  const height =
    readPx(n.style?.height) ?? readPx(n.height) ?? readPx(n.measured?.height)
  return { width, height }
}

type Props = {
  view: ViewPayload | null
  diagramEpoch: number
  viewMode?: ViewMode
  showAttributes?: boolean
  structureNotation?: import('../../settings').StructureNotation
  /** Global Settings default; per-view override lives on view payload. */
  globalHierarchicalLevels?: number
  sheet?: ProjectSheet
  selectedConnectionColor?: string
  selectedConnectionLinewidth?: number
  connectionSeparation?: number
  onSelectArtifact: (id: string | null) => void
  onOpenView: (viewId: string) => void
  onHierarchyOverrideChange?: (override: number | null) => void
  onNodesMoved: (
    nodes: Record<string, Partial<VisualizationNode>>,
    edges?: Record<string, Partial<VisualizationEdge>>,
  ) => void
  onPortMoved: (portId: string, side: PortSide, offset: number) => void
  onRelationEndMoved?: (
    artifactId: string,
    end: 'source' | 'target',
    side: PortSide,
    offset: number,
    companion?: { side: PortSide; offset: number },
  ) => void
  onConnectPorts: (sourcePortId: string, targetPortId: string) => void
  onWaypointsMoved: (
    connectionId: string,
    waypoints: { x: number; y: number; locked?: boolean }[],
  ) => void
  onLabelOffsetMoved: (
    connectionId: string,
    offset: { x: number; y: number },
  ) => void
  /** Bump `seq` to trigger obstacle-aware reroute for one connection (Autoroute). */
  autorouteRequest?: { connectionId: string; seq: number } | null
  /** Read-only rendering for print output. */
  printMode?: boolean
  onPrintReady?: () => void
}

export function DiagramCanvas({
  view,
  diagramEpoch,
  viewMode = 'light',
  showAttributes = false,
  structureNotation = 'sysmlv2',
  globalHierarchicalLevels = 2,
  sheet,
  selectedConnectionColor = '#2563eb',
  selectedConnectionLinewidth = 4,
  connectionSeparation = 5,
  onSelectArtifact,
  onOpenView,
  onHierarchyOverrideChange,
  onNodesMoved,
  onPortMoved,
  onRelationEndMoved,
  onConnectPorts,
  onWaypointsMoved,
  onLabelOffsetMoved,
  autorouteRequest,
  printMode = false,
  onPrintReady,
}: Props) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [portMoveMode, setPortMoveMode] = useState(false)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [flowDir, setFlowDir] = useState<RedrawDirection>('LR')
  const viewKeyRef = useRef<string | null>(null)
  const viewRef = useRef(view)
  const edgesRef = useRef<Edge[]>([])
  const nodesRef = useRef<Node[]>([])
  viewRef.current = view
  edgesRef.current = edges
  nodesRef.current = nodes
  const onOpenViewRef = useRef(onOpenView)
  const onPortMovedRef = useRef(onPortMoved)
  const onRelationEndMovedRef = useRef(onRelationEndMoved)
  const onConnectPortsRef = useRef(onConnectPorts)
  const onWaypointsMovedRef = useRef(onWaypointsMoved)
  const onLabelOffsetMovedRef = useRef(onLabelOffsetMoved)
  const onNodesMovedRef = useRef(onNodesMoved)
  const onSelectArtifactRef = useRef(onSelectArtifact)
  const redrawConnectionsRef = useRef<
    (overrideNodes?: Node[], overrideEdges?: Edge[]) => void
  >(() => {})
  const applyRedrawConnectionsRef = useRef<
    (overrideNodes?: Node[], overrideEdges?: Edge[]) => void
  >(() => {})
  const handlePortMovedRef = useRef<
    (portId: string, side: PortSide, offset: number) => void
  >(() => {})
  const handleRelationEndDragRef = useRef<
    (
      artifactId: string,
      end: 'source' | 'target',
      side: PortSide,
      offset: number,
      persist?: boolean,
    ) => void
  >(() => {})
  const lastAutorouteSeqRef = useRef(0)
  /** Structure graph awaiting one-shot obstacle routing after view open. */
  const pendingAutoRouteRef = useRef<{
    nodes: Node[]
    edges: Edge[]
    viewKey: string
  } | null>(null)
  onOpenViewRef.current = onOpenView
  onPortMovedRef.current = onPortMoved
  onRelationEndMovedRef.current = onRelationEndMoved
  onConnectPortsRef.current = onConnectPorts
  onWaypointsMovedRef.current = onWaypointsMoved
  onLabelOffsetMovedRef.current = onLabelOffsetMoved
  onNodesMovedRef.current = onNodesMoved
  onSelectArtifactRef.current = onSelectArtifact

  type BoundaryDragSnapshot = {
    nodeId: string
    originX: number
    originY: number
    edges: Record<string, { waypoints: Pt[]; parentBounds?: FlowBounds }>
  }
  const boundaryDragRef = useRef<BoundaryDragSnapshot | null>(null)

  const mode: DiagramMode = view?.diagramMode || 'structure'
  const isStructure = mode === 'whitebox' || mode === 'structure'

  useEffect(() => {
    if (!printMode || !onPrintReady || !view?.modeError) return
    const id = requestAnimationFrame(() => onPrintReady())
    return () => cancelAnimationFrame(id)
  }, [printMode, onPrintReady, view?.modeError])

  useEffect(() => {
    setCollapsedIds(new Set())
  }, [view?.view.id])

  useEffect(() => {
    const isOption = (e: KeyboardEvent) =>
      e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight'

    const onKeyDown = (e: KeyboardEvent) => {
      if (isOption(e)) setPortMoveMode(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (isOption(e)) setPortMoveMode(false)
    }
    const clear = () => setPortMoveMode(false)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', clear)
    }
  }, [])

  const edgeSig = view
    ? Object.entries(view.visualization.edges)
        .map(([id, e]) => {
          const st = e.style ? JSON.stringify(e.style) : ''
          const att = `${e.sourceSide || ''}:${e.sourceOffset ?? ''}:${e.targetSide || ''}:${e.targetOffset ?? ''}`
          // Omit routing, waypoints and labelOffset — synced without rebuilding graph.
          return `${id}:st${st}:att${att}`
        })
        .sort()
        .join('|')
    : ''

  const routingSig = view
    ? Object.entries(view.visualization.edges)
        .map(([id, e]) => `${id}:${e.routing || 'angular'}`)
        .sort()
        .join('|')
    : ''

  const waypointSig = view
    ? Object.entries(view.visualization.edges)
        .map(([id, e]) => {
          const lo = e.labelOffset || { x: 0, y: 0 }
          return `${id}:${(e.waypoints || [])
            .map((w) => `${w.x},${w.y},${w.locked ? 1 : 0}`)
            .join(';')}:lo${lo.x},${lo.y}`
        })
        .sort()
        .join('|')
    : ''

  const nodeStyleSig = view
    ? Object.entries(view.visualization.nodes)
        .map(([id, n]) => `${id}:${n.style ? JSON.stringify(n.style) : ''}`)
        .sort()
        .join('|')
    : ''

  const collapseSig = [...collapsedIds].sort().join(',')

  // flowDir is applied by redraw / buildActionFlowGraph; omit from viewKey so
  // Redraw does not rebuild from stale visualization and wipe layout positions.
  const viewKey = view
    ? `${diagramEpoch}|${view.view.id}|${view.diagramMode ?? ''}|${showAttributes}|${viewMode}|${structureNotation}|${edgeSig}|${nodeStyleSig}|${collapseSig}|${selectedConnectionColor}|${selectedConnectionLinewidth}|${Object.keys(view.semantic).sort().join(',')}`
    : null

  const flowDirRef = useRef(flowDir)
  flowDirRef.current = flowDir

  useEffect(() => {
    if (!view) {
      setNodes([])
      setEdges([])
      viewKeyRef.current = null
      return
    }

    const stableOpen = (id: string) => onOpenViewRef.current(id)
    const stablePort = (portId: string, side: PortSide, offset: number) =>
      handlePortMovedRef.current(portId, side, offset)
    const stableWp = (id: string, wps: { x: number; y: number }[]) =>
      onWaypointsMovedRef.current(id, wps)
    const stableLabel = (id: string, offset: { x: number; y: number }) =>
      onLabelOffsetMovedRef.current(id, offset)
    // Used only as a build-time placeholder; edges remap to handleRelationEndDrag
    // so mid-drag updates stay local (persist=false) until pointer-up.
    const stableRelEnd = (
      artifactId: string,
      end: 'source' | 'target',
      side: PortSide,
      offset: number,
      persist = true,
    ) =>
      handleRelationEndDragRef.current(artifactId, end, side, offset, persist)
    const toggleCollapse = (id: string) => {
      setCollapsedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    }

    let built: { nodes: Node[]; edges: Edge[] }
    switch (view.diagramMode) {
      case 'sequence':
        built = buildSequenceGraph(view, viewMode)
        break
      case 'state':
        built = buildStateGraph(view, viewMode)
        break
      case 'actionFlow':
        built = buildActionFlowGraph(view, viewMode, flowDirRef.current)
        break
      case 'tree':
        built = buildTreeGraph(view, viewMode, collapsedIds, toggleCollapse)
        break
      case 'allocation':
        built = buildAllocationGraph({
          view,
          viewMode,
          showAttributes,
          portMoveMode,
          selectedConnectionColor: selectedConnectionColor || '#7c3aed',
          selectedConnectionLinewidth,
          onOpenView: stableOpen,
          onPortMoved: stablePort,
          onWaypointsChange: stableWp,
          onLabelOffsetChange: stableLabel,
          onSelectConnection: (id: string) => onSelectArtifactRef.current(id),
        })
        break
      default:
        built = buildStructureGraph({
          view,
          onOpenView: stableOpen,
          onPortMoved: stablePort,
          portMoveMode,
          showAttributes,
          viewMode,
          structureNotation,
          selectedConnectionColor,
          selectedConnectionLinewidth,
          onWaypointsChange: stableWp,
          onLabelOffsetChange: stableLabel,
          onSelectConnection: (id: string) => onSelectArtifactRef.current(id),
          onRelationEndMoved: stableRelEnd,
        })
    }
    setNodes(
      built.nodes.map((node) => ({
        ...node,
        draggable: !portMoveMode,
        data: {
          ...(node.data as PartNodeData),
          portMoveMode,
          onOpenView: (id: string) => onOpenViewRef.current(id),
          onPortDrag: (portId: string, side: PortSide, offset: number) =>
            handlePortMovedRef.current(portId, side, offset),
          onRelationEndDrag: (
            artifactId: string,
            end: 'source' | 'target',
            side: PortSide,
            offset: number,
            persist?: boolean,
          ) =>
            handleRelationEndDragRef.current(
              artifactId,
              end,
              side,
              offset,
              persist,
            ),
        },
      })),
    )
    setEdges(
      built.edges.map((edge) => ({
        ...edge,
        data: {
          ...(edge.data as object),
          altHeld: portMoveMode,
          onRelationEndMoved: (
            artifactId: string,
            end: 'source' | 'target',
            side: PortSide,
            offset: number,
            persist = true,
          ) =>
            handleRelationEndDragRef.current(
              artifactId,
              end,
              side,
              offset,
              persist,
            ),
        },
      })),
    )
    const isStructureMode =
      view.diagramMode === 'whitebox' ||
      view.diagramMode === 'structure' ||
      !view.diagramMode
    // One-shot route only when switching to a different view id, not on
    // style/routing/label/attribute toggles that also change viewKey.
    const prevKey = viewKeyRef.current
    const prevViewId = prevKey?.split('|')[1]
    const nextViewId = view.view.id
    if (
      isStructureMode &&
      viewKey &&
      prevViewId !== nextViewId &&
      !printMode &&
      !viewHasSavedConnectionLayout(view.visualization.edges)
    ) {
      pendingAutoRouteRef.current = {
        nodes: built.nodes,
        edges: built.edges,
        viewKey,
      }
    }
    viewKeyRef.current = viewKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, showAttributes, viewMode])

  // Sync routing into edges without resetting part/port layout.
  useEffect(() => {
    const v = viewRef.current
    if (!v || !isStructure) return
    setEdges((current) =>
      current.map((edge) => {
        const viz = v.visualization.edges[edge.id]
        if (!viz) return edge
        const data = (edge.data || {}) as SysmlEdgeData
        // Prefer explicit viz routing; otherwise keep the live edge routing
        // (synthetic/deps default to direct — never promote missing → angular).
        const routing = viz.routing ?? data.routing ?? 'direct'
        if ((data.routing || 'direct') === routing) return edge
        return {
          ...edge,
          data: {
            ...data,
            routing,
          } satisfies SysmlEdgeData,
        }
      }),
    )
  }, [routingSig, isStructure])

  // Sync waypoints into edges without resetting part/port layout.
  useEffect(() => {
    const v = viewRef.current
    if (!v || !isStructure) return
    setEdges((current) =>
      current.map((edge) => {
        const viz = v.visualization.edges[edge.id]
        if (!viz) return edge
        const data = (edge.data || {}) as SysmlEdgeData
        return {
          ...edge,
          data: {
            ...data,
            routing: viz.routing || data.routing,
            waypoints: viz.waypoints || [],
            labelOffset: viz.labelOffset ?? data.labelOffset,
          } satisfies SysmlEdgeData,
        }
      }),
    )
  }, [waypointSig, isStructure])

  useEffect(() => {
    if (!isStructure) return
    setNodes((current) => {
      if (!current.length) return current
      return current.map((node) => ({
        ...node,
        draggable: !portMoveMode,
        data: {
          ...(node.data as PartNodeData),
          portMoveMode,
          onOpenView: (id: string) => onOpenViewRef.current(id),
          onPortDrag: (portId: string, side: PortSide, offset: number) =>
            handlePortMovedRef.current(portId, side, offset),
          onRelationEndDrag: (
            artifactId: string,
            end: 'source' | 'target',
            side: PortSide,
            offset: number,
            persist?: boolean,
          ) =>
            handleRelationEndDragRef.current(
              artifactId,
              end,
              side,
              offset,
              persist,
            ),
        },
      }))
    })
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        data: {
          ...(edge.data as object),
          altHeld: portMoveMode,
          onRelationEndMoved: (
            artifactId: string,
            end: 'source' | 'target',
            side: PortSide,
            offset: number,
            persist = true,
          ) =>
            handleRelationEndDragRef.current(
              artifactId,
              end,
              side,
              offset,
              persist,
            ),
        },
      })),
    )
  }, [portMoveMode, isStructure])

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const next = applyNodeChanges(changes, nds)
        const boundaryResized = changes.some((c) => {
          if (c.type !== 'dimensions' || !c.dimensions) return false
          const node = next.find((n) => n.id === c.id)
          return !!(node?.data as PartNodeData | undefined)?.isBoundary
        })
        if (boundaryResized) {
          setEdges((current) => syncInternalEdgeBounds(next, current))
        }
        return next
      })

      const resized = changes.filter(
        (c): c is Extract<NodeChange, { type: 'dimensions' }> =>
          c.type === 'dimensions' && c.resizing === false && !!c.dimensions,
      )
      if (!resized.length) return

      const patch: Record<string, Partial<VisualizationNode>> = {}
      for (const c of resized) {
        patch[c.id] = {
          artifactId: c.id,
          width: c.dimensions!.width,
          height: c.dimensions!.height,
        }
      }
      for (const c of changes) {
        if (c.type === 'position' && c.position && patch[c.id]) {
          patch[c.id].x = c.position.x
          patch[c.id].y = c.position.y
        }
      }
      onNodesMoved(patch)
    },
    [onNodesMoved],
  )

  const applyBoundaryEdgeDelta = useCallback((dx: number, dy: number) => {
    const snap = boundaryDragRef.current
    if (!snap) return
    setEdges((current) =>
      current.map((edge) => {
        const base = snap.edges[edge.id]
        if (!base) return edge
        const data = edge.data as SysmlEdgeData
        return {
          ...edge,
          data: {
            ...data,
            waypoints: translatePoints(base.waypoints, dx, dy),
            parentBounds: base.parentBounds
              ? translateFlowBounds(base.parentBounds, dx, dy)
              : data.parentBounds,
          } satisfies SysmlEdgeData,
        }
      }),
    )
  }, [])

  const onNodeDragStart: OnNodeDrag = useCallback((_event, node) => {
    const data = node.data as PartNodeData
    if (!data?.isBoundary) {
      boundaryDragRef.current = null
      return
    }
    const v = viewRef.current
    const snapEdges: BoundaryDragSnapshot['edges'] = {}
    for (const edge of edgesRef.current) {
      const ed = edge.data as SysmlEdgeData
      if (!ed?.internal && !ed?.parentBounds) continue
      const persisted = v?.visualization.edges[edge.id]
      snapEdges[edge.id] = {
        waypoints: (ed.waypoints?.length
          ? ed.waypoints
          : persisted?.waypoints || []
        ).map((p) => ({ ...p })),
        parentBounds: ed.parentBounds ? { ...ed.parentBounds } : undefined,
      }
    }
    boundaryDragRef.current = {
      nodeId: node.id,
      originX: node.position.x,
      originY: node.position.y,
      edges: snapEdges,
    }
  }, [])

  const onNodeDrag: OnNodeDrag = useCallback(
    (_event, node) => {
      const snap = boundaryDragRef.current
      if (!snap || snap.nodeId !== node.id) return
      applyBoundaryEdgeDelta(
        node.position.x - snap.originX,
        node.position.y - snap.originY,
      )
    },
    [applyBoundaryEdgeDelta],
  )

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, node, allNodes) => {
      const patch: Record<string, Partial<VisualizationNode>> = {}
      for (const n of allNodes) {
        const { width, height } = nodeExtentSize(n)
        patch[n.id] = {
          artifactId: n.id,
          x: n.position.x,
          y: n.position.y,
          width,
          height,
        }
      }

      let edgePatch: Record<string, Partial<VisualizationEdge>> | undefined
      const snap = boundaryDragRef.current
      const data = node.data as PartNodeData | undefined
      if (snap && snap.nodeId === node.id) {
        const dx = node.position.x - snap.originX
        const dy = node.position.y - snap.originY
        applyBoundaryEdgeDelta(dx, dy)
        if (dx !== 0 || dy !== 0) {
          edgePatch = {}
          for (const [id, base] of Object.entries(snap.edges)) {
            if (!base.waypoints.length) continue
            edgePatch[id] = {
              artifactId: id,
              waypoints: translatePoints(base.waypoints, dx, dy),
            }
          }
          if (!Object.keys(edgePatch).length) edgePatch = undefined
        }
        boundaryDragRef.current = null
      } else if (data && !data.isBoundary) {
        // Child part moved — redraw only connections on this part's ports.
        const connected = edgesRef.current.filter(
          (e) => e.source === node.id || e.target === node.id,
        )
        if (connected.length) {
          queueMicrotask(() =>
            redrawConnectionsRef.current(allNodes, connected),
          )
        }
        setEdges((current) => {
          const oriented = orientRelationBoundaryHandles(current, allNodes)
          setNodes((ns) => applyRelationHandlesToNodes(ns, oriented))
          return oriented
        })
      }

      onNodesMovedRef.current(patch, edgePatch)
    },
    [applyBoundaryEdgeDelta],
  )

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (portMoveMode || !isStructure) return
      const sourcePort = portIdFromHandle(connection.sourceHandle)
      const targetPort = portIdFromHandle(connection.targetHandle)
      if (!sourcePort || !targetPort || sourcePort === targetPort) return
      onConnectPortsRef.current(sourcePort, targetPort)
    },
    [portMoveMode, isStructure],
  )

  const connectionLineType = useMemo(() => routingToConnectionLine('angular'), [])

  const applyRedraw = useCallback(
    (direction: RedrawDirection) => {
      setFlowDir(direction)
      const { positions } = layoutByDependency(nodes, edges, direction)
      const nextNodes = nodes.map((n) => {
        const p = positions[n.id]
        const data = { ...(n.data as object), flowDir: direction }
        if (!p) return { ...n, data }
        return { ...n, position: { x: p.x, y: p.y }, data }
      })
      const nextEdges =
        mode === 'whitebox' || mode === 'structure' || mode === 'sequence'
          ? mode === 'sequence'
            ? edges
            : orientRelationBoundaryHandles(edges, nextNodes)
          : orientEdgeHandles(edges, direction, nextNodes)

      const nodesWithHandles =
        mode === 'whitebox' || mode === 'structure'
          ? applyRelationHandlesToNodes(nextNodes, nextEdges)
          : nextNodes

      setNodes(nodesWithHandles)
      setEdges(nextEdges)

      const patch: Record<string, Partial<VisualizationNode>> = {}
      for (const n of nextNodes) {
        const { width, height } = nodeExtentSize(n)
        patch[n.id] = {
          artifactId: n.id,
          x: n.position.x,
          y: n.position.y,
          width,
          height,
        }
      }
      onNodesMovedRef.current(patch)
      setLayoutEpoch((n) => n + 1)
    },
    [nodes, edges, mode],
  )

  const applyRedrawConnections = useCallback(
    (overrideNodes?: Node[], overrideEdges?: Edge[]) => {
      // Only re-route edges — never patch part/port positions or sizes.
      // Unlocked waypoints are discarded; only locked vias are kept.
      // Heavy A* lives here (button / view load / port-move) — never in edge render.
      const routeNodes = Array.isArray(overrideNodes) ? overrideNodes : nodes
      const contextEdges = edges
      const routeEdges = Array.isArray(overrideEdges) ? overrideEdges : contextEdges
      if (!routeNodes.length || !routeEdges.length) return
      const angularContext = contextEdges.filter(
        (edge) =>
          ((edge.data || {}) as SysmlEdgeData).routing === 'angular' ||
          !((edge.data || {}) as SysmlEdgeData).routing,
      )
      const existing = angularContext.map((edge) => {
        const data = (edge.data || {}) as SysmlEdgeData
        return { id: edge.id, waypoints: data.waypoints || [] }
      })
      const routed = redrawStructureConnections(
        routeNodes,
        routeEdges,
        viewRef.current?.visualization.nodes,
        existing,
        {
          separation: connectionSeparation,
          contextEdges: angularContext,
        },
      )
      if (!routed.length) return
      const byId = new Map(routed.map((r) => [r.id, r]))
      const liveBounds = boundaryFlowBounds(routeNodes)
      setEdges((current) =>
        syncInternalEdgeBounds(
          routeNodes,
          current.map((edge) => {
            const r = byId.get(edge.id)
            if (!r) return edge
            const data = (edge.data || {}) as SysmlEdgeData
            return {
              ...edge,
              data: {
                ...data,
                routing: 'angular',
                waypoints: r.waypoints,
                jumps: r.jumps || [],
                ...(liveBounds && (data.internal || data.parentBounds)
                  ? { parentBounds: liveBounds }
                  : {}),
              } satisfies SysmlEdgeData,
            }
          }),
        ),
      )
      const edgePatch: Record<string, Partial<VisualizationEdge>> = {}
      for (const r of routed) {
        edgePatch[r.id] = {
          artifactId: r.id,
          routing: 'angular',
          waypoints: r.waypoints,
        }
      }
      onNodesMovedRef.current({}, edgePatch)
    },
    [nodes, edges, connectionSeparation],
  )

  const handlePortMoved = useCallback(
    (portId: string, side: PortSide, offset: number) => {
      let nextNodes: Node[] = []
      setNodes((current) => {
        nextNodes = current.map((node) => {
          const data = node.data as PartNodeData | undefined
          if (!data?.ports?.some((p) => p.id === portId)) return node
          return {
            ...node,
            data: {
              ...data,
              ports: data.ports.map((p) =>
                p.id === portId ? { ...p, side, offset } : p,
              ),
            },
          }
        })
        return nextNodes
      })
      const connected = edgesRef.current.filter((edge) => {
        const src = edge.sourceHandle || ''
        const tgt = (edge.targetHandle || '').replace(/^target:/, '')
        return src === portId || tgt === portId
      })
      const angular = connected.filter((edge) => {
        const data = (edge.data || {}) as SysmlEdgeData
        return (data.routing || 'angular') === 'angular'
      })
      if (angular.length) {
        // Wait for React Flow to re-measure moved handles before rerouting.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const nodesForRoute =
              nodesRef.current.length > 0 ? nodesRef.current : nextNodes
            applyRedrawConnectionsRef.current(nodesForRoute, angular)
          })
        })
      }
      onPortMovedRef.current(portId, side, offset)
    },
    [],
  )

  const handleRelationEndDrag = useCallback(
    (
      artifactId: string,
      end: 'source' | 'target',
      side: PortSide,
      offset: number,
      persist = false,
    ) => {
      setEdges((current) => {
        const next = current.map((edge) => {
          if (
            edge.id !== artifactId &&
            (edge.data as SysmlEdgeData)?.artifactId !== artifactId
          ) {
            return edge
          }
          const data = { ...(edge.data as SysmlEdgeData) }
          if (end === 'source') {
            data.sourceSide = side
            data.sourceOffset = offset
            data.manualAttachment = true
            return {
              ...edge,
              sourceHandle: `rel-src-${edge.id}`,
              data,
            }
          }
          data.targetSide = side
          data.targetOffset = offset
          data.manualAttachment = true
          return {
            ...edge,
            targetHandle: `rel-tgt-${edge.id}`,
            data,
          }
        })
        setNodes((ns) => applyRelationHandlesToNodes(ns, next))
        // Persist only on pointer-up — mid-drag PATCH races corrupt project.json.
        if (persist) {
          const updated = next.find(
            (e) =>
              e.id === artifactId ||
              (e.data as SysmlEdgeData)?.artifactId === artifactId,
          )
          const d = (updated?.data || {}) as SysmlEdgeData
          const companion =
            end === 'source'
              ? d.targetSide
                ? {
                    side: d.targetSide,
                    offset: d.targetOffset ?? 0.5,
                  }
                : undefined
              : d.sourceSide
                ? {
                    side: d.sourceSide,
                    offset: d.sourceOffset ?? 0.5,
                  }
                : undefined
          queueMicrotask(() =>
            onRelationEndMovedRef.current?.(
              artifactId,
              end,
              side,
              offset,
              companion,
            ),
          )
        }
        return next
      })
    },
    [],
  )

  applyRedrawConnectionsRef.current = applyRedrawConnections
  handlePortMovedRef.current = handlePortMoved
  handleRelationEndDragRef.current = handleRelationEndDrag
  redrawConnectionsRef.current = (n, e) => applyRedrawConnectionsRef.current(n, e)

  useEffect(() => {
    const req = autorouteRequest
    if (!req?.connectionId || req.seq == null) return
    if (req.seq === lastAutorouteSeqRef.current) return
    lastAutorouteSeqRef.current = req.seq
    if (!isStructure) return
    const edge = edgesRef.current.find((e) => e.id === req.connectionId)
    if (!edge) return
    const data = (edge.data || {}) as SysmlEdgeData
    if ((data.routing || 'angular') !== 'angular') return
    applyRedrawConnectionsRef.current(nodesRef.current, [edge])
  }, [autorouteRequest?.connectionId, autorouteRequest?.seq, isStructure])

  // One-shot obstacle routing after opening a structure view (not during edge render).
  useEffect(() => {
    const pending = pendingAutoRouteRef.current
    if (!pending || pending.viewKey !== viewKey) return
    if (!isStructure || !nodes.length) return
    pendingAutoRouteRef.current = null
    // After waypoint sync in this commit, so we don't get clobbered by stale viz.
    queueMicrotask(() =>
      applyRedrawConnectionsRef.current(pending.nodes, pending.edges),
    )
  }, [viewKey, isStructure, nodes.length])

  const applyAutoLayout = useCallback(() => {
    const layout = autoLayoutStructure(nodes, edges)
    if (!Object.keys(layout.nodes).length) return

    const nextNodes = nodes.map((node) => {
      const patch = layout.nodes[node.id]
      if (!patch) {
        const data = node.data as PartNodeData
        if (!data?.ports?.length) return node
        return {
          ...node,
          data: {
            ...data,
            ports: data.ports.map((p) => {
              const pp = layout.nodes[p.id]
              if (!pp) return p
              return {
                ...p,
                side: (pp.side as PortSide) || p.side,
                offset: pp.offset ?? p.offset,
              }
            }),
          },
        }
      }
      const data = node.data as PartNodeData
      return {
        ...node,
        position:
          patch.x != null && patch.y != null
            ? { x: patch.x, y: patch.y }
            : node.position,
        width: patch.width ?? node.width,
        height: patch.height ?? node.height,
        style: {
          ...node.style,
          width: patch.width ?? readPx(node.style?.width) ?? node.width,
          height: patch.height ?? readPx(node.style?.height) ?? node.height,
        },
        data: data?.ports
          ? {
              ...data,
              ports: data.ports.map((p) => {
                const pp = layout.nodes[p.id]
                if (!pp) return p
                return {
                  ...p,
                  side: (pp.side as PortSide) || p.side,
                  offset: pp.offset ?? p.offset,
                }
              }),
            }
          : node.data,
      }
    })

    const vizNodes = {
      ...(viewRef.current?.visualization.nodes || {}),
    }
    for (const [id, patch] of Object.entries(layout.nodes)) {
      const prev = vizNodes[id]
      vizNodes[id] = {
        artifactId: id,
        x: patch.x ?? prev?.x ?? 0,
        y: patch.y ?? prev?.y ?? 0,
        width: patch.width ?? prev?.width ?? 12,
        height: patch.height ?? prev?.height ?? 12,
        symbolRef: prev?.symbolRef || 'default-part',
        side: patch.side ?? prev?.side ?? null,
        offset: patch.offset ?? prev?.offset ?? null,
        style: prev?.style,
      }
    }

    const existing = edges.map((edge) => {
      const data = (edge.data || {}) as SysmlEdgeData
      return { id: edge.id, waypoints: data.waypoints || [] }
    })
    const routed = redrawStructureConnections(
      nextNodes,
      edges,
      vizNodes,
      existing,
      { separation: connectionSeparation },
    )
    const byId = new Map(routed.map((r) => [r.id, r]))
    const nextEdges = edges.map((edge) => {
      const r = byId.get(edge.id)
      if (!r) return edge
      const data = (edge.data || {}) as SysmlEdgeData
      return {
        ...edge,
        data: {
          ...data,
          routing: 'angular' as const,
          waypoints: r.waypoints,
          jumps: r.jumps || [],
        } satisfies SysmlEdgeData,
      }
    })
    const edgePatch: Record<string, Partial<VisualizationEdge>> = {}
    for (const r of routed) {
      edgePatch[r.id] = {
        artifactId: r.id,
        routing: 'angular',
        waypoints: r.waypoints,
      }
    }

    setNodes(nextNodes)
    setEdges(nextEdges)
    onNodesMovedRef.current(layout.nodes, edgePatch)
    setLayoutEpoch((n) => n + 1)
  }, [nodes, edges, connectionSeparation])

  if (!view) {
    return (
      <div className="canvas-empty">
        <p>Select a view or add a SysML file to begin.</p>
      </div>
    )
  }

  if (view.modeError) {
    return (
      <div className="canvas-empty mode-error">
        {!printMode && (
          <div className="diagram-mode-badge">{DIAGRAM_MODE_LABELS[mode] || mode}</div>
        )}
        <p>{view.modeError}</p>
      </div>
    )
  }

  return (
    <div
      className={`diagram-canvas${portMoveMode ? ' tool-move-ports' : ' tool-connect'}${
        printMode ? ' diagram-canvas-print' : ''
      }`}
    >
      {!printMode && (
        <div className="diagram-canvas-header">
          <strong className="diagram-view-name">{view.view.name}</strong>
          <span className="diagram-mode-badge">{DIAGRAM_MODE_LABELS[mode] || mode}</span>
          {isStructure && onHierarchyOverrideChange && (
            <label
              className="diagram-levels-override"
              title="Override global hierarchical diagram levels for this view"
            >
              <input
                type="checkbox"
                checked={view.hierarchicalLevelsOverride != null}
                onChange={(e) => {
                  if (e.target.checked) {
                    onHierarchyOverrideChange(
                      Math.max(
                        1,
                        view.hierarchicalLevels ?? globalHierarchicalLevels,
                      ),
                    )
                  } else {
                    onHierarchyOverrideChange(null)
                  }
                }}
              />
              <span>Levels</span>
              <input
                type="number"
                min={1}
                max={8}
                disabled={view.hierarchicalLevelsOverride == null}
                value={
                  view.hierarchicalLevelsOverride != null
                    ? view.hierarchicalLevelsOverride
                    : globalHierarchicalLevels
                }
                onChange={(e) => {
                  const n = Math.max(1, Number(e.target.value) || 1)
                  onHierarchyOverrideChange(n)
                }}
              />
            </label>
          )}
          <div className="redraw-actions">
            {isStructure ? (
              <>
                <button
                  type="button"
                  onClick={applyAutoLayout}
                  title="Size parts, place ports, space parts, then redraw connections"
                >
                  AutoLayout
                </button>
                <button
                  type="button"
                  onClick={() => applyRedrawConnections()}
                  title="Reroute connections around parts using current port placement (does not move parts or ports)"
                >
                  Redraw: Connections
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => applyRedraw('TD')} title="Redraw top-down">
                  Redraw: TD
                </button>
                <button type="button" onClick={() => applyRedraw('LR')} title="Redraw left-right">
                  Redraw: LR
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!printMode && portMoveMode && isStructure && (
        <div className="tool-banner" role="status">
          Move ports — dra längs partens kant
        </div>
      )}
      <div className="diagram-sheet-host">
        {!printMode && sheet?.frame?.visible && (
          <div
            className="diagram-paper-frame"
            style={{
              aspectRatio: (() => {
                const s = paperSizeMm(sheet.frame!)
                return `${s.widthMm} / ${s.heightMm}`
              })(),
            }}
          />
        )}
        {!printMode && sheet?.titleBlock && (
          <div
            className={`diagram-title-block pos-${sheet.titleBlock.position}`}
          >
            <div>
              <strong>{sheet.titleBlock.title || 'Untitled'}</strong>
            </div>
            <div className="muted">
              {sheet.titleBlock.drawingId} · v{sheet.titleBlock.version}
            </div>
          </div>
        )}
        <ReactFlow
          key={`${view.view.id}|${mode}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={allNodeTypes}
          edgeTypes={allEdgeTypes}
          onNodesChange={printMode ? undefined : onNodesChange}
          onNodeDragStart={printMode ? undefined : onNodeDragStart}
          onNodeDrag={printMode ? undefined : onNodeDrag}
          onNodeDragStop={printMode ? undefined : onNodeDragStop}
          onConnect={printMode ? undefined : onConnect}
          onNodeClick={printMode ? undefined : (_e, node) => onSelectArtifact(node.id)}
          onEdgeClick={printMode ? undefined : (_e, edge) => onSelectArtifact(edge.id)}
          onPaneClick={printMode ? undefined : () => onSelectArtifact(null)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={!printMode && !portMoveMode}
          nodesConnectable={!printMode && isStructure && !portMoveMode}
          elementsSelectable={!printMode}
          nodesFocusable={!printMode}
          edgesFocusable={!printMode}
          panOnDrag={!printMode}
          zoomOnScroll={!printMode}
          zoomOnPinch={!printMode}
          zoomOnDoubleClick={!printMode}
          preventScrolling={!printMode}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={connectionLineType}
          proOptions={{ hideAttribution: true }}
        >
          <EdgeMarkerDefs />
          <FitViewOnViewKey
            viewKey={viewKey}
            layoutEpoch={layoutEpoch}
            onReady={printMode ? onPrintReady : undefined}
          />
          {!printMode && <Background gap={18} size={1} />}
          {!printMode && <Controls />}
          {!printMode && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
    </div>
  )
}
