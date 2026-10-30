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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import type {
  ArtifactKind,
  DiagramMode,
  LayoutRuleRow,
  LayeredLayoutConfig,
  PortSide,
  RoutingType,
  ViewPayload,
  VisualizationEdge,
  VisualizationNode,
} from '../../api'
import { EDGE_LABEL_TEXT_HEIGHT_PX, type ViewMode } from '../../settings'
import type { ProjectSheet } from '../sheet/sheet'
import { paperSizeMm } from '../sheet/sheet'
import { PartNode, type PartNodeData } from './PartNode'
import { SysmlEdge, type SysmlEdgeData } from './InternalEdge'
import {
  HighlightedSmoothStepEdge,
  HighlightedStraightEdge,
} from './selectableEdge'
import { applyRelationEndDrag } from './applyRelationEndDrag'
import { selectionIdForPaneClick } from './canvasSelection'
import { edgeStackZIndex } from './edgeEditZIndex'
import { applyViewFilters } from './viewFilters'
import { LayoutWizardDialog } from './LayoutWizardDialog'
import type { LayoutArtefact } from './layoutWizard'
import { resolveAnchors, type BoundaryAnchor } from './boundaryAnchors'
import {
  alignDirectConnection,
  canAlignDirectConnection,
  type ConnectionAlignMode,
  type PartBox,
} from './layout/align'
import {
  alignFlowSelection,
  applyAlignPatchToFlowNodes,
} from './layout/alignFlowSelection'
import { bulkOp, type BulkCommand } from './bulkOps'
import { isEditLocked, lockTargets } from './editLock'
import {
  translateFlowBounds,
  translatePoints,
  type FlowBounds,
  type Pt,
} from './edgeRouting'
import { computeUpdateJumpers } from './layout/updateJumpers'
import {
  applyPortMovesToNodes,
  type PortMove,
} from './layout/portGroupMove'
import { IconToolbarButton } from './IconToolbarButton'
import { TOOLBAR_ICONS } from './iconRef'
import { PortMarqueeLayer } from './PortMarqueeLayer'
import { VizHistory } from './vizHistory'
import { collectFlipPortMoves } from './layout/flipPortPlacement'
import { collectDistributePortMoves } from './layout/distributePorts'
import { distributeFlowSelection } from './layout/distributeNodes'
import { allDiagramIds, handleCanvasShortcut } from './canvasShortcuts'
import { EdgeMarkerDefs } from './EdgeMarkerDefs'
import {
  absoluteNodeOrigin,
  applyRelationHandlesToNodes,
  buildStructureGraph,
  orientRelationBoundaryHandles,
} from './modes/structure/buildStructureGraph'
import { relativePositionFromFlow } from './nestedPartPosition'
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
import { redrawUseCaseRelations } from './modes/useCase/redrawUseCaseRelations'
import {
  layoutByDependency,
  orientEdgeHandles,
  type RedrawDirection,
} from './layout/dependencyLayout'
import { boundaryFlowBounds, syncInternalEdgeBounds } from './layout/connectionRouting'
import { AutoLayoutDialog } from './AutoLayoutDialog'
import {
  clampHierarchicOptions,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  hierarchicDirectionForLayers,
  layerDirectionForHierarchic,
  type AutoLayoutDirectives,
} from './layout/autoLayoutOptions'
import { asAngularForLayout } from './layout/elkStructureLayout'
import { buildLayoutConstraints } from './layout/layoutConstraints'
import { normalizeLayeredLayout, rootScope } from './layeredLayoutConfig'
import { planStructureRoutes } from './layout/layoutRouter'
import { flowViewportBounds } from './layout/layoutNormalize'
import { preserveExistingGeometry } from './preserveDiagramGeometry'
import {
  applyDimensionChangesToStyle,
  nodeBoxSize,
  nodeExtentSize,
} from './resizeSync'
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

/** Expose React Flow APIs to the parent (outside <ReactFlow> tree). */
function ViewportApiBridge({
  apiRef,
}: {
  apiRef: MutableRefObject<{
    getViewport: () => { x: number; y: number; zoom: number }
  } | null>
}) {
  const { getViewport } = useReactFlow()
  apiRef.current = { getViewport }
  return null
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

/** Port id for alignable connection ends (not relation boundary handles). */
function alignablePortId(handleId: string | null | undefined): string | null {
  const id = portIdFromHandle(handleId)
  if (!id || id.startsWith('rel-')) return null
  return id
}

function absolutePartBox(node: Node, byId: Map<string, Node>): PartBox {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  while (parentId) {
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  const size = nodeExtentSize(node)
  return {
    id: node.id,
    x,
    y,
    width: size.width ?? 100,
    height: size.height ?? 40,
  }
}

type DirectConnectionAlignTarget = {
  srcPart: PartBox
  tgtPart: PartBox
  srcPort: { id: string; side: PortSide; offset: number }
  tgtPort: { id: string; side: PortSide; offset: number }
}

function resolveDirectConnectionAlignTarget(
  edge: Edge,
  flowNodes: Node[],
): DirectConnectionAlignTarget | null {
  const data = (edge.data || {}) as SysmlEdgeData
  if ((data.routing || 'angular') !== 'direct') return null
  const srcPortId = alignablePortId(edge.sourceHandle)
  const tgtPortId = alignablePortId(edge.targetHandle)
  if (!srcPortId || !tgtPortId) return null
  const byId = new Map(flowNodes.map((n) => [n.id, n]))
  const srcNode = byId.get(edge.source)
  const tgtNode = byId.get(edge.target)
  if (!srcNode || !tgtNode) return null
  const srcPorts = ((srcNode.data as PartNodeData | undefined)?.ports || []) as {
    id: string
    side: PortSide
    offset: number
  }[]
  const tgtPorts = ((tgtNode.data as PartNodeData | undefined)?.ports || []) as {
    id: string
    side: PortSide
    offset: number
  }[]
  const srcPort = srcPorts.find((p) => p.id === srcPortId)
  const tgtPort = tgtPorts.find((p) => p.id === tgtPortId)
  if (!srcPort || !tgtPort) return null
  return {
    srcPart: absolutePartBox(srcNode, byId),
    tgtPart: absolutePartBox(tgtNode, byId),
    srcPort: {
      id: srcPort.id,
      side: srcPort.side || 'right',
      offset: srcPort.offset ?? 0.5,
    },
    tgtPort: {
      id: tgtPort.id,
      side: tgtPort.side || 'left',
      offset: tgtPort.offset ?? 0.5,
    },
  }
}

/** Skip auto-route on view open when saved connection geometry exists. */
function viewHasSavedConnectionLayout(
  edges: Record<string, VisualizationEdge>,
): boolean {
  return Object.values(edges).some((e) => (e.waypoints?.length ?? 0) > 0)
}

function DiagramEditToolbar({
  view,
  selectedIds,
  onNodesMoved,
  beforeMutation,
  children,
}: {
  view: ViewPayload
  selectedIds: string[]
  onNodesMoved: Props['onNodesMoved']
  beforeMutation?: () => void
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const viz = view.visualization
  const applyLock = (locked: boolean, ids: string[]) => {
    const patch = lockTargets(ids, viz.nodes, viz.edges, locked)
    if (!Object.keys(patch.nodes).length && !Object.keys(patch.edges).length) return
    beforeMutation?.()
    onNodesMoved(
      patch.nodes,
      Object.keys(patch.edges).length ? patch.edges : undefined,
    )
  }
  const allIds = [...Object.keys(viz.nodes), ...Object.keys(viz.edges)]
  const edgeSelected = selectedIds.some((id) =>
    Object.prototype.hasOwnProperty.call(viz.edges, id),
  )
  const runBulk = (command: BulkCommand) => {
    setOpen(false)
    const patch = bulkOp(command, selectedIds, viz.nodes, viz.edges)
    if (!Object.keys(patch.nodes).length && !Object.keys(patch.edges).length) return
    beforeMutation?.()
    onNodesMoved(
      patch.nodes,
      Object.keys(patch.edges).length ? patch.edges : undefined,
    )
  }
  return (
    <>
      <IconToolbarButton
        icon={TOOLBAR_ICONS.lockAll}
        title="Lock every artifact and connection in this diagram"
        onClick={() => applyLock(true, allIds)}
      />
      <IconToolbarButton
        icon={TOOLBAR_ICONS.unlockAll}
        title="Unlock every artifact and connection in this diagram"
        onClick={() => applyLock(false, allIds)}
      />
      <div className="bulk-ops">
        <button
          type="button"
          disabled={!selectedIds.length}
          aria-expanded={open}
          aria-haspopup="menu"
          title="Run one command on the selection"
          onClick={() => setOpen((value) => !value)}
        >
          Bulk
        </button>
        {open && selectedIds.length > 0 && (
          <div className="bulk-ops-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => runBulk('lock')}>
              Lock
            </button>
            <button type="button" role="menuitem" onClick={() => runBulk('unlock')}>
              Unlock
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!edgeSelected}
              onClick={() => runBulk('direct')}
            >
              Direct
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!edgeSelected}
              onClick={() => runBulk('angular')}
            >
              Angular
            </button>
          </div>
        )}
      </div>
      {children}
    </>
  )
}

type Props = {
  view: ViewPayload | null
  diagramEpoch: number
  viewMode?: ViewMode
  showAttributes?: boolean
  structureNotation?: import('../../settings').StructureNotation
  requirementDisplay?: import('../../settings').RequirementDisplaySettings
  sheet?: ProjectSheet
  selectedConnectionColor?: string
  selectedConnectionLinewidthFactor?: number
  connectionSeparation?: number
  /** When false, hide and skip computing crossing jumpers. */
  showJumpers?: boolean
  /**
   * When true (default), include port–port bindings in Redraw / AutoLayout.
   */
  includeBindingsInRouting?: boolean
  selectedIds?: string[]
  /** Format painter active — show banner; Esc clears in App. */
  formatPaintMode?: boolean
  onSelectArtifact: (
    id: string | null,
    opts?: { shift?: boolean },
  ) => void
  onSelectionFromFlow?: (ids: string[]) => void
  onOpenView: (
    viewId: string,
    opts?: { ctrlKey?: boolean; metaKey?: boolean },
  ) => void
  onBackView?: () => void
  /** Double-click on a node; the caller decides what the kind opens. */
  onNodeDoubleClick?: (artifactId: string, kind: ArtifactKind) => void
  onNodesMoved: (
    nodes: Record<string, Partial<VisualizationNode>>,
    edges?: Record<string, Partial<VisualizationEdge>>,
  ) => void
  onLayoutRulesChange?: (rules: LayoutRuleRow[]) => void
  onLayeredLayoutChange?: (layered: LayeredLayoutConfig | null) => void
  onPortMoved: (portId: string, side: PortSide, offset: number) => void
  /** Batch port placement persist (port defaults). Prefer over onNodesMoved for ports. */
  onPortsMoved?: (
    moves: { portId: string; side: PortSide; offset: number }[],
  ) => void
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
  requirementDisplay,
  sheet,
  selectedConnectionColor = '#2563eb',
  selectedConnectionLinewidthFactor = 3,
  connectionSeparation = EDGE_LABEL_TEXT_HEIGHT_PX,
  showJumpers = true,
  includeBindingsInRouting = true,
  selectedIds = [],
  formatPaintMode = false,
  onSelectArtifact,
  onSelectionFromFlow,
  onOpenView,
  onBackView,
  onNodeDoubleClick,
  onNodesMoved,
  onLayoutRulesChange,
  onLayeredLayoutChange,
  onPortMoved,
  onPortsMoved,
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
  const [shiftHeld, setShiftHeld] = useState(false)
  const suppressPortMarqueePaneClickRef = useRef(false)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [reqTableMode, setReqTableMode] = useState<'flat' | 'hierarchical'>(
    'hierarchical',
  )
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [flowDir, setFlowDir] = useState<RedrawDirection>('LR')
  const [layoutWizardOpen, setLayoutWizardOpen] = useState(false)
  /** Temporarily force light styling while exporting an image to the clipboard. */
  const [captureLight, setCaptureLight] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle')
  const [historyTick, setHistoryTick] = useState(0)
  const [selectedPortIds, setSelectedPortIds] = useState<string[]>([])
  const [autoLayoutOpen, setAutoLayoutOpen] = useState(false)
  const [autoLayoutBusy, setAutoLayoutBusy] = useState(false)
  const [autoLayoutDirectives, setAutoLayoutDirectives] =
    useState<AutoLayoutDirectives>(DEFAULT_AUTO_LAYOUT_DIRECTIVES)
  const [routeNotice, setRouteNotice] = useState<string | null>(null)
  const pendingCopyRef = useRef(false)
  const sheetHostRef = useRef<HTMLDivElement>(null)
  const viewportApiRef = useRef<{
    getViewport: () => { x: number; y: number; zoom: number }
  } | null>(null)
  const viewKeyRef = useRef<string | null>(null)
  const viewRef = useRef(view)
  const edgesRef = useRef<Edge[]>([])
  const nodesRef = useRef<Node[]>([])
  const vizHistoryRef = useRef(new VizHistory())
  const showJumpersRef = useRef(showJumpers)
  const includeBindingsRef = useRef(includeBindingsInRouting)
  /** Viewport per view, kept in memory for the session only. */
  const viewportCache = useRef(new Map<string, { x: number; y: number; zoom: number }>())
  viewRef.current = view
  edgesRef.current = edges
  nodesRef.current = nodes
  showJumpersRef.current = showJumpers
  includeBindingsRef.current = includeBindingsInRouting
  const onOpenViewRef = useRef(onOpenView)
  const onPortMovedRef = useRef(onPortMoved)
  const onPortsMovedRef = useRef(onPortsMoved)
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
    (
      overrideNodes?: Node[],
      overrideEdges?: Edge[],
      opts?: { includeBindings?: boolean },
    ) => void
  >(() => {})
  const handlePortMovedRef = useRef<
    (portId: string, side: PortSide, offset: number) => void
  >(() => {})
  const handlePortsMovedRef = useRef<(moves: PortMove[]) => void>(() => {})
  const handlePortSelectRef = useRef<(portId: string) => void>(() => {})
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
  onPortsMovedRef.current = onPortsMoved
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
    const isShift = (e: KeyboardEvent) =>
      e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight'

    const onKeyDown = (e: KeyboardEvent) => {
      if (isOption(e)) setPortMoveMode(true)
      if (isShift(e)) setShiftHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (isOption(e)) setPortMoveMode(false)
      if (isShift(e)) setShiftHeld(false)
    }
    const clear = () => {
      setPortMoveMode(false)
      setShiftHeld(false)
      // Abort a stuck Option-drag if the window loses focus (Alt menu, etc.).
      document.body.classList.remove('port-dragging')
    }

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

  const lockSig = view
    ? [
        ...Object.entries(view.visualization.nodes).map(
          ([id, n]) => `n${id}:${n.editLocked ? 1 : 0}`,
        ),
        ...Object.entries(view.visualization.edges).map(
          ([id, e]) => `e${id}:${e.editLocked ? 1 : 0}`,
        ),
      ]
        .sort()
        .join('|')
    : ''

  const collapseSig = [...collapsedIds].sort().join(',')

  const filterSig = view?.viewFilters
    ? JSON.stringify(view.viewFilters)
    : ''
  const layeredSig = view?.layeredLayout
    ? JSON.stringify(view.layeredLayout)
    : ''
  const layoutRulesSig = view?.layoutRules
    ? JSON.stringify(view.layoutRules) + layeredSig
    : ''

  // flowDir is applied by redraw / buildActionFlowGraph; omit from viewKey so
  // Redraw does not rebuild from stale visualization and wipe layout positions.
  const reqDisplaySig = requirementDisplay
    ? JSON.stringify(requirementDisplay)
    : ''
  const viewKey = view
    ? `${diagramEpoch}|${view.view.id}|${view.diagramMode ?? ''}|${showAttributes}|${renderViewMode}|${structureNotation}|${reqDisplaySig}|${edgeSig}|${nodeStyleSig}|${collapseSig}|${selectedConnectionColor}|${selectedConnectionLinewidthFactor}|${filterSig}|${layoutRulesSig}|${Object.keys(view.semantic).sort().join(',')}`
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

    const stableOpen = (
      id: string,
      opts?: { ctrlKey?: boolean; metaKey?: boolean },
    ) => onOpenViewRef.current(id, opts)
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
    const filtered = applyViewFilters(
      view.semantic,
      view.visualization,
      view.viewFilters || [],
    )
    const filteredView: ViewPayload = {
      ...view,
      semantic: filtered.semantic,
      visualization: filtered.visualization,
    }
    switch (view.diagramMode) {
      case 'sequence':
        built = buildSequenceGraph(filteredView, renderViewMode, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'state':
        built = buildStateGraph(filteredView, renderViewMode, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'actionFlow':
        built = buildActionFlowGraph(filteredView, renderViewMode, flowDirRef.current, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'tree':
        built = buildTreeGraph(
          filteredView,
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
          view: filteredView,
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
        built = buildUseCaseGraph(filteredView, renderViewMode, {
          selectedConnectionColor,
          selectedConnectionLinewidthFactor,
        })
        break
      case 'requirementTable':
        built = { nodes: [], edges: [] }
        break
      default:
        built = buildStructureGraph({
          view: filteredView,
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
          requirementDisplay,
        })
    }
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
        draggable: !portMoveMode && !isEditLocked(view.visualization.nodes[node.id]),
        data: {
          ...(node.data as PartNodeData),
          editLocked: isEditLocked(view.visualization.nodes[node.id]),
          portMoveMode,
          selectedPortIds,
          onOpenView: (id: string) => onOpenViewRef.current(id),
          onPortDrag: (portId: string, side: PortSide, offset: number) =>
            handlePortMovedRef.current(portId, side, offset),
          onPortsDrag: (moves: PortMove[]) =>
            handlePortsMovedRef.current(moves),
          onPortSelect: (portId: string) => handlePortSelectRef.current(portId),
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
          // Free-form anchors break exact N=relations on use-case diagrams.
          onAddAnchor:
            mode === 'useCase'
              ? undefined
              : (side: PortSide, offset: number) =>
                  handleAddAnchorRef.current(node.id, side, offset),
        },
      })),
    )
    setEdges(
      geometry.edges.map((edge) => ({
        ...edge,
        interactionWidth: 24,
        data: {
          ...(edge.data as object),
          altHeld: portMoveMode,
          editLocked: isEditLocked(view.visualization.edges[edge.id]),
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
  // While Option is held, the selected edge also stacks above other edges.
  useEffect(() => {
    const wanted = new Set(selectedIds)
    setNodes((current) => {
      let changed = false
      const next = current.map((item) => {
        const selected = wanted.has(item.id)
        if (!!item.selected === selected) return item
        changed = true
        return { ...item, selected }
      })
      return changed ? next : current
    })
    setEdges((current) => {
      let changed = false
      const next = current.map((item) => {
        const selected = wanted.has(item.id)
        const zIndex = edgeStackZIndex(portMoveMode, selected)
        if (!!item.selected === selected && item.zIndex === zIndex) return item
        changed = true
        return { ...item, selected, zIndex }
      })
      return changed ? next : current
    })
  }, [selectedIds, portMoveMode])

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
    const v = viewRef.current
    setNodes((current) => {
      if (!current.length || !v) return current
      return current.map((node) => ({
        ...node,
        draggable: !portMoveMode && !isEditLocked(v.visualization.nodes[node.id]),
        data: {
          ...(node.data as PartNodeData),
          editLocked: isEditLocked(v.visualization.nodes[node.id]),
          portMoveMode,
          selectedPortIds,
          onOpenView: (id: string) => onOpenViewRef.current(id),
          onPortDrag: (portId: string, side: PortSide, offset: number) =>
            handlePortMovedRef.current(portId, side, offset),
          onPortsDrag: (moves: PortMove[]) =>
            handlePortsMovedRef.current(moves),
          onPortSelect: (portId: string) => handlePortSelectRef.current(portId),
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
        zIndex: edgeStackZIndex(portMoveMode, !!edge.selected),
        data: {
          ...(edge.data as object),
          altHeld: portMoveMode,
          editLocked: isEditLocked(v?.visualization.edges[edge.id]),
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
  }, [portMoveMode, syncRelationGeometry, lockSig, selectedPortIds])

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => {
        const applied = applyNodeChanges(changes, nds)
        const next = applyDimensionChangesToStyle(applied, changes)
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
      const { width, height } = nodeExtentSize(node)
      const patch: Record<string, Partial<VisualizationNode>> = {
        [node.id]: {
          artifactId: node.id,
          x: node.position.x,
          y: node.position.y,
          width,
          height,
        },
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

  const currentViewBounds = useCallback(() => {
    const vp =
      viewportApiRef.current?.getViewport() ||
      (view ? viewportCache.current.get(view.view.id) : undefined)
    const host = sheetHostRef.current
    if (!vp || !host) return undefined
    const w = host.clientWidth || 0
    const h = host.clientHeight || 0
    if (w < 8 || h < 8) return undefined
    return flowViewportBounds(vp, w, h)
  }, [view])

  const applyRedrawConnections = useCallback(
    (
      overrideNodes?: Node[],
      overrideEdges?: Edge[],
      opts?: { includeBindings?: boolean },
    ) => {
      // Only re-route edges — never patch part/port positions or sizes.
      // Routes stay inside the current viewport; off-screen endpoints are skipped.
      const routeNodes = Array.isArray(overrideNodes) ? overrideNodes : nodes
      const contextEdges = edges
      const routeEdges = Array.isArray(overrideEdges) ? overrideEdges : contextEdges
      if (!routeNodes.length || !routeEdges.length) return
      const layoutOpts = {
        // Port-move callers pass includeBindings: true so attached binds follow
        // the port even when Settings excludes bindings from bulk Redraw.
        includeBindings:
          opts?.includeBindings ?? includeBindingsRef.current,
      }
      const angularContext = asAngularForLayout(contextEdges, layoutOpts)
      const angularRoute = asAngularForLayout(routeEdges, layoutOpts)
      const existing = angularContext.map((edge) => {
        const data = (edge.data || {}) as SysmlEdgeData
        return { id: edge.id, waypoints: data.waypoints || [] }
      })
      const singleId =
        angularRoute.length === 1 ? angularRoute[0]!.id : undefined
      const viewBounds = currentViewBounds()
      void planStructureRoutes({
        mode: singleId ? 'single' : 'full',
        edgeId: singleId,
        layoutNodes: false,
        nodes: routeNodes,
        edges: angularRoute,
        contextEdges: angularContext,
        existingRoutes: existing,
        portLayout: viewRef.current?.visualization.nodes,
        separation: connectionSeparation,
        computeJumpers: showJumpersRef.current,
        viewBounds,
      }).then((planned) => {
        const outside = planned.skipped.filter(
          (s) => s.reason === 'endpoint-outside-view',
        )
        const missing = planned.skipped.filter(
          (s) => s.reason === 'missing-endpoint',
        )
        if (outside.length || missing.length) {
          const parts: string[] = []
          if (outside.length) {
            parts.push(
              outside.length === 1
                ? 'One connection has ports outside the current view'
                : `${outside.length} connections have ports outside the current view`,
            )
          }
          if (missing.length) {
            parts.push(
              missing.length === 1
                ? 'One connection is missing a port on the diagram'
                : `${missing.length} connections are missing a port on the diagram`,
            )
          }
          setRouteNotice(
            `${parts.join('. ')}. Zoom out so both ends are visible, then try again.`,
          )
        } else {
          setRouteNotice(null)
        }
        const routed = planned.routes
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
      })
    },
    [nodes, edges, connectionSeparation, currentViewBounds],
  )

  const pushVizHistory = useCallback(() => {
    const viz = viewRef.current?.visualization
    if (!viz) return
    vizHistoryRef.current.push({ nodes: viz.nodes, edges: viz.edges })
    setHistoryTick((n) => n + 1)
  }, [])

  const restoreVizSnapshot = useCallback(
    (snap: {
      nodes: Record<string, VisualizationNode>
      edges: Record<string, VisualizationEdge>
    }) => {
      const nodePatch: Record<string, Partial<VisualizationNode>> = {}
      for (const [id, node] of Object.entries(snap.nodes)) {
        nodePatch[id] = { ...node }
      }
      const edgePatch: Record<string, Partial<VisualizationEdge>> = {}
      for (const [id, edge] of Object.entries(snap.edges)) {
        edgePatch[id] = { ...edge }
      }
      onNodesMovedRef.current(nodePatch, edgePatch)
      setLayoutEpoch((n) => n + 1)
      setHistoryTick((n) => n + 1)
    },
    [],
  )

  const handleUndo = useCallback(() => {
    const viz = viewRef.current?.visualization
    if (!viz) return
    const prev = vizHistoryRef.current.undo({
      nodes: viz.nodes,
      edges: viz.edges,
    })
    if (prev) restoreVizSnapshot(prev)
  }, [restoreVizSnapshot])

  const handleRedo = useCallback(() => {
    const viz = viewRef.current?.visualization
    if (!viz) return
    const next = vizHistoryRef.current.redo({
      nodes: viz.nodes,
      edges: viz.edges,
    })
    if (next) restoreVizSnapshot(next)
  }, [restoreVizSnapshot])

  const handleFlipPorts = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      const semantic = viewRef.current?.semantic
      if (!semantic) return
      const partIds = new Set(
        selectedIdsRef.current.filter((id) => semantic[id]?.kind === 'part'),
      )
      if (!partIds.size) return
      // Compute moves sync from live nodes — never build the persist patch
      // inside a setState updater (React may defer it; patch stayed empty).
      const moves = collectFlipPortMoves(
        nodesRef.current.map((node) => {
          const data = node.data as PartNodeData
          const size = nodeBoxSize(node, {
            height: viewRef.current?.visualization.nodes[node.id]?.height,
          })
          return {
            id: node.id,
            height: size.height,
            ports: data.ports || [],
            isBoundary: !!data.isBoundary,
          }
        }),
        partIds,
        axis,
      )
      if (!moves.length) return
      pushVizHistory()
      handlePortsMovedRef.current(moves)
    },
    [pushVizHistory],
  )

  const handlePortSelect = useCallback((portId: string) => {
    setSelectedPortIds((prev) =>
      prev.includes(portId)
        ? prev.filter((id) => id !== portId)
        : [...prev, portId],
    )
  }, [])
  handlePortSelectRef.current = handlePortSelect

  const handlePortsBoxed = useCallback((portIds: string[]) => {
    setSelectedPortIds((prev) => {
      const next = new Set(prev)
      for (const id of portIds) next.add(id)
      return [...next]
    })
  }, [])

  /** Listeners always on in structure; Option+Shift checked on the pointer event. */
  const portMarqueeEnabled = !printMode && isStructure

  const handleDistributePorts = useCallback(
    (axis: 'horizontal' | 'vertical') => {
      if (selectedPortIds.length < 2) return
      const wanted = new Set(selectedPortIds)
      const moves: PortMove[] = []
      for (const node of nodesRef.current) {
        const data = node.data as PartNodeData | undefined
        if (!data?.ports?.length) continue
        const picked = data.ports.filter((p) => wanted.has(p.id))
        if (!picked.length) continue
        const size = nodeBoxSize(node, {
          width: viewRef.current?.visualization.nodes[node.id]?.width,
          height: viewRef.current?.visualization.nodes[node.id]?.height,
        })
        moves.push(
          ...collectDistributePortMoves(
            picked.map((p) => ({
              id: p.id,
              side: p.side,
              offset: p.offset,
            })),
            axis,
            {
              width: size.width,
              height: size.height,
              isBoundary: !!data.isBoundary,
            },
          ),
        )
      }
      if (!moves.length) return
      pushVizHistory()
      handlePortsMovedRef.current(moves)
    },
    [selectedPortIds, pushVizHistory],
  )

  const handleUpdateJumpers = useCallback(() => {
    if (!showJumpersRef.current) return
    const routeEdges = edgesRef.current.filter((edge) => {
      const data = (edge.data || {}) as SysmlEdgeData
      return data.routing === 'angular' || !data.routing
    })
    if (!routeEdges.length) return
    pushVizHistory()
    const jumpsById = computeUpdateJumpers(nodesRef.current, routeEdges)
    setEdges((current) =>
      current.map((edge) => {
        const jumps = jumpsById.get(edge.id)
        if (!jumps) {
          const data = (edge.data || {}) as SysmlEdgeData
          if (!data.jumps?.length) return edge
          return {
            ...edge,
            data: { ...data, jumps: [] } satisfies SysmlEdgeData,
          }
        }
        const data = (edge.data || {}) as SysmlEdgeData
        return {
          ...edge,
          data: { ...data, jumps } satisfies SysmlEdgeData,
        }
      }),
    )
  }, [pushVizHistory])

  const handlePortMoved = useCallback(
    (portId: string, side: PortSide, offset: number) => {
      handlePortsMovedRef.current([{ portId, side, offset }])
    },
    [],
  )

  const handlePortsMoved = useCallback((moves: PortMove[]) => {
    if (!moves.length) return
    let nextNodes: Node[] = []
    setNodes((current) => {
      nextNodes = applyPortMovesToNodes(current, moves)
      return nextNodes
    })
    const movedIds = new Set(moves.map((m) => m.portId))
    const connected = edgesRef.current.filter((edge) => {
      const src = edge.sourceHandle || ''
      const tgt = (edge.targetHandle || '').replace(/^target:/, '')
      return movedIds.has(src) || movedIds.has(tgt)
    })
    // Include angular bindings and connections attached to moved ports.
    const angular = connected.filter((edge) => {
      const data = (edge.data || {}) as SysmlEdgeData
      return (data.routing || 'angular') === 'angular'
    })
    if (angular.length) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const nodesForRoute =
            nodesRef.current.length > 0 ? nodesRef.current : nextNodes
          // Always include bindings so proxy binds follow the port after Flip /
          // Distribute / drag (Settings toggle still gates bulk Redraw).
          applyRedrawConnectionsRef.current(nodesForRoute, angular, {
            includeBindings: true,
          })
        })
      })
    }
    if (onPortsMovedRef.current) {
      onPortsMovedRef.current(moves)
      return
    }
    if (moves.length === 1) {
      const m = moves[0]!
      onPortMovedRef.current(m.portId, m.side, m.offset)
      return
    }
    const patch: Record<string, Partial<VisualizationNode>> = {}
    for (const m of moves) {
      patch[m.portId] = {
        artifactId: m.portId,
        side: m.side,
        offset: m.offset,
      }
    }
    onNodesMovedRef.current(patch)
  }, [])

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
      const raw =
        (node?.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors || []
      // Use-case / actor diagrams own exact relation anchors — do not inject defaults.
      const base =
        node?.type === 'useCase' || node?.type === 'actor'
          ? raw
          : resolveAnchors(raw)
      const anchors = base.map((a) =>
        a.id === anchorId ? { ...a, side, offset } : a,
      )
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
  handlePortsMovedRef.current = handlePortsMoved
  handleRelationEndDragRef.current = handleRelationEndDrag
  handleAnchorDragRef.current = handleAnchorDrag
  handleAddAnchorRef.current = handleAddAnchor
  redrawConnectionsRef.current = (n, e) => applyRedrawConnectionsRef.current(n, e)

  useEffect(() => {
    const req = autorouteRequest
    if (!req?.connectionId || req.seq == null) return
    if (req.seq === lastAutorouteSeqRef.current) return
    lastAutorouteSeqRef.current = req.seq
    if (mode === 'useCase') {
      const { nodes: nextNodes, edges: next, edgePatch, nodePatch } =
        redrawUseCaseRelations(nodesRef.current, edgesRef.current, {
          onlyId: req.connectionId,
        })
      if (!Object.keys(edgePatch).length) return
      setNodes(nextNodes)
      setEdges(next)
      onNodesMovedRef.current(nodePatch, edgePatch)
      return
    }
    if (!isStructure) return
    const edge = edgesRef.current.find((e) => e.id === req.connectionId)
    if (!edge) return
    const data = (edge.data || {}) as SysmlEdgeData
    if ((data.routing || 'angular') !== 'angular') return
    applyRedrawConnectionsRef.current(nodesRef.current, [edge])
  }, [autorouteRequest?.connectionId, autorouteRequest?.seq, isStructure, mode])

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

  /** Artefacts (absolute geometry) for Layout Rules / constraints. */
  const layoutArtefacts = useCallback((): LayoutArtefact[] => {
    if (!view) return []
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return nodes
      .filter((n) => view.semantic[n.id])
      .map((n): LayoutArtefact => {
        const el = view.semantic[n.id]
        const origin = absoluteNodeOrigin(n, byId)
        return {
          id: n.id,
          name: el.name,
          kind: el.kind,
          parentId: el.parentId ?? null,
          x: origin.x,
          y: origin.y,
          width: Number(n.style?.width) || n.width || 100,
          height: Number(n.style?.height) || n.height || 40,
        }
      })
  }, [nodes, view])

  /** Root boundary id (whitebox); null for package-style views. */
  const boundaryIdForConstraints = useCallback((): string | null => {
    const partIds = new Set(nodes.filter((n) => !n.type || n.type === 'part').map((n) => n.id))
    const root = nodes.find(
      (n) =>
        (!n.type || n.type === 'part') &&
        (n.data as PartNodeData | undefined)?.isBoundary &&
        !(n.parentId && partIds.has(n.parentId)),
    )
    return root?.id ?? null
  }, [nodes])

  /** Hard constraints for the hierarchic pipeline from rules + layered config. */
  const constraintsFor = useCallback(
    (
      rules: LayoutRuleRow[],
      layered: LayeredLayoutConfig | null,
      directives: AutoLayoutDirectives,
    ) =>
      buildLayoutConstraints(
        rules,
        layered,
        layoutArtefacts(),
        asAngularForLayout(edges, {
          includeBindings: includeBindingsRef.current,
        }).map((e) => ({ source: e.source, target: e.target })),
        {
          direction: layerDirectionForHierarchic(
            clampHierarchicOptions(directives.hierarchic).direction,
          ),
          rootId: boundaryIdForConstraints(),
        },
      ),
    [edges, layoutArtefacts, boundaryIdForConstraints],
  )

  const applyAutoLayout = useCallback(async (input: AutoLayoutDirectives) => {
    // Include direct connections too — otherwise ELK sees no edges and stacks
    // every part in one vertical column, and routing stays "direct".
    setAutoLayoutBusy(true)
    try {
    const isHierarchic =
      (input.mode ?? 'simple') === 'advanced' && input.pipeline === 'hierarchic'
    const directives: AutoLayoutDirectives =
      isHierarchic && !input.constraints
        ? {
            ...input,
            constraints: constraintsFor(
              view?.layoutRules || [],
              view?.layeredLayout ?? null,
              input,
            ),
          }
        : input
    const structureEdges = asAngularForLayout(edges, {
      includeBindings: includeBindingsRef.current,
    })
    const existing = structureEdges.map((edge) => {
      const data = (edge.data || {}) as SysmlEdgeData
      return { id: edge.id, waypoints: data.waypoints || [] }
    })
    const planned = await planStructureRoutes({
      mode: 'full',
      layoutNodes: true,
      nodes,
      edges: structureEdges,
      existingRoutes: existing,
      separation: connectionSeparation,
      computeJumpers: showJumpersRef.current,
      directives,
    })
    if (!Object.keys(planned.nodes).length && !planned.routes.length) return

    const layoutNodes = planned.nodes
    const nextNodes = Object.keys(layoutNodes).length
      ? nodes.map((node) => {
          const patch = layoutNodes[node.id]
          if (!patch) {
            const data = node.data as PartNodeData
            if (!data?.ports?.length) return node
            return {
              ...node,
              data: {
                ...data,
                ports: data.ports.map((p) => {
                  const pp = layoutNodes[p.id]
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
              width:
                patch.width ??
                nodeExtentSize(node).width ??
                node.width,
              height:
                patch.height ??
                nodeExtentSize(node).height ??
                node.height,
            },
            data: data?.ports
              ? {
                  ...data,
                  ports: data.ports.map((p) => {
                    const pp = layoutNodes[p.id]
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
      : nodes

    const routed = planned.routes
    const byId = new Map(routed.map((r) => [r.id, r]))
    const liveBounds = boundaryFlowBounds(nextNodes)
    const nextEdges = syncInternalEdgeBounds(
      nextNodes,
      edges.map((edge) => {
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
            ...(liveBounds && (data.internal || data.parentBounds)
              ? { parentBounds: liveBounds }
              : {}),
          } satisfies SysmlEdgeData,
        }
      }),
    )
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
    onNodesMovedRef.current(layoutNodes, edgePatch)
    setLayoutEpoch((n) => n + 1)
    // Remember the choice without the per-run constraints snapshot.
    setAutoLayoutDirectives({ ...directives, constraints: undefined })
    setAutoLayoutOpen(false)
    } finally {
      setAutoLayoutBusy(false)
    }
  }, [nodes, edges, connectionSeparation, constraintsFor, view?.layoutRules, view?.layeredLayout])

  // Hide jumpers immediately when the setting turns off (keep waypoints).
  useEffect(() => {
    if (showJumpers) return
    setEdges((current) =>
      current.map((edge) => {
        const data = (edge.data || {}) as SysmlEdgeData
        if (!data.jumps?.length) return edge
        return {
          ...edge,
          data: { ...data, jumps: [] } satisfies SysmlEdgeData,
        }
      }),
    )
  }, [showJumpers])

  // Clear undo stack and port multi-select when switching views.
  useEffect(() => {
    const key = view?.view.id ?? null
    if (viewKeyRef.current && key && viewKeyRef.current !== key) {
      vizHistoryRef.current.clear()
      setHistoryTick((n) => n + 1)
      setSelectedPortIds([])
    }
  }, [view?.view.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      handleCanvasShortcut(e, {
        undo: handleUndo,
        redo: handleRedo,
        selectAll: () => {
          const ids = allDiagramIds(nodesRef.current, edgesRef.current)
          onSelectionFromFlowRef.current?.(ids)
        },
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  const selectedDirectAlign = useMemo(() => {
    if (selectedIds.length !== 1) return null
    const edge = edges.find((e) => e.id === selectedIds[0])
    if (!edge) return null
    return resolveDirectConnectionAlignTarget(edge, nodes)
  }, [selectedIds, edges, nodes])

  const applyDirectConnectionAlign = useCallback(
    (mode: ConnectionAlignMode) => {
      if (!selectedDirectAlign) return
      // Source (first / from) port is always the fixed reference.
      const { patch } = alignDirectConnection(
        mode,
        selectedDirectAlign.srcPart,
        selectedDirectAlign.tgtPart,
        selectedDirectAlign.srcPort,
        selectedDirectAlign.tgtPort,
        'src',
      )
      if (!Object.keys(patch).length) return
      let nextNodes: Node[] = []
      setNodes((current) => {
        nextNodes = current.map((node) => {
          const data = node.data as PartNodeData | undefined
          if (!data?.ports?.length) return node
          let changed = false
          const ports = data.ports.map((p) => {
            const pp = patch[p.id]
            if (!pp) return p
            changed = true
            return {
              ...p,
              side: (pp.side as PortSide) || p.side,
              offset: pp.offset ?? p.offset,
            }
          })
          return changed ? { ...node, data: { ...data, ports } } : node
        })
        return nextNodes
      })
      onNodesMoved(patch)
      // Force edge path refresh after handles move (direct line uses RF ends).
      const edgeId = selectedIds[0]
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const nodesForRoute =
            nodesRef.current.length > 0 ? nodesRef.current : nextNodes
          setEdges((current) =>
            current.map((edge) => {
              if (edge.id !== edgeId) return edge
              const data = (edge.data || {}) as SysmlEdgeData
              return {
                ...edge,
                data: { ...data },
              }
            }),
          )
          // Angular edges need full reroute; direct just needs handle sync above.
          const edge = edgesRef.current.find((e) => e.id === edgeId)
          if (
            edge &&
            ((edge.data || {}) as SysmlEdgeData).routing === 'angular'
          ) {
            applyRedrawConnectionsRef.current(nodesForRoute, [edge])
          }
        })
      })
      setLayoutEpoch((n) => n + 1)
    },
    [selectedDirectAlign, selectedIds, onNodesMoved],
  )

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
    const filteredReq = applyViewFilters(
      view.semantic,
      view.visualization,
      view.viewFilters || [],
    )
    const rows = buildRequirementRows(
      filteredReq.semantic,
      reqTableMode,
      requirementDisplay,
    )
    return (
      <div className="diagram-canvas requirement-table-canvas">
        {!printMode && (
          <div className="diagram-canvas-header">
            <strong className="diagram-view-name">{view.view.name}</strong>
            <span className="diagram-mode-badge">
              {DIAGRAM_MODE_LABELS.requirementTable}
            </span>
            <div className="redraw-actions">
              <DiagramEditToolbar
                view={view}
                selectedIds={selectedIds}
                onNodesMoved={onNodesMoved}
                beforeMutation={pushVizHistory}
              />
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
            {onBackView ? (
              <button
                type="button"
                onClick={() => onBackView()}
                title="Go to previous diagram"
              >
                Back
              </button>
            ) : null}
            <IconToolbarButton
              icon={TOOLBAR_ICONS.undo}
              title="Undo (Ctrl/Cmd+Z)"
              disabled={historyTick >= 0 && !vizHistoryRef.current.canUndo()}
              onClick={handleUndo}
            />
            <IconToolbarButton
              icon={TOOLBAR_ICONS.redo}
              title="Redo (Ctrl/Cmd+Y)"
              disabled={historyTick >= 0 && !vizHistoryRef.current.canRedo()}
              onClick={handleRedo}
            />
            <DiagramEditToolbar
              view={view}
              selectedIds={selectedIds}
              onNodesMoved={onNodesMoved}
              beforeMutation={pushVizHistory}
            />
            <IconToolbarButton
              icon={TOOLBAR_ICONS.copy}
              title="Copy diagram image to clipboard (always light theme, white background)"
              disabled={copyState === 'busy'}
              statusLabel={
                copyState === 'busy'
                  ? 'Copying…'
                  : copyState === 'ok'
                    ? 'Copied'
                    : copyState === 'err'
                      ? 'Copy failed'
                      : undefined
              }
              onClick={onCopyImage}
            />
            {isStructure ? (
              <>
                <IconToolbarButton
                  icon={TOOLBAR_ICONS.layoutRules}
                  title="Layout Rules"
                  onClick={() => setLayoutWizardOpen(true)}
                />
                <IconToolbarButton
                  icon={TOOLBAR_ICONS.autoLayout}
                  title="Open AutoLayout directives, then place parts/ports and route connections"
                  onClick={() => setAutoLayoutOpen(true)}
                />
                <button
                  type="button"
                  onClick={() => {
                    pushVizHistory()
                    applyRedrawConnections()
                  }}
                  title="Reroute connections around parts using current port placement (does not move parts or ports)"
                >
                  Redraw: Connections
                </button>
                <IconToolbarButton
                  icon={TOOLBAR_ICONS.flipH}
                  title="Flip port placement horizontal"
                  disabled={
                    !selectedIds.some(
                      (id) => view.semantic[id]?.kind === 'part',
                    )
                  }
                  onClick={() => handleFlipPorts('horizontal')}
                />
                <IconToolbarButton
                  icon={TOOLBAR_ICONS.flipV}
                  title="Flip port placement vertical"
                  disabled={
                    !selectedIds.some(
                      (id) => view.semantic[id]?.kind === 'part',
                    )
                  }
                  onClick={() => handleFlipPorts('vertical')}
                />
                {selectedPortIds.length >= 2 ||
                selectedIds.filter((id) => view.semantic[id]?.kind === 'part')
                  .length >= 3 ? (
                  <>
                    <IconToolbarButton
                      icon={TOOLBAR_ICONS.distributeH}
                      title={
                        selectedPortIds.length >= 2
                          ? 'Distribute selected ports horizontally (even spacing between extremes)'
                          : 'Distribute selected parts horizontally (even center spacing)'
                      }
                      onClick={() => {
                        if (selectedPortIds.length >= 2) {
                          handleDistributePorts('horizontal')
                          return
                        }
                        const partIds = selectedIds.filter(
                          (id) => view.semantic[id]?.kind === 'part',
                        )
                        const { patch } = distributeFlowSelection(
                          nodes,
                          partIds,
                          'horizontal',
                        )
                        if (!Object.keys(patch).length) return
                        pushVizHistory()
                        setNodes((current) =>
                          applyAlignPatchToFlowNodes(current, patch),
                        )
                        onNodesMoved(patch)
                      }}
                    />
                    <IconToolbarButton
                      icon={TOOLBAR_ICONS.distributeV}
                      title={
                        selectedPortIds.length >= 2
                          ? 'Distribute selected ports vertically (even spacing between extremes)'
                          : 'Distribute selected parts vertically (even center spacing)'
                      }
                      onClick={() => {
                        if (selectedPortIds.length >= 2) {
                          handleDistributePorts('vertical')
                          return
                        }
                        const partIds = selectedIds.filter(
                          (id) => view.semantic[id]?.kind === 'part',
                        )
                        const { patch } = distributeFlowSelection(
                          nodes,
                          partIds,
                          'vertical',
                        )
                        if (!Object.keys(patch).length) return
                        pushVizHistory()
                        setNodes((current) =>
                          applyAlignPatchToFlowNodes(current, patch),
                        )
                        onNodesMoved(patch)
                      }}
                    />
                  </>
                ) : null}
                {showJumpers ? (
                  <IconToolbarButton
                    icon={TOOLBAR_ICONS.updateJumpers}
                    title="Update jumpers"
                    onClick={handleUpdateJumpers}
                  />
                ) : null}
                {selectedIds.length >= 2 || selectedDirectAlign ? (
                  <>
                    <IconToolbarButton
                      icon={TOOLBAR_ICONS.alignH}
                      title={
                        selectedDirectAlign
                          ? 'Align target port to source port X (vertical line)'
                          : 'Align selected to first selected (horizontal = same Y)'
                      }
                      disabled={
                        !!selectedDirectAlign &&
                        !canAlignDirectConnection(
                          'sameX',
                          selectedDirectAlign.srcPart,
                          selectedDirectAlign.tgtPart,
                          selectedDirectAlign.srcPort,
                          selectedDirectAlign.tgtPort,
                          'src',
                        )
                      }
                      onClick={() => {
                        if (selectedDirectAlign) {
                          pushVizHistory()
                          applyDirectConnectionAlign('sameX')
                          return
                        }
                        const { patch } = alignFlowSelection(
                          nodes,
                          selectedIds,
                          'horizontal',
                        )
                        if (!Object.keys(patch).length) return
                        pushVizHistory()
                        setNodes((current) =>
                          applyAlignPatchToFlowNodes(current, patch),
                        )
                        onNodesMoved(patch)
                      }}
                    />
                    <IconToolbarButton
                      icon={TOOLBAR_ICONS.alignV}
                      title={
                        selectedDirectAlign
                          ? 'Align target port to source port Y (horizontal line)'
                          : 'Align selected to first selected (vertical = same X)'
                      }
                      disabled={
                        !!selectedDirectAlign &&
                        !canAlignDirectConnection(
                          'sameY',
                          selectedDirectAlign.srcPart,
                          selectedDirectAlign.tgtPart,
                          selectedDirectAlign.srcPort,
                          selectedDirectAlign.tgtPort,
                          'src',
                        )
                      }
                      onClick={() => {
                        if (selectedDirectAlign) {
                          pushVizHistory()
                          applyDirectConnectionAlign('sameY')
                          return
                        }
                        const { patch } = alignFlowSelection(
                          nodes,
                          selectedIds,
                          'vertical',
                        )
                        if (!Object.keys(patch).length) return
                        pushVizHistory()
                        setNodes((current) =>
                          applyAlignPatchToFlowNodes(current, patch),
                        )
                        onNodesMoved(patch)
                      }}
                    />
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
                {mode === 'useCase' ? (
                  <button
                    type="button"
                    onClick={() => {
                      pushVizHistory()
                      const {
                        nodes: nextNodes,
                        edges: next,
                        edgePatch,
                        nodePatch,
                      } = redrawUseCaseRelations(nodes, edges)
                      if (!Object.keys(edgePatch).length) return
                      setNodes(nextNodes)
                      setEdges(next)
                      onNodesMovedRef.current(nodePatch, edgePatch)
                    }}
                    title="Recompute facing anchors for include, extend, and actor associations (does not move nodes)"
                  >
                    Redraw: Relations
                  </button>
                ) : null}
                <IconToolbarButton
                  icon={TOOLBAR_ICONS.layoutRules}
                  title="Layout Rules"
                  onClick={() => setLayoutWizardOpen(true)}
                />
              </>
            )}
          </div>
        </div>
      )}
      {view && (
        <LayoutWizardDialog
          open={layoutWizardOpen}
          rules={view.layoutRules || []}
          layered={view.layeredLayout ?? null}
          onChangeLayered={(layered) => onLayeredLayoutChange?.(layered)}
          semantic={view.semantic}
          artefacts={layoutArtefacts()}
          onChangeRules={(rules) => onLayoutRulesChange?.(rules)}
          onApplyLayered={(layered, rules) => {
            const base: AutoLayoutDirectives = {
              ...autoLayoutDirectives,
              mode: 'advanced',
              pipeline: 'hierarchic',
              hierarchic: {
                ...clampHierarchicOptions(autoLayoutDirectives.hierarchic),
                direction: hierarchicDirectionForLayers(
                  rootScope(normalizeLayeredLayout(layered)).direction,
                ),
              },
            }
            pushVizHistory()
            setLayoutWizardOpen(false)
            void applyAutoLayout({
              ...base,
              constraints: constraintsFor(rules, layered, base),
            })
          }}
          onApplyPositions={(positions) => {
            const byId = new Map(nodes.map((n) => [n.id, n]))
            const patch: Record<string, Partial<VisualizationNode>> = {}
            for (const [id, pos] of Object.entries(positions)) {
              const cur = nodes.find((n) => n.id === id)
              if (!cur) continue
              const rel = relativePositionFromFlow(cur, pos, byId)
              if (cur.position.x === rel.x && cur.position.y === rel.y) continue
              patch[id] = { x: rel.x, y: rel.y }
            }
            if (Object.keys(patch).length) {
              setNodes((prev) =>
                prev.map((n) =>
                  patch[n.id]
                    ? {
                        ...n,
                        position: {
                          x: patch[n.id].x ?? n.position.x,
                          y: patch[n.id].y ?? n.position.y,
                        },
                      }
                    : n,
                ),
              )
              onNodesMoved(patch)
            }
            setLayoutWizardOpen(false)
          }}
          onClose={() => setLayoutWizardOpen(false)}
        />
      )}
      <div className="diagram-sheet-host" ref={sheetHostRef}>
        {!printMode && portMoveMode && isStructure && (
          <div className="tool-banner" role="status">
            {shiftHeld
              ? 'Markera portar — klicka eller dra en rektangel'
              : 'Move ports — dra längs partens kant (Option+Shift = markera)'}
          </div>
        )}
        {!printMode && formatPaintMode && (
          <div className="tool-banner" role="status">
            Format paint — click a target
          </div>
        )}
        {!printMode && routeNotice && (
          <div className="tool-banner tool-banner-warn" role="status">
            <span>{routeNotice}</span>
            <button
              type="button"
              className="tool-banner-dismiss"
              onClick={() => setRouteNotice(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
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
          onNodeDoubleClick={
            printMode || !onNodeDoubleClick
              ? undefined
              : (_e, node) => {
                  const el = view?.semantic[node.id]
                  if (el) onNodeDoubleClick(node.id, el.kind)
                }
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
          onPaneClick={
            printMode
              ? undefined
              : () => {
                  if (suppressPortMarqueePaneClickRef.current) {
                    suppressPortMarqueePaneClickRef.current = false
                    return
                  }
                  setSelectedPortIds([])
                  onSelectArtifact(
                    selectionIdForPaneClick(view?.view.id ?? null),
                  )
                }
          }
          onSelectionChange={printMode ? undefined : handleSelectionChange}
          multiSelectionKeyCode="Shift"
          selectionKeyCode={portMoveMode ? null : 'Shift'}
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
          panOnDrag={!printMode && !portMoveMode}
          zoomOnScroll={!printMode}
          zoomOnPinch={!printMode}
          zoomOnDoubleClick={!printMode}
          preventScrolling={!printMode}
          connectionMode={ConnectionMode.Loose}
          connectionLineType={connectionLineType}
          proOptions={{ hideAttribution: true }}
        >
          <EdgeMarkerDefs />
          <ViewportApiBridge apiRef={viewportApiRef} />
          <PortMarqueeLayer
            enabled={portMarqueeEnabled}
            nodesRef={nodesRef}
            onPortsBoxed={handlePortsBoxed}
            suppressPaneClickRef={suppressPortMarqueePaneClickRef}
          />
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
      <AutoLayoutDialog
        open={autoLayoutOpen}
        initial={autoLayoutDirectives}
        busy={autoLayoutBusy}
        onCancel={() => {
          if (!autoLayoutBusy) setAutoLayoutOpen(false)
        }}
        onConfirm={(d) => {
          pushVizHistory()
          void applyAutoLayout(d)
        }}
      />
    </div>
  )
}
