import {
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
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
  PortSide,
  RoutingType,
  SemanticElement,
  ViewPayload,
  VisualizationEdge,
  VisualizationNode,
} from '../../api'
import { PartNode, type PartNodeData } from './PartNode'
import { SysmlEdge, type SysmlEdgeData } from './InternalEdge'
import {
  translateFlowBounds,
  translatePoints,
  type FlowBounds,
  type Pt,
} from './edgeRouting'

const nodeTypes: NodeTypes = {
  part: PartNode,
}

const edgeTypes: EdgeTypes = {
  sysml: SysmlEdge,
}

function routingToEdgeType(routing: RoutingType): string {
  switch (routing) {
    case 'direct':
      return 'straight'
    case 'spline':
      return 'default'
    case 'angular':
    default:
      return 'smoothstep'
  }
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

function findOwnerPart(
  portId: string,
  semantic: Record<string, SemanticElement>,
  displayIds: Set<string>,
): string | null {
  let current = semantic[portId]
  while (current) {
    if (current.kind === 'part' && displayIds.has(current.id)) {
      return current.id
    }
    if (!current.parentId) break
    current = semantic[current.parentId]
  }
  return null
}

function portIdFromHandle(handleId: string | null | undefined): string | null {
  if (!handleId) return null
  return handleId.startsWith('target:') ? handleId.slice('target:'.length) : handleId
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

function buildPorts(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  visualization: ViewPayload['visualization'],
) {
  return (el.children || [])
    .map((cid) => semantic[cid])
    .filter((c): c is SemanticElement => !!c && c.kind === 'port')
    .map((port, idx) => {
      const pv = visualization.nodes[port.id]
      return {
        id: port.id,
        name: port.name,
        side: (pv?.side || (idx % 2 === 0 ? 'left' : 'right')) as PortSide,
        offset: pv?.offset ?? 0.3 + idx * 0.15,
      }
    })
}

function buildGraph(
  view: ViewPayload,
  onOpenView: (viewId: string) => void,
  onPortMoved: (portId: string, side: PortSide, offset: number) => void,
  portMoveMode: boolean,
  showAttributes: boolean,
  onWaypointsChange: (
    artifactId: string,
    waypoints: { x: number; y: number }[],
  ) => void,
  onLabelOffsetChange: (
    artifactId: string,
    offset: { x: number; y: number },
  ) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { semantic, visualization, menus } = view
  const rootId = view.view.rootArtifactId
  const root = semantic[rootId]
  const whitebox = view.diagramMode === 'whitebox' || root?.kind === 'part'

  const childParts = Object.values(semantic)
    .filter((el) => el.kind === 'part' && el.parentId === rootId)
    .map((el) => el.id)

  const attrNames = (partId: string) => {
    const part = semantic[partId]
    if (!part) return [] as string[]
    const direct = (part.children || [])
      .map((cid) => semantic[cid])
      .filter((c): c is SemanticElement => !!c && c.kind === 'attribute')
      .map((a) => a.name)
    if (direct.length || !part.typeRef) return direct
    const typeDef = Object.values(semantic).find(
      (e) => e.kind === 'part' && e.name === part.typeRef && !e.typeRef,
    )
    if (!typeDef) return direct
    return (typeDef.children || [])
      .map((cid) => semantic[cid])
      .filter((c): c is SemanticElement => !!c && c.kind === 'attribute')
      .map((a) => a.name)
  }

  const builtNodes: Node[] = []

  let boundaryW = 420
  let boundaryH = 260

  if (whitebox && root?.kind === 'part') {
    const cols = Math.max(1, Math.min(3, childParts.length || 1))
    const rows = Math.max(1, Math.ceil((childParts.length || 1) / cols))
    const childW = 180
    const childH = 110
    const padX = 36
    const padY = 56
    const gapX = 28
    const gapY = 24
    boundaryW = Math.max(420, padX * 2 + cols * childW + (cols - 1) * gapX)
    boundaryH = Math.max(260, padY + 28 + rows * childH + (rows - 1) * gapY)

    const rootViz = visualization.nodes[rootId]
    const customBoundary =
      !!rootViz &&
      (rootViz.width > 200 || rootViz.height > 120) &&
      rootViz.width >= 120 &&
      rootViz.height >= 72
    if (customBoundary) {
      boundaryW = rootViz.width
      boundaryH = rootViz.height
    }
    builtNodes.push({
      id: rootId,
      type: 'part',
      position: { x: rootViz?.x ?? 60, y: rootViz?.y ?? 40 },
      style: {
        width: boundaryW,
        height: boundaryH,
        background: 'transparent',
      },
      zIndex: 0,
      data: {
        label: root.name,
        artifactId: rootId,
        kind: root.kind,
        typeRef: root.typeRef,
        ports: buildPorts(root, semantic, visualization),
        menuItems: menus[rootId] || [],
        portMoveMode,
        isBoundary: true,
        showAttributes,
        attributeNames: attrNames(rootId),
        onOpenView,
        onPortDrag: onPortMoved,
      } satisfies PartNodeData,
    })

    childParts.forEach((id, index) => {
      const el = semantic[id]
      const viz = visualization.nodes[id]
      const col = index % cols
      const row = Math.floor(index / cols)
      const defaultX = padX + col * (childW + gapX)
      const defaultY = padY + row * (childH + gapY)
      const useStored =
        viz &&
        Number.isFinite(viz.x) &&
        Number.isFinite(viz.y) &&
        viz.x >= 0 &&
        viz.y >= 0 &&
        viz.x < boundaryW - 40 &&
        viz.y < boundaryH - 40

      builtNodes.push({
        id,
        type: 'part',
        parentId: rootId,
        extent: 'parent',
        position: {
          x: useStored ? viz.x : defaultX,
          y: useStored ? viz.y : defaultY,
        },
        style: {
          width: viz?.width ?? childW,
          height: viz?.height ?? childH,
        },
        zIndex: 1,
        data: {
          label: el.name,
          artifactId: id,
          kind: el.kind,
          typeRef: el.typeRef,
          ports: buildPorts(el, semantic, visualization),
          menuItems: menus[id] || [],
          portMoveMode,
          isBoundary: false,
          showAttributes,
          attributeNames: attrNames(id),
          onOpenView,
          onPortDrag: onPortMoved,
        } satisfies PartNodeData,
      })
    })
  } else {
    childParts.forEach((id, index) => {
      const el = semantic[id]
      const viz = visualization.nodes[id]
      builtNodes.push({
        id,
        type: 'part',
        position: {
          x: viz?.x ?? 80 + (index % 2) * 320,
          y: viz?.y ?? 80 + Math.floor(index / 2) * 180,
        },
        style: {
          width: viz?.width ?? 200,
          height: viz?.height ?? 120,
        },
        data: {
          label: el.name,
          artifactId: id,
          kind: el.kind,
          typeRef: el.typeRef,
          ports: buildPorts(el, semantic, visualization),
          menuItems: menus[id] || [],
          portMoveMode,
          showAttributes,
          attributeNames: attrNames(id),
          onOpenView,
          onPortDrag: onPortMoved,
        } satisfies PartNodeData,
      })
    })
  }

  const displaySet = new Set(builtNodes.map((n) => n.id))

  const rootViz = visualization.nodes[rootId]
  const parentBounds =
    whitebox && root?.kind === 'part'
      ? {
          minX: rootViz?.x ?? 60,
          minY: rootViz?.y ?? 40,
          maxX: (rootViz?.x ?? 60) + boundaryW,
          maxY: (rootViz?.y ?? 40) + boundaryH,
        }
      : undefined

  const builtEdges: Edge[] = Object.values(semantic)
    .filter((el) => el.kind === 'connection')
    .map((conn) => {
      const edgeViz: VisualizationEdge | undefined = visualization.edges[conn.id]
      const routing = edgeViz?.routing || 'angular'
      const sourcePort = conn.sourceId || ''
      const targetPort = conn.targetId || ''
      const sourcePart = findOwnerPart(sourcePort, semantic, displaySet)
      const targetPart = findOwnerPart(targetPort, semantic, displaySet)
      if (!sourcePart || !targetPart) return null

      const internal =
        whitebox &&
        (sourcePart === rootId ||
          targetPart === rootId ||
          (sourcePart !== rootId && targetPart !== rootId))

      return {
        id: conn.id,
        source: sourcePart,
        target: targetPart,
        sourceHandle: sourcePort,
        targetHandle: `target:${targetPort}`,
        type: 'sysml',
        label: conn.name,
        data: {
          routing,
          artifactId: conn.id,
          waypoints: edgeViz?.waypoints || [],
          labelOffset: edgeViz?.labelOffset || { x: 0, y: 0 },
          altHeld: portMoveMode,
          onWaypointsChange,
          onLabelOffsetChange,
          parentBounds: internal ? parentBounds : undefined,
          internal,
        },
        zIndex: 0,
        style: { strokeWidth: 2, stroke: 'var(--part-stroke)' },
      } as Edge
    })
    .filter((e): e is Edge => e !== null)

  return { nodes: builtNodes, edges: builtEdges }
}

type Props = {
  view: ViewPayload | null
  /** Bumps when a view is explicitly loaded/refreshed — not on layout patches */
  diagramEpoch: number
  showAttributes?: boolean
  onSelectArtifact: (id: string | null) => void
  onOpenView: (viewId: string) => void
  onNodesMoved: (
    nodes: Record<string, Partial<VisualizationNode>>,
    edges?: Record<string, Partial<VisualizationEdge>>,
  ) => void
  onPortMoved: (portId: string, side: PortSide, offset: number) => void
  onConnectPorts: (sourcePortId: string, targetPortId: string) => void
  onWaypointsMoved: (
    connectionId: string,
    waypoints: { x: number; y: number }[],
  ) => void
  onLabelOffsetMoved: (
    connectionId: string,
    offset: { x: number; y: number },
  ) => void
}

export function DiagramCanvas({
  view,
  diagramEpoch,
  showAttributes = false,
  onSelectArtifact,
  onOpenView,
  onNodesMoved,
  onPortMoved,
  onConnectPorts,
  onWaypointsMoved,
  onLabelOffsetMoved,
}: Props) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [portMoveMode, setPortMoveMode] = useState(false)
  const viewKeyRef = useRef<string | null>(null)
  const viewRef = useRef(view)
  const edgesRef = useRef<Edge[]>([])
  viewRef.current = view
  edgesRef.current = edges
  const onOpenViewRef = useRef(onOpenView)
  const onPortMovedRef = useRef(onPortMoved)
  const onConnectPortsRef = useRef(onConnectPorts)
  const onWaypointsMovedRef = useRef(onWaypointsMoved)
  const onLabelOffsetMovedRef = useRef(onLabelOffsetMoved)
  const onNodesMovedRef = useRef(onNodesMoved)
  onOpenViewRef.current = onOpenView
  onPortMovedRef.current = onPortMoved
  onConnectPortsRef.current = onConnectPorts
  onWaypointsMovedRef.current = onWaypointsMoved
  onLabelOffsetMovedRef.current = onLabelOffsetMoved
  onNodesMovedRef.current = onNodesMoved

  type BoundaryDragSnapshot = {
    nodeId: string
    originX: number
    originY: number
    edges: Record<string, { waypoints: Pt[]; parentBounds?: FlowBounds }>
  }
  const boundaryDragRef = useRef<BoundaryDragSnapshot | null>(null)

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

  // Rebuild graph only when the logical view identity / content revision changes —
  // not when callback identities change (that was wiping the canvas after drag).
  const edgeSig = view
    ? Object.entries(view.visualization.edges)
        .map(([id, e]) => {
          const lo = e.labelOffset || { x: 0, y: 0 }
          return `${id}:${e.routing}:${(e.waypoints || []).map((w) => `${w.x},${w.y}`).join(';')}:lo${lo.x},${lo.y}`
        })
        .sort()
        .join('|')
    : ''

  const viewKey = view
    ? `${diagramEpoch}|${view.view.id}|${view.diagramMode ?? ''}|${showAttributes}|${edgeSig}|${Object.keys(view.semantic).sort().join(',')}`
    : null

  useEffect(() => {
    if (!view) {
      setNodes([])
      setEdges([])
      viewKeyRef.current = null
      return
    }

    const stableOpen = (id: string) => onOpenViewRef.current(id)
    const stablePort = (portId: string, side: PortSide, offset: number) =>
      onPortMovedRef.current(portId, side, offset)
    const stableWp = (id: string, wps: { x: number; y: number }[]) =>
      onWaypointsMovedRef.current(id, wps)
    const stableLabel = (id: string, offset: { x: number; y: number }) =>
      onLabelOffsetMovedRef.current(id, offset)

    const { nodes: builtNodes, edges: builtEdges } = buildGraph(
      view,
      stableOpen,
      stablePort,
      portMoveMode,
      showAttributes,
      stableWp,
      stableLabel,
    )
    setNodes(builtNodes)
    setEdges(builtEdges)
    viewKeyRef.current = viewKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, showAttributes])

  // Toggle move-mode flags without rebuilding geometry from server
  useEffect(() => {
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
            onPortMovedRef.current(portId, side, offset),
        },
      }))
    })
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        data: { ...(edge.data as object), altHeld: portMoveMode },
      })),
    )
  }, [portMoveMode])

  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds))

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
    if (!data.isBoundary) {
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
      }

      onNodesMovedRef.current(patch, edgePatch)
    },
    [applyBoundaryEdgeDelta],
  )

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (portMoveMode) return
    const sourcePort = portIdFromHandle(connection.sourceHandle)
    const targetPort = portIdFromHandle(connection.targetHandle)
    if (!sourcePort || !targetPort || sourcePort === targetPort) return
    onConnectPortsRef.current(sourcePort, targetPort)
  }, [portMoveMode])

  const connectionLineType = useMemo(() => routingToConnectionLine('angular'), [])

  if (!view) {
    return (
      <div className="canvas-empty">
        <p>Select a view or add a SysML file to begin.</p>
      </div>
    )
  }

  return (
    <div className={`diagram-canvas${portMoveMode ? ' tool-move-ports' : ' tool-connect'}`}>
      {portMoveMode && (
        <div className="tool-banner" role="status">
          Move ports — dra längs partens kant
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodeClick={(_e, node) => onSelectArtifact(node.id)}
        onEdgeClick={(_e, edge) => onSelectArtifact(edge.id)}
        onPaneClick={() => onSelectArtifact(null)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={!portMoveMode}
        nodesConnectable={!portMoveMode}
        elementsSelectable
        connectionMode={ConnectionMode.Loose}
        elevateEdgesOnSelect={false}
        elevateNodesOnSelect={false}
        zIndexMode="auto"
        connectionLineType={connectionLineType}
        defaultEdgeOptions={{ zIndex: 0 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}
