import type { Edge, Node } from '@xyflow/react'
import type { PortSide, SemanticElement, ViewPayload } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import { edgeStrokeStyle, nodeInlineStyle } from '../../elementStyle'
import type { PartNodeData } from '../../PartNode'
import { findOwnerPart } from '../structure/buildStructureGraph'

const LOGICAL_X = 80
const PHYSICAL_X = 520
const ROW_HEIGHT = 100
const NODE_WIDTH = 200
const NODE_HEIGHT = 72

export type AllocationBuildOpts = {
  view: ViewPayload
  viewMode: ViewMode
  showAttributes?: boolean
  portMoveMode?: boolean
  selectedConnectionColor?: string
  selectedConnectionLinewidth?: number
  onOpenView?: (viewId: string) => void
  onPortMoved?: (portId: string, side: PortSide, offset: number) => void
  onWaypointsChange?: (
    artifactId: string,
    waypoints: { x: number; y: number; locked?: boolean }[],
  ) => void
  onLabelOffsetChange?: (artifactId: string, offset: { x: number; y: number }) => void
  onSelectConnection?: (artifactId: string) => void
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
      const defaultSide: PortSide =
        el.parentId && semantic[el.parentId]?.name === 'logical' ? 'right' : 'left'
      return {
        id: port.id,
        name: port.name,
        side: (pv?.side || defaultSide || (idx % 2 === 0 ? 'left' : 'right')) as PortSide,
        offset: pv?.offset ?? 0.3 + idx * 0.12,
        style: pv?.style,
      }
    })
}

export function buildAllocationGraph(opts: AllocationBuildOpts): {
  nodes: Node[]
  edges: Edge[]
} {
  const {
    view,
    viewMode,
    showAttributes = false,
    portMoveMode = false,
    selectedConnectionColor = '#7c3aed',
    selectedConnectionLinewidth = 4,
    onOpenView,
    onPortMoved,
    onWaypointsChange,
    onLabelOffsetChange,
    onSelectConnection,
  } = opts
  const { semantic, visualization, menus } = view
  const rootId = view.view.rootArtifactId
  const root = semantic[rootId]
  if (!root) return { nodes: [], edges: [] }

  const logicalRoot = Object.values(semantic).find(
    (el) => el.kind === 'part' && el.parentId === rootId && el.name === 'logical',
  )

  const logicalParts = Object.values(semantic).filter((el) => {
    if (el.kind !== 'part' || el.id === rootId || el.id === logicalRoot?.id) return false
    if (!logicalRoot) return false
    let cur: SemanticElement | undefined = el
    while (cur) {
      if (cur.id === logicalRoot.id) return true
      cur = cur.parentId ? semantic[cur.parentId] : undefined
    }
    return false
  })

  const physicalParts = Object.values(semantic).filter(
    (el) =>
      el.kind === 'part' &&
      el.parentId === rootId &&
      el.name !== 'logical',
  )

  const displayIds = new Set([
    ...logicalParts.map((p) => p.id),
    ...physicalParts.map((p) => p.id),
  ])

  const partData = (id: string, el: SemanticElement): PartNodeData => ({
    label: el.name,
    artifactId: id,
    kind: el.kind,
    typeRef: el.typeRef,
    ports: buildPorts(el, semantic, visualization),
    menuItems: menus[id] || [],
    portMoveMode,
    isBoundary: false,
    showAttributes,
    attributeNames: [],
    formatStyle: visualization.nodes[id]?.style,
    viewMode,
    onOpenView,
    onPortDrag: onPortMoved,
  })

  const nodes: Node[] = []
  logicalParts.forEach((el, idx) => {
    const viz = visualization.nodes[el.id]
    nodes.push({
      id: el.id,
      type: 'part',
      position: { x: viz?.x ?? LOGICAL_X, y: viz?.y ?? 40 + idx * ROW_HEIGHT },
      data: partData(el.id, el),
      style: {
        width: viz?.width ?? NODE_WIDTH,
        height: viz?.height ?? NODE_HEIGHT,
        ...nodeInlineStyle(viz?.style, viewMode),
      },
    })
  })

  physicalParts.forEach((el, idx) => {
    const viz = visualization.nodes[el.id]
    nodes.push({
      id: el.id,
      type: 'part',
      position: { x: viz?.x ?? PHYSICAL_X, y: viz?.y ?? 40 + idx * ROW_HEIGHT },
      data: partData(el.id, el),
      style: {
        width: viz?.width ?? NODE_WIDTH,
        height: viz?.height ?? NODE_HEIGHT,
        ...nodeInlineStyle(viz?.style, viewMode),
      },
    })
  })

  const edges: Edge[] = []
  for (const conn of Object.values(semantic)) {
    if (conn.kind !== 'connection' || !conn.name.startsWith('alloc')) continue
    if (!conn.sourceId || !conn.targetId) continue
    const sourcePort = conn.sourceId
    const targetPort = conn.targetId
    const sourcePart = findOwnerPart(sourcePort, semantic, displayIds)
    const targetPart = findOwnerPart(targetPort, semantic, displayIds)
    if (!sourcePart || !targetPart) continue
    const edgeViz = visualization.edges[conn.id]
    const routing = edgeViz?.routing || 'direct'
    const stroke = edgeStrokeStyle(edgeViz?.style, viewMode, selectedConnectionColor)
    edges.push({
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
        onSelect: onSelectConnection,
        labelColor: stroke.color,
        selectedColor: selectedConnectionColor,
        selectedLinewidth: selectedConnectionLinewidth,
      },
      style: { strokeWidth: stroke.strokeWidth, stroke: stroke.stroke },
    })
  }

  return { nodes, edges }
}
