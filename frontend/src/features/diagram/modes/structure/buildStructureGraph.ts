import type { Edge, Node } from '@xyflow/react'
import type {
  ArtifactKind,
  PortSide,
  RoutingType,
  SemanticElement,
  ViewPayload,
  VisualizationEdge,
  ElementStyle,
} from '../../../api'
import type { ViewMode } from '../../../settings'
import { edgeStrokeStyle, nodeInlineStyle, reactFlowMarker } from '../../elementStyle'
import {
  mergedEdgeVisual,
  PART_CENTER_SOURCE_HANDLE,
  PART_CENTER_TARGET_HANDLE,
  STRUCTURE_EDGE_KINDS,
  defaultRelationStyle,
  pickRelationBoundarySides,
  relationSourceHandle,
  relationTargetHandle,
  usesPortHandles,
} from '../../relationshipStyle'
import type { PartNodeData } from '../../PartNode'

function nodeBox(
  node: Node,
  byId: Map<string, Node>,
): { x: number; y: number; width: number; height: number } {
  let x = node.position.x
  let y = node.position.y
  let cur: Node | undefined = node
  while (cur?.parentId) {
    const parent = byId.get(cur.parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    cur = parent
  }
  const width =
    Number(node.style?.width ?? node.width ?? node.measured?.width) || 180
  const height =
    Number(node.style?.height ?? node.height ?? node.measured?.height) || 110
  return { x, y, width, height }
}

/** Re-attach non-port relation edges to the facing part borders. */
export function orientRelationBoundaryHandles(
  edges: Edge[],
  nodes: Node[],
): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((e) => {
    if (!e.sourceHandle?.startsWith('rel-out-')) return e
    if (!e.targetHandle?.startsWith('rel-in-')) return e
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) return e
    const { sourceSide, targetSide } = pickRelationBoundarySides(
      nodeBox(src, byId),
      nodeBox(tgt, byId),
    )
    return {
      ...e,
      sourceHandle: relationSourceHandle(sourceSide),
      targetHandle: relationTargetHandle(targetSide),
    }
  })
}

export function findOwnerPart(
  endpointId: string,
  semantic: Record<string, SemanticElement>,
  displayIds: Set<string>,
): string | null {
  let current = semantic[endpointId]
  if (!current) return null
  while (current) {
    if (current.kind === 'part' && displayIds.has(current.id)) {
      return current.id
    }
    if (!current.parentId) break
    current = semantic[current.parentId]
  }
  return null
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

export type StructureBuildOpts = {
  view: ViewPayload
  onOpenView: (viewId: string) => void
  onPortMoved: (portId: string, side: PortSide, offset: number) => void
  portMoveMode: boolean
  showAttributes: boolean
  viewMode: ViewMode
  selectedConnectionColor?: string
  selectedConnectionLinewidth?: number
  onWaypointsChange: (
    artifactId: string,
    waypoints: { x: number; y: number; locked?: boolean }[],
  ) => void
  onLabelOffsetChange: (
    artifactId: string,
    offset: { x: number; y: number },
  ) => void
  onSelectConnection?: (artifactId: string) => void
}

export function buildStructureGraph(opts: StructureBuildOpts): {
  nodes: Node[]
  edges: Edge[]
} {
  const {
    view,
    onOpenView,
    onPortMoved,
    portMoveMode,
    showAttributes,
    viewMode,
    selectedConnectionColor = '#2563eb',
    selectedConnectionLinewidth = 4,
    onWaypointsChange,
    onLabelOffsetChange,
    onSelectConnection,
  } = opts
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

  const formatFor = (id: string): ElementStyle | null | undefined =>
    visualization.nodes[id]?.style

  const partData = (
    id: string,
    el: SemanticElement,
    isBoundary: boolean,
  ): PartNodeData => ({
    label: el.name,
    artifactId: id,
    kind: el.kind,
    typeRef: el.typeRef,
    multiplicity: el.multiplicity,
    ports: buildPorts(el, semantic, visualization).map((p) => ({
      ...p,
      style: visualization.nodes[p.id]?.style,
    })),
    menuItems: menus[id] || [],
    portMoveMode,
    isBoundary,
    showAttributes,
    attributeNames: attrNames(id),
    formatStyle: formatFor(id),
    viewMode,
    onOpenView,
    onPortDrag: onPortMoved,
  })

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
    const rootStyle = nodeInlineStyle(formatFor(rootId), viewMode, { isBoundary: true })
    builtNodes.push({
      id: rootId,
      type: 'part',
      position: { x: rootViz?.x ?? 60, y: rootViz?.y ?? 40 },
      style: {
        width: boundaryW,
        height: boundaryH,
        background: 'transparent',
        ...rootStyle,
      },
      zIndex: 0,
      data: partData(rootId, root, true),
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

      const childStyle = nodeInlineStyle(formatFor(id), viewMode)
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
          ...childStyle,
        },
        zIndex: 1,
        data: partData(id, el, false),
      })
    })
  } else {
    childParts.forEach((id, index) => {
      const el = semantic[id]
      const viz = visualization.nodes[id]
      const childStyle = nodeInlineStyle(formatFor(id), viewMode)
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
          ...childStyle,
        },
        data: partData(id, el, false),
      })
    })
  }

  const displaySet = new Set(builtNodes.map((n) => n.id))
  const nodesById = new Map(builtNodes.map((n) => [n.id, n]))

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
    .filter((el) => STRUCTURE_EDGE_KINDS.includes(el.kind))
    .map((conn) => {
      const relationKind = conn.kind as ArtifactKind
      const edgeViz: VisualizationEdge | undefined = visualization.edges[conn.id]
      const defaults = defaultRelationStyle(relationKind)
      const routing = (edgeViz?.routing || defaults.routing) as RoutingType
      const sourceEndpoint = conn.sourceId || ''
      const targetEndpoint = conn.targetId || ''
      const sourceEl = semantic[sourceEndpoint]
      const targetEl = semantic[targetEndpoint]
      const sourcePart = findOwnerPart(sourceEndpoint, semantic, displaySet)
      const targetPart = findOwnerPart(targetEndpoint, semantic, displaySet)
      if (!sourcePart || !targetPart) return null

      const portHandles = usesPortHandles(
        relationKind,
        sourceEl?.kind,
        targetEl?.kind,
      )
      let sourceHandle = portHandles ? sourceEndpoint : PART_CENTER_SOURCE_HANDLE
      let targetHandle = portHandles
        ? `target:${targetEndpoint}`
        : PART_CENTER_TARGET_HANDLE
      if (!portHandles) {
        const srcNode = nodesById.get(sourcePart)
        const tgtNode = nodesById.get(targetPart)
        if (srcNode && tgtNode) {
          const { sourceSide, targetSide } = pickRelationBoundarySides(
            nodeBox(srcNode, nodesById),
            nodeBox(tgtNode, nodesById),
          )
          sourceHandle = relationSourceHandle(sourceSide)
          targetHandle = relationTargetHandle(targetSide)
        }
      }
      const internal =
        whitebox &&
        (sourcePart === rootId ||
          targetPart === rootId ||
          (sourcePart !== rootId && targetPart !== rootId))

      const visual = mergedEdgeVisual(relationKind, edgeViz?.style, viewMode)
      const stroke = edgeStrokeStyle(
        {
          light: {
            lineColor: edgeViz?.style?.light?.lineColor,
            lineThickness: edgeViz?.style?.light?.lineThickness,
            textColor: edgeViz?.style?.light?.textColor,
            lineStyle: visual.lineStyle,
          },
          dark: {
            lineColor: edgeViz?.style?.dark?.lineColor,
            lineThickness: edgeViz?.style?.dark?.lineThickness,
            textColor: edgeViz?.style?.dark?.textColor,
            lineStyle: visual.lineStyle,
          },
        },
        viewMode,
      )
      const markerEnd = reactFlowMarker(visual.markerEnd)

      return {
        id: conn.id,
        source: sourcePart,
        target: targetPart,
        sourceHandle,
        targetHandle,
        type: 'sysml',
        label: conn.name,
        markerEnd,
        data: {
          routing,
          relationKind,
          artifactId: conn.id,
          waypoints: edgeViz?.waypoints || [],
          labelOffset: edgeViz?.labelOffset || { x: 0, y: 0 },
          altHeld: portMoveMode,
          onWaypointsChange,
          onLabelOffsetChange,
          onSelect: onSelectConnection,
          parentBounds: internal ? parentBounds : undefined,
          internal,
          labelColor: stroke.color,
          selectedColor: selectedConnectionColor,
          selectedLinewidth: selectedConnectionLinewidth,
        },
        zIndex: 0,
        style: {
          strokeWidth: stroke.strokeWidth,
          stroke: stroke.stroke,
          strokeDasharray: stroke.strokeDasharray,
        },
      } as Edge
    })
    .filter((e): e is Edge => e !== null)

  return { nodes: builtNodes, edges: builtEdges }
}
