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
  HighlightedSmoothStepEdge,
  HighlightedStraightEdge,
} from './selectableEdge'
import { applyRelationEndDrag } from './applyRelationEndDrag'
import { resolveAnchors, type BoundaryAnchor } from './boundaryAnchors'
import { alignSelection } from './layout/align'
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
import { RequirementNode } from './modes/requirements/RequirementNode'
import { buildRequirementRows } from './modes/requirements/buildRequirementRows'
import { ActorNode } from './modes/useCase/ActorNode'
import { UseCaseNode } from './modes/useCase/UseCaseNode'
import { buildUseCaseGraph } from './modes/useCase/buildUseCaseGraph'
import {
  layoutByDependency,
  orientEdgeHandles,
  type RedrawDirection,
} from './layout/dependencyLayout'
import { redrawStructureConnections, boundaryFlowBounds, syncInternalEdgeBounds } from './layout/connectionRouting'
import { autoLayoutStructure } from './layout/structureAutoLayout'
import { preserveExistingGeometry } from './preserveDiagramGeometry'
import { applyRelationTodos, type RelationTodo } from './applyRelationTodos'
import {
  diagramElementToPngBlob,
  waitFrames,
  writeImageBlobToClipboard,
} from './copyDiagramImage'

/** All custom types registered together — React Flow caches nodeTypes on mount. */
const allNodeTypes: NodeTypes = {
  part: PartNode,
  lifeline: LifelineNode,
  state: StateNode,
  action: ActionNode,
  tree: TreeDiagramNode,
  requirement: RequirementNode,
  useCase: UseCaseNode,
  actor: ActorNode,
}

const allEdgeTypes: EdgeTypes = {
  sysml: SysmlEdge,
  message: MessageEdge,
  smoothstep: HighlightedSmoothStepEdge,
  straight: HighlightedStraightEdge,
}

function FitViewOnViewKey({
  viewKey,
  layoutEpoch,
  onReady,
  printMode = false,
  viewportCache,
}: {
  viewKey: string | null
  layoutEpoch: number
  onReady?: () => void
  printMode?: boolean
  viewportCache: { current: Map<string, { x: number; y: number; zoom: number }> }
}) {
  const { fitView, setViewport, getNodes } = useReactFlow()
  useEffect(() => {
    if (!viewKey) return
    const viewId = viewKey.split('|')[1]
    let cancelled = false
    let readySent = false
    let raf = 0

    const signalReady = () => {
      if (cancelled || readySent || !onReady) return
      readySent = true
      onReady()
    }

    const cached = !printMode && viewId ? viewportCache.current.get(viewId) : undefined
    if (cached) {
      raf = requestAnimationFrame(() => {
        if (cancelled) return
        setViewport(cached, { duration: 0 })
        signalReady()
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(raf)
      }
    }

    const doFit = () => {
      fitView({
        padding: printMode ? 0.04 : 0.15,
        duration: 0,
        minZoom: printMode ? 0.01 : undefined,
        maxZoom: printMode ? 8 : undefined,
      })
    }

    const run = () => {
      if (cancelled) return
      const nodes = getNodes()
      if (printMode && !nodes.length) {
        raf = requestAnimationFrame(run)
        return
      }
      doFit()
      raf = requestAnimationFrame(() => {
        if (cancelled) return
        // Re-fit after layout/measure settles (esp. print host size).
        doFit()
        raf = requestAnimationFrame(signalReady)
      })
    }

    raf = requestAnimationFrame(run)

    let ro: ResizeObserver | null = null
    if (printMode && typeof ResizeObserver !== 'undefined') {
      const pane = document.querySelector(
        '.print-diagram-canvas-host .react-flow',
      )
      if (pane) {
        ro = new ResizeObserver(() => {
          if (cancelled || readySent) return
          doFit()
        })
        ro.observe(pane)
      }
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [viewKey, layoutEpoch, fitView, setViewport, getNodes, onReady, printMode, viewportCache])
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
  requirementTable: 'Requirements table',
  useCase: 'Use case',
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
  sheet?: ProjectSheet
  selectedConnectionColor?: string
  selectedConnectionLinewidthFactor?: number
  connectionSeparation?: number
  selectedIds?: string[]
  relationTodos?: RelationTodo[]
  pendingChangeColor?: string
  pendingAddColor?: string
  /** Format painter active — show banner; Esc clears in App. */
  formatPaintMode?: boolean
  onSelectArtifact: (
    id: string | null,
    opts?: { shift?: boolean },
  ) => void
  onSelectionFromFlow?: (ids: string[]) => void
  onOpenView: (viewId: string) => void
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
  sheet,
  selectedConnectionColor = '#2563eb',
  selectedConnectionLinewidthFactor = 3,
  connectionSeparation = 5,
  selectedIds = [],
  relationTodos = [],
  pendingChangeColor = '#dc2626',
  pendingAddColor = '#16a34a',
  formatPaintMode = false,
  onSelectArtifact,
  onSelectionFromFlow,
  onOpenView,
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
  const [reqTableMode, setReqTableMode] = useState<'flat' | 'hierarchical'>(
    'hierarchical',
  )
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [flowDir, setFlowDir] = useState<RedrawDirection>('LR')
  /** Temporarily force light styling while exporting an image to the clipboard. */
  const [captureLight, setCaptureLight] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const pendingCopyRef = useRef(false)
  const sheetHostRef = useRef<HTMLDivElement>(null)
  const viewKeyRef = useRef<string | null>(null)
  const viewRef = useRef(view)
  const edgesRef = useRef<Edge[]>([])
  const nodesRef = useRef<Node[]>([])
  /** Viewport per view, kept in memory for the session only. */
  const viewportCache = useRef(new Map<string, { x: number; y: number; zoom: number }>())
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
  const onSelectionFromFlowRef = useRef(onSelectionFromFlow)
  const selectedIdsRef = useRef(selectedIds)
  const handleAnchorDragRef = useRef<
    (
      nodeId: string,
      anchorId: string,
      side: PortSide,
      offset: number,
      persist: boolean,
    ) => void
  >(() => {})
  const handleAddAnchorRef = useRef<
    (nodeId: string, side: PortSide, offset: number) => void
  >(() => {})
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
  onSelectionFromFlowRef.current = onSelectionFromFlow
  selectedIdsRef.current = selectedIds

  type BoundaryDragSnapshot = {
    nodeId: string
    originX: number
    originY: number
    edges: Record<string, { waypoints: Pt[]; parentBounds?: FlowBounds }>
  }
  const boundaryDragRef = useRef<BoundaryDragSnapshot | null>(null)

  const mode: DiagramMode = view?.diagramMode || 'structure'
  const isStructure = mode === 'whitebox' || mode === 'structure'
  const syncRelationGeometry = isStructure || mode === 'useCase'
  const renderViewMode: ViewMode = captureLight ? 'light' : viewMode

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
    ? `${diagramEpoch}|${view.view.id}|${view.diagramMode ?? ''}|${showAttributes}|${renderViewMode}|${structureNotation}|${edgeSig}|${nodeStyleSig}|${collapseSig}|${selectedConnectionColor}|${selectedConnectionLinewidthFactor}|${Object.keys(view.semantic).sort().join(',')}`
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
        built = buildSequenceGraph(view, renderViewMode, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'state':
        built = buildStateGraph(view, renderViewMode, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'actionFlow':
        built = buildActionFlowGraph(view, renderViewMode, flowDirRef.current, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'tree':
        built = buildTreeGraph(
          view,
          renderViewMode,
          collapsedIds,
          toggleCollapse,
          {
            selectedConnectionColor,
            selectedConnectionLinewidthFactor,
          },
        )
        break
      case 'allocation':
        built = buildAllocationGraph({
          view,
          viewMode: renderViewMode,
          showAttributes,
          portMoveMode,
          selectedConnectionColor: selectedConnectionColor || '#2563eb',
          selectedConnectionLinewidthFactor,
          onOpenView: stableOpen,
          onPortMoved: stablePort,
          onWaypointsChange: stableWp,
          onLabelOffsetChange: stableLabel,
          onSelectConnection: (id: string) => onSelectArtifactRef.current(id),
        })
        break
      case 'useCase':
        built = buildUseCaseGraph(view, renderViewMode, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'requirementTable':
        built = { nodes: [], edges: [] }
        break
      default:
        built = buildStructureGraph({
          view,
          onOpenView: stableOpen,
          onPortMoved: stablePort,
          portMoveMode,
          showAttributes,
          viewMode: renderViewMode,
          structureNotation,
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
          onWaypointsChange: stableWp,
          onLabelOffsetChange: stableLabel,
          onSelectConnection: (id: string) => onSelectArtifactRef.current(id),
          onRelationEndMoved: stableRelEnd,
        })
    }
    const visibleIds = new Set(built.nodes.map((n) => n.id))
    const previousViewId = viewKeyRef.current?.split('|')[1]
    const geometry =
      previousViewId && previousViewId === view.view.id && nodesRef.current.length
        ? preserveExistingGeometry(
            built.nodes,
            built.edges,
            nodesRef.current,
            edgesRef.current,
          )
        : { nodes: built.nodes, edges: built.edges }
    setNodes(
      geometry.nodes.map((node) => ({
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
          onAnchorDrag: (
            anchorId: string,
            side: PortSide,
            offset: number,
            persist?: boolean,
          ) =>
            handleAnchorDragRef.current(
              node.id,
              anchorId,
              side,
              offset,
              !!persist,
            ),
          onAddAnchor: (side: PortSide, offset: number) =>
            handleAddAnchorRef.current(node.id, side, offset),
        },
      })),
    )
    const overlaid = applyRelationTodos(
      geometry.edges,
      relationTodos,
      { change: pendingChangeColor, add: pendingAddColor },
      visibleIds,
    )
    setEdges(
      overlaid.edges.map((edge) => ({
        ...edge,
        interactionWidth: 24,
        data: {
          ...(edge.data as object),
          altHeld: portMoveMode,
          selectedColor: selectedConnectionColor,
          selectedFactor: selectedConnectionLinewidthFactor,
          onSelect: (artifactId: string) => onSelectArtifactRef.current(artifactId),
          onWaypointsChange: (id: string, wps: { x: number; y: number }[]) =>
            onWaypointsMovedRef.current(id, wps),
          onLabelOffsetChange: (id: string, offset: { x: number; y: number }) =>
            onLabelOffsetMovedRef.current(id, offset),
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
  }, [viewKey, showAttributes, renderViewMode])

  const onCopyImage = useCallback(() => {
    if (printMode || pendingCopyRef.current || copyState === 'busy') return
    pendingCopyRef.current = true
    setCopyState('busy')
    setCaptureLight(true)
  }, [printMode, copyState])

  useEffect(() => {
    if (!captureLight || !pendingCopyRef.current) return
    let cancelled = false
    const run = async () => {
      try {
        // Allow graph rebuild + paint with light styles before rasterizing.
        await waitFrames(4)
        await new Promise((r) => setTimeout(r, 60))
        if (cancelled) return
        const host = sheetHostRef.current
        const flow = host?.querySelector('.react-flow') as HTMLElement | null
        if (!flow) throw new Error('Diagram not ready')
        const blob = await diagramElementToPngBlob(flow)
        if (cancelled) return
        await writeImageBlobToClipboard(blob)
        if (cancelled) return
        setCopyState('ok')
        window.setTimeout(() => {
          setCopyState((s) => (s === 'ok' ? 'idle' : s))
        }, 2000)
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setCopyState('err')
          window.setTimeout(() => {
            setCopyState((s) => (s === 'err' ? 'idle' : s))
          }, 3000)
        }
      } finally {
        if (!cancelled) {
          pendingCopyRef.current = false
          setCaptureLight(false)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [captureLight, viewKey, nodes, edges])

  // Sync routing into edges without resetting part/port layout.
  useEffect(() => {
    const v = viewRef.current
    if (!v || !syncRelationGeometry) return
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
  }, [routingSig, syncRelationGeometry])

  // App selection (line click, name click, tree) drives the thick highlight.
  useEffect(() => {
    const wanted = new Set(selectedIds)
    const sync = <T extends { id: string; selected?: boolean }>(items: T[]): T[] => {
      let changed = false
      const next = items.map((item) => {
        const selected = wanted.has(item.id)
        if (!!item.selected === selected) return item
        changed = true
        return { ...item, selected }
      })
      return changed ? next : items
    }
    setNodes((current) => sync(current))
    setEdges((current) => sync(current))
  }, [selectedIds])

  // Sync waypoints into edges without resetting part/port layout.
  useEffect(() => {
    const v = viewRef.current
    if (!v || !syncRelationGeometry) return
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
  }, [waypointSig, syncRelationGeometry])

  useEffect(() => {
    if (!syncRelationGeometry) return
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
          selectedColor: selectedConnectionColor,
          selectedFactor: selectedConnectionLinewidthFactor,
          onSelect: (artifactId: string) => onSelectArtifactRef.current(artifactId),
          onWaypointsChange: (id: string, wps: { x: number; y: number }[]) =>
            onWaypointsMovedRef.current(id, wps),
          onLabelOffsetChange: (id: string, offset: { x: number; y: number }) =>
            onLabelOffsetMovedRef.current(id, offset),
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
  }, [portMoveMode, syncRelationGeometry])

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
      } else if (isStructure && data && !data.isBoundary) {
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
    [applyBoundaryEdgeDelta, isStructure],
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
        mode === 'whitebox' || mode === 'structure'
          ? orientRelationBoundaryHandles(edges, nextNodes)
          : mode === 'sequence' || mode === 'useCase'
            ? edges
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
      const { edges: next, persist: payload } = applyRelationEndDrag(
        edgesRef.current,
        artifactId,
        end,
        side,
        offset,
        persist,
      )
      setEdges(next)
      setNodes((ns) => applyRelationHandlesToNodes(ns, next))
      // Persist only on pointer-up — mid-drag PATCH races corrupt project.json.
      // Call outside setEdges so StrictMode double-invoke cannot double-PATCH.
      if (payload) {
        queueMicrotask(() =>
          onRelationEndMovedRef.current?.(
            payload.artifactId,
            payload.end,
            payload.side,
            payload.offset,
            payload.companion,
          ),
        )
      }
    },
    [],
  )

  const handleAnchorDrag = useCallback(
    (
      nodeId: string,
      anchorId: string,
      side: PortSide,
      offset: number,
      persist = false,
    ) => {
      const node = nodesRef.current.find((n) => n.id === nodeId)
      const anchors = resolveAnchors(
        (node?.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors,
      ).map((a) => (a.id === anchorId ? { ...a, side, offset } : a))
      setNodes((ns) =>
        ns.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, anchors } } : n,
        ),
      )
      const edgePatch: Record<string, Partial<VisualizationEdge>> = {}
      const nextEdges = edgesRef.current.map((e) => {
        const data = (e.data || {}) as SysmlEdgeData
        const srcHit =
          e.source === nodeId &&
          (e.sourceHandle === anchorId || data.sourceAnchorId === anchorId)
        const tgtHit =
          e.target === nodeId &&
          (e.targetHandle === `target:${anchorId}` ||
            data.targetAnchorId === anchorId)
        if (!srcHit && !tgtHit) return e
        if (persist) {
          edgePatch[e.id] = {
            artifactId: e.id,
            routing: (data.routing as VisualizationEdge['routing']) || 'direct',
            ...(srcHit
              ? {
                  sourceSide: side,
                  sourceOffset: offset,
                  sourceAnchorId: anchorId,
                }
              : {}),
            ...(tgtHit
              ? {
                  targetSide: side,
                  targetOffset: offset,
                  targetAnchorId: anchorId,
                }
              : {}),
          }
        }
        return {
          ...e,
          data: {
            ...data,
            ...(srcHit
              ? {
                  sourceSide: side,
                  sourceOffset: offset,
                  sourceAnchorId: anchorId,
                }
              : {}),
            ...(tgtHit
              ? {
                  targetSide: side,
                  targetOffset: offset,
                  targetAnchorId: anchorId,
                }
              : {}),
          },
        }
      })
      setEdges(nextEdges)
      if (persist) {
        queueMicrotask(() =>
          onNodesMovedRef.current(
            { [nodeId]: { artifactId: nodeId, anchors } },
            Object.keys(edgePatch).length ? edgePatch : undefined,
          ),
        )
      }
    },
    [],
  )

  const handleAddAnchor = useCallback((nodeId: string, side: PortSide, offset: number) => {
    const node = nodesRef.current.find((n) => n.id === nodeId)
    const added: BoundaryAnchor = {
      id: `extra-${Date.now()}`,
      side,
      offset,
    }
    const anchors = [
      ...resolveAnchors(
        (node?.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors,
      ),
      added,
    ]
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, anchors } } : n,
      ),
    )
    const selected = new Set(selectedIdsRef.current)
    const connected = edgesRef.current.filter(
      (e) => e.source === nodeId || e.target === nodeId,
    )
    const preferred =
      connected.find((e) => selected.has(e.id)) ||
      connected.find((e) => e.target === nodeId) ||
      connected[0]
    let edgePatch: Record<string, Partial<VisualizationEdge>> | undefined
    if (preferred) {
      const asTarget = preferred.target === nodeId
      const data = (preferred.data || {}) as SysmlEdgeData
      const routing = (data.routing as VisualizationEdge['routing']) || 'direct'
      setEdges((es) =>
        es.map((e) => {
          if (e.id !== preferred.id) return e
          if (asTarget) {
            return {
              ...e,
              targetHandle: `target:${added.id}`,
              data: {
                ...(e.data as object),
                targetSide: side,
                targetOffset: offset,
                targetAnchorId: added.id,
              },
            }
          }
          return {
            ...e,
            sourceHandle: added.id,
            data: {
              ...(e.data as object),
              sourceSide: side,
              sourceOffset: offset,
              sourceAnchorId: added.id,
            },
          }
        }),
      )
      edgePatch = {
        [preferred.id]: asTarget
          ? {
              artifactId: preferred.id,
              routing,
              targetSide: side,
              targetOffset: offset,
              targetAnchorId: added.id,
            }
          : {
              artifactId: preferred.id,
              routing,
              sourceSide: side,
              sourceOffset: offset,
              sourceAnchorId: added.id,
            },
      }
    }
    queueMicrotask(() =>
      onNodesMovedRef.current(
        { [nodeId]: { artifactId: nodeId, anchors } },
        edgePatch,
      ),
    )
  }, [])

  applyRedrawConnectionsRef.current = applyRedrawConnections
  handlePortMovedRef.current = handlePortMoved
  handleRelationEndDragRef.current = handleRelationEndDrag
  handleAnchorDragRef.current = handleAnchorDrag
  handleAddAnchorRef.current = handleAddAnchor
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

  const handleSelectionChange = useCallback(
    ({
      nodes: selNodes,
      edges: selEdges,
    }: {
      nodes: { id: string }[]
      edges: { id: string }[]
    }) => {
      const report = onSelectionFromFlowRef.current
      if (!report) return
      // Single clicks go through onNodeClick / onEdgeClick. Marquee and
      // overlapping hits report more than one id.
      if (selNodes.length + selEdges.length <= 1) return
      const ordered = [
        ...nodesRef.current
          .filter((n) => selNodes.some((s) => s.id === n.id))
          .map((n) => n.id),
        ...edgesRef.current
          .filter((e) => selEdges.some((s) => s.id === e.id))
          .map((e) => e.id),
      ]
      const current = selectedIdsRef.current
      if (
        ordered.length === current.length &&
        ordered.every((id, i) => id === current[i])
      ) {
        return
      }
      report(ordered)
    },
    [],
  )

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

  if (mode === 'requirementTable') {
    const rows = buildRequirementRows(view.semantic, reqTableMode)
    return (
      <div className="diagram-canvas requirement-table-canvas">
        {!printMode && (
          <div className="diagram-canvas-header">
            <strong className="diagram-view-name">{view.view.name}</strong>
            <span className="diagram-mode-badge">
              {DIAGRAM_MODE_LABELS.requirementTable}
            </span>
            <div className="redraw-actions">
              <button
                type="button"
                className={reqTableMode === 'flat' ? 'active' : ''}
                onClick={() => setReqTableMode('flat')}
              >
                Flat
              </button>
              <button
                type="button"
                className={reqTableMode === 'hierarchical' ? 'active' : ''}
                onClick={() => setReqTableMode('hierarchical')}
              >
                Hierarchical
              </button>
            </div>
          </div>
        )}
        <div className="requirement-table-wrap">
          <table className="requirement-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Name</th>
                <th>Type</th>
                <th>Text</th>
                <th>Derived from</th>
                <th>Satisfied by</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.id}:${row.depth}:${row.repeated}`}
                  className={
                    selectedIds.includes(row.id) ? 'selected' : undefined
                  }
                  onClick={(e) =>
                    onSelectArtifact(row.id, { shift: e.shiftKey })
                  }
                >
                  <td className="mono">{row.shortId}</td>
                  <td style={{ paddingLeft: 8 + row.depth * 16 }}>
                    {row.repeated ? '↺ ' : ''}
                    {row.name}
                  </td>
                  <td>«{row.stereotype}»</td>
                  <td>{row.text}</td>
                  <td className="mono">{row.derivedFrom.join(', ')}</td>
                  <td className="mono">{row.satisfiedBy.join(', ')}</td>
                  <td className="mono">{row.fileId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`diagram-canvas${portMoveMode ? ' tool-move-ports' : ' tool-connect'}${
        printMode ? ' diagram-canvas-print' : ''
      }`}
      data-theme={captureLight ? 'light' : undefined}
    >
      {!printMode && (
        <div className="diagram-canvas-header">
          <strong className="diagram-view-name">{view.view.name}</strong>
          <span className="diagram-mode-badge">{DIAGRAM_MODE_LABELS[mode] || mode}</span>
          <div className="redraw-actions">
            <button
              type="button"
              onClick={onCopyImage}
              disabled={copyState === 'busy'}
              title="Copy diagram image to clipboard (always light theme, white background)"
            >
              {copyState === 'busy'
                ? 'Copying…'
                : copyState === 'ok'
                  ? 'Copied'
                  : copyState === 'err'
                    ? 'Copy failed'
                    : 'Copy'}
            </button>
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
                {selectedIds.length >= 2 ? (
                  <>
                    <button
                      type="button"
                      title="Align selected to first selected (horizontal = same Y)"
                      onClick={() => {
                        const items = nodes.map((n) => ({
                          id: n.id,
                          x: n.position.x,
                          y: n.position.y,
                          width: Number(n.style?.width) || 100,
                          height: Number(n.style?.height) || 40,
                          parentAbs: n.parentId
                            ? (() => {
                                const p = nodes.find((x) => x.id === n.parentId)
                                return p
                                  ? { x: p.position.x, y: p.position.y }
                                  : undefined
                              })()
                            : undefined,
                        }))
                        const { patch } = alignSelection(
                          items,
                          'horizontal',
                          selectedIds,
                        )
                        if (Object.keys(patch).length) onNodesMoved(patch)
                      }}
                    >
                      Align H
                    </button>
                    <button
                      type="button"
                      title="Align selected to first selected (vertical = same X)"
                      onClick={() => {
                        const items = nodes.map((n) => ({
                          id: n.id,
                          x: n.position.x,
                          y: n.position.y,
                          width: Number(n.style?.width) || 100,
                          height: Number(n.style?.height) || 40,
                          parentAbs: n.parentId
                            ? (() => {
                                const p = nodes.find((x) => x.id === n.parentId)
                                return p
                                  ? { x: p.position.x, y: p.position.y }
                                  : undefined
                              })()
                            : undefined,
                        }))
                        const { patch } = alignSelection(
                          items,
                          'vertical',
                          selectedIds,
                        )
                        if (Object.keys(patch).length) onNodesMoved(patch)
                      }}
                    >
                      Align V
                    </button>
                  </>
                ) : null}
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
      {!printMode && formatPaintMode && (
        <div className="tool-banner" role="status">
          Format paint — click a target
        </div>
      )}
      <div className="diagram-sheet-host" ref={sheetHostRef}>
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
          onNodeClick={
            printMode
              ? undefined
              : (e, node) =>
                  onSelectArtifact(node.id, { shift: e.shiftKey })
          }
          onEdgeClick={
            printMode
              ? undefined
              : (e, edge) => {
                  // Keep the click from reaching the pane, which clears the selection.
                  e.stopPropagation()
                  onSelectArtifact(edge.id, { shift: e.shiftKey })
                }
          }
          onPaneClick={printMode ? undefined : () => onSelectArtifact(null)}
          onSelectionChange={printMode ? undefined : handleSelectionChange}
          multiSelectionKeyCode="Shift"
          selectionKeyCode="Shift"
          fitView={!printMode && !viewportCache.current.has(view.view.id)}
          fitViewOptions={
            printMode
              ? { padding: 0.04, minZoom: 0.01, maxZoom: 8 }
              : { padding: 0.15 }
          }
          onMove={
            printMode
              ? undefined
              : (_event, viewport) => {
                  viewportCache.current.set(view.view.id, {
                    x: viewport.x,
                    y: viewport.y,
                    zoom: viewport.zoom,
                  })
                }
          }
          minZoom={printMode ? 0.01 : 0.5}
          maxZoom={printMode ? 8 : 2}
          nodesDraggable={!printMode && !portMoveMode}
          nodesConnectable={!printMode && isStructure && !portMoveMode}
          elementsSelectable={!printMode}
          elevateEdgesOnSelect
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
            printMode={printMode}
            viewportCache={viewportCache}
            onReady={printMode ? onPrintReady : undefined}
          />
          {!printMode && !captureLight && <Background gap={18} size={1} />}
          {!printMode && !captureLight && <Controls />}
          {!printMode && !captureLight && <MiniMap pannable zoomable />}
        </ReactFlow>
      </div>
    </div>
  )
}
