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
import type { ViewMode, StructureNotation } from '../../../settings'
import { edgeStrokeStyle, nodeInlineStyle, reactFlowMarker } from '../../elementStyle'
import {
  mergedEdgeVisual,
  STRUCTURE_EDGE_KINDS,
  defaultRelationStyle,
  pickRelationBoundarySides,
  relationEdgeLabel,
  usesPortHandles,
} from '../../relationshipStyle'
import type { PartNodeData } from '../../PartNode'
import { sizePartForPorts } from '../../layout/structureAutoLayout'
import {
  clampPortOffset,
  hasSavedPortPlacement,
  packBodyOffsets,
} from '../../layout/portPlacement'

function nodeBox(
  node: Node,
  byId: Map<string, Node>,
): { x: number; y: number; width: number; height: number } {
  const { x, y } = absoluteNodeOrigin(node, byId)
  const width =
    Number(node.style?.width ?? node.width ?? node.measured?.width) || 180
  const height =
    Number(node.style?.height ?? node.height ?? node.measured?.height) || 110
  return { x, y, width, height }
}

/** Absolute flow origin for nested (parentId) React Flow nodes. */
export function absoluteNodeOrigin(
  node: Node,
  byId: Map<string, Node>,
): { x: number; y: number } {
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
  return { x, y }
}

/** Re-attach non-port relation edges to the facing part borders. */
export function orientRelationBoundaryHandles(
  edges: Edge[],
  nodes: Node[],
): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((e) => {
    const data = (e.data || {}) as {
      manualAttachment?: boolean
      relationKind?: string
    }
    if (data.manualAttachment) return e
    const srcHandle = e.sourceHandle || ''
    const tgtHandle = e.targetHandle || ''
    const isRel =
      srcHandle.startsWith('rel-out-') ||
      srcHandle.startsWith('rel-src-') ||
      tgtHandle.startsWith('rel-in-') ||
      tgtHandle.startsWith('rel-tgt-')
    if (!isRel) return e
    const src = byId.get(e.source)
    const tgt = byId.get(e.target)
    if (!src || !tgt) return e
    const { sourceSide, targetSide } = pickRelationBoundarySides(
      nodeBox(src, byId),
      nodeBox(tgt, byId),
    )
    const edgeId = e.id
    return {
      ...e,
      sourceHandle: `rel-src-${edgeId}`,
      targetHandle: `rel-tgt-${edgeId}`,
      data: {
        ...data,
        sourceSide,
        targetSide,
        sourceOffset: 0.5,
        targetOffset: 0.5,
      },
    }
  })
}

/** Write per-edge relation handle positions onto part node data. */
export function applyRelationHandlesToNodes(
  nodes: Node[],
  edges: Edge[],
): Node[] {
  const byNode = new Map<
    string,
    { id: string; type: 'source' | 'target'; side: PortSide; offset: number }[]
  >()
  const ensure = (nodeId: string) => {
    let list = byNode.get(nodeId)
    if (!list) {
      list = []
      byNode.set(nodeId, list)
    }
    return list
  }
  for (const e of edges) {
    const data = (e.data || {}) as {
      sourceSide?: PortSide
      targetSide?: PortSide
      sourceOffset?: number
      targetOffset?: number
      manualAttachment?: boolean
    }
    const srcHandle = e.sourceHandle || ''
    const tgtHandle = e.targetHandle || ''
    if (!srcHandle.startsWith('rel-src-') && !srcHandle.startsWith('rel-out-')) {
      continue
    }
    let sourceSide = data.sourceSide
    let targetSide = data.targetSide
    let sourceOffset = data.sourceOffset ?? 0.5
    let targetOffset = data.targetOffset ?? 0.5
    if (!sourceSide || !targetSide) {
      // Parse from legacy mid-side handle ids if present
      const mOut = /^rel-out-(left|right|top|bottom)$/.exec(srcHandle)
      const mIn = /^rel-in-(left|right|top|bottom)$/.exec(tgtHandle)
      if (mOut) sourceSide = mOut[1] as PortSide
      if (mIn) targetSide = mIn[1] as PortSide
    }
    if (!sourceSide) sourceSide = 'right'
    if (!targetSide) targetSide = 'left'
    ensure(e.source).push({
      id: `rel-src-${e.id}`,
      type: 'source',
      side: sourceSide,
      offset: sourceOffset,
    })
    ensure(e.target).push({
      id: `rel-tgt-${e.id}`,
      type: 'target',
      side: targetSide,
      offset: targetOffset,
    })
  }
  return nodes.map((n) => {
    const handles = byNode.get(n.id)
    if (!handles) {
      const data = n.data as PartNodeData
      if (!data?.relationHandles?.length) return n
      return { ...n, data: { ...data, relationHandles: [] } }
    }
    return {
      ...n,
      data: {
        ...(n.data as PartNodeData),
        relationHandles: handles,
      },
    }
  })
}

/**
 * Owning part for an endpoint that is itself on the diagram.
 * Does not promote hidden nested parts to a visible ancestor (avoids
 * showing dependencies/connections of collapsed subparts).
 */
export function findOwnerPart(
  endpointId: string,
  semantic: Record<string, SemanticElement>,
  displayIds: Set<string>,
): string | null {
  let current = semantic[endpointId]
  if (!current) return null
  while (current && current.kind !== 'part') {
    if (!current.parentId) return null
    current = semantic[current.parentId]
  }
  if (!current || current.kind !== 'part') return null
  return displayIds.has(current.id) ? current.id : null
}

function buildPorts(
  el: SemanticElement,
  semantic: Record<string, SemanticElement>,
  visualization: ViewPayload['visualization'],
) {
  const partH = Number(visualization.nodes[el.id]?.height) || 120
  const portEls = (el.children || [])
    .map((cid) => semantic[cid])
    .filter((c): c is SemanticElement => !!c && c.kind === 'port')
  const unsaved = portEls.filter(
    (p) => !hasSavedPortPlacement(visualization.nodes[p.id]),
  )
  const packed = packBodyOffsets(unsaved.length, partH)
  let ui = 0
  return portEls.map((port, idx) => {
    const pv = visualization.nodes[port.id]
    if (!hasSavedPortPlacement(pv)) {
      return {
        id: port.id,
        name: port.name,
        side: (idx % 2 === 0 ? 'left' : 'right') as PortSide,
        offset: packed[ui++] ?? 0.7,
      }
    }
    const side = pv!.side as PortSide
    return {
      id: port.id,
      name: port.name,
      side,
      offset: clampPortOffset(Number(pv!.offset), side, partH),
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
  structureNotation?: StructureNotation
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
  onRelationEndMoved?: (
    artifactId: string,
    end: 'source' | 'target',
    side: PortSide,
    offset: number,
    persist?: boolean,
  ) => void
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
    structureNotation = 'sysmlv2',
    selectedConnectionColor = '#2563eb',
    selectedConnectionLinewidth = 4,
    onWaypointsChange,
    onLabelOffsetChange,
    onSelectConnection,
    onRelationEndMoved,
  } = opts
  const arcadia = structureNotation === 'arcadia'
  const { semantic, visualization, menus } = view
  const rootId = view.view.rootArtifactId
  const root = semantic[rootId]
  const whitebox = view.diagramMode === 'whitebox' || root?.kind === 'part'
  const levels = Math.max(1, view.hierarchicalLevels ?? 2)

  /** Part ids in semantic under root within hierarchicalLevels (root depth = 1). */
  const collectDescendantParts = (startId: string, maxDepth: number): string[] => {
    const out: string[] = []
    const walk = (id: string, depth: number) => {
      if (depth > maxDepth) return
      for (const el of Object.values(semantic)) {
        if (el.kind !== 'part' || el.parentId !== id) continue
        out.push(el.id)
        walk(el.id, depth + 1)
      }
    }
    walk(startId, 1)
    return out
  }

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

  const sizedPartBox = (
    id: string,
    el: SemanticElement,
    ports: { name: string; side: PortSide }[],
    fallbackW: number,
    fallbackH: number,
  ): { width: number; height: number } => {
    const viz = visualization.nodes[id]
    const baseW = viz?.width ?? fallbackW
    const baseH = viz?.height ?? fallbackH
    if (!ports.length) return { width: baseW, height: baseH }
    const fitted = sizePartForPorts(el.name, ports)
    const unsaved = (el.children || []).some((cid) => {
      const c = semantic[cid]
      return c?.kind === 'port' && !hasSavedPortPlacement(visualization.nodes[cid])
    })
    // Default (unsaved) placement: grow to fit port names in the body.
    // Saved placement: still never shrink below fitted height needed for body band.
    if (unsaved) {
      return {
        width: Math.max(baseW, fitted.width),
        height: Math.max(baseH, fitted.height),
      }
    }
    return {
      width: baseW,
      height: Math.max(baseH, fitted.height),
    }
  }

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
    isReference: !!el.isReference,
    metadataKeywords: el.metadataKeywords || [],
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
  const compositionEdges: Edge[] = []

  let boundaryW = 420
  let boundaryH = 260

  /** Part ids in semantic under root within hierarchicalLevels (root depth = 1). */
  const partDepth = new Map<string, number>()
  {
    const walk = (id: string, depth: number) => {
      if (depth > levels) return
      const el = semantic[id]
      if (!el) return
      if (el.kind === 'part') partDepth.set(id, depth)
      if (depth >= levels) return
      for (const cid of el.children || []) {
        const child = semantic[cid]
        if (!child) continue
        if (child.kind === 'part' || child.kind === 'package') {
          walk(cid, depth + 1)
        }
      }
    }
    walk(rootId, 1)
  }
  const nestedChildParts = (parentId: string) =>
    Object.values(semantic)
      .filter(
        (el) =>
          el.kind === 'part' &&
          el.parentId === parentId &&
          partDepth.has(el.id),
      )
      .map((el) => el.id)

  const defaultNestedBox = (
    id: string,
    hasKids: boolean,
  ): { width: number; height: number; fallbackW: number; fallbackH: number } => {
    const kids = nestedChildParts(id)
    if (!hasKids && !kids.length) {
      return { width: 180, height: 110, fallbackW: 180, fallbackH: 110 }
    }
    const n = Math.max(1, kids.length)
    const cols = Math.max(1, Math.min(3, n))
    const rows = Math.max(1, Math.ceil(n / cols))
    const w = Math.max(280, 36 * 2 + cols * 140 + (cols - 1) * 20)
    const h = Math.max(180, 48 + 28 + rows * 90 + (rows - 1) * 16)
    return { width: w, height: h, fallbackW: w, fallbackH: h }
  }

  if (arcadia && root?.kind === 'part') {
    const peerIds = [rootId, ...collectDescendantParts(rootId, levels)]
    const uniquePeers = [...new Set(peerIds)]
    uniquePeers.forEach((id, index) => {
      const el = semantic[id]
      if (!el || el.kind !== 'part') return
      const viz = visualization.nodes[id]
      const childStyle = nodeInlineStyle(formatFor(id), viewMode)
      const data = partData(id, el, false)
      const box = sizedPartBox(
        id,
        el,
        data.ports,
        id === rootId ? 200 : 180,
        id === rootId ? 120 : 110,
      )
      builtNodes.push({
        id,
        type: 'part',
        position: {
          x: viz?.x ?? 80 + (index % 3) * 260,
          y: viz?.y ?? 80 + Math.floor(index / 3) * 160,
        },
        style: {
          width: box.width,
          height: box.height,
          ...childStyle,
        },
        data,
      })
    })
    const peerSet = new Set(uniquePeers)
    for (const id of uniquePeers) {
      if (id === rootId) continue
      const el = semantic[id]
      const parentId = el?.parentId
      if (!parentId || !peerSet.has(parentId)) continue
      const isRef = !!el.isReference
      const edgeId = isRef
        ? `viz::aggregation::${parentId}::${id}`
        : `viz::composition::${parentId}::${id}`
      const markerKind = isRef ? 'hollowDiamond' : 'filledDiamond'
      const markerStart = reactFlowMarker(markerKind)
      const edgeViz = visualization.edges[edgeId]
      const srcSide = (edgeViz?.sourceSide as PortSide | null | undefined) || 'right'
      const tgtSide = (edgeViz?.targetSide as PortSide | null | undefined) || 'left'
      compositionEdges.push({
        id: edgeId,
        source: parentId,
        target: id,
        sourceHandle: `rel-src-${edgeId}`,
        targetHandle: `rel-tgt-${edgeId}`,
        type: 'sysml',
        markerStart,
        data: {
          routing: (edgeViz?.routing as string) || 'direct',
          relationKind: isRef ? 'subsetting' : 'connection',
          artifactId: edgeId,
          waypoints: edgeViz?.waypoints || [],
          labelOffset: edgeViz?.labelOffset || { x: 0, y: 0 },
          altHeld: portMoveMode,
          onWaypointsChange,
          onLabelOffsetChange,
          onSelect: onSelectConnection,
          onRelationEndMoved,
          markerStartKind: markerKind,
          synthetic: true,
          sourceSide: srcSide,
          targetSide: tgtSide,
          sourceOffset:
            edgeViz?.sourceOffset != null ? Number(edgeViz.sourceOffset) : 0.5,
          targetOffset:
            edgeViz?.targetOffset != null ? Number(edgeViz.targetOffset) : 0.5,
          manualAttachment: !!(edgeViz?.sourceSide || edgeViz?.targetSide),
        },
        zIndex: 0,
        style: { strokeWidth: 2, stroke: 'var(--part-stroke)' },
      } as Edge)
    }
  } else if (whitebox && root?.kind === 'part') {
    const rootKids = nestedChildParts(rootId)
    const cols = Math.max(1, Math.min(3, rootKids.length || 1))
    const rows = Math.max(1, Math.ceil((rootKids.length || 1) / cols))
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

    const placeUnder = (
      parentId: string,
      parentW: number,
      parentH: number,
      depthFromRoot: number,
    ) => {
      const kids = nestedChildParts(parentId)
      kids.forEach((id, index) => {
        const el = semantic[id]
        if (!el) return
        const viz = visualization.nodes[id]
        const grandKids = nestedChildParts(id)
        const defaults = defaultNestedBox(id, grandKids.length > 0)
        const kcols = Math.max(1, Math.min(3, kids.length || 1))
        const col = index % kcols
        const row = Math.floor(index / kcols)
        const defaultX = padX + col * (defaults.fallbackW + gapX)
        const defaultY = padY + row * (defaults.fallbackH + gapY)
        const useStored =
          viz &&
          Number.isFinite(viz.x) &&
          Number.isFinite(viz.y) &&
          viz.x >= 0 &&
          viz.y >= 0 &&
          viz.x < parentW - 40 &&
          viz.y < parentH - 40

        const isContainer = grandKids.length > 0
        const childStyle = nodeInlineStyle(formatFor(id), viewMode, {
          isBoundary: isContainer,
        })
        const data = partData(id, el, isContainer)
        const box = sizedPartBox(
          id,
          el,
          data.ports,
          defaults.fallbackW,
          defaults.fallbackH,
        )
        builtNodes.push({
          id,
          type: 'part',
          parentId,
          extent: 'parent',
          position: {
            x: useStored ? viz.x : defaultX,
            y: useStored ? viz.y : defaultY,
          },
          style: {
            width: box.width,
            height: box.height,
            ...(isContainer ? { background: 'transparent' } : {}),
            ...childStyle,
          },
          zIndex: depthFromRoot,
          data,
        })
        if (grandKids.length) {
          placeUnder(id, box.width, box.height, depthFromRoot + 1)
        }
      })
    }
    placeUnder(rootId, boundaryW, boundaryH, 1)
  } else {
    // Structure (typically package root): top-level parts + nested by depth
    const topLevel = Object.values(semantic)
      .filter(
        (el) =>
          el.kind === 'part' &&
          partDepth.has(el.id) &&
          (el.parentId === rootId ||
            !el.parentId ||
            !partDepth.has(el.parentId) ||
            semantic[el.parentId!]?.kind === 'package'),
      )
      .map((el) => el.id)

    topLevel.forEach((id, index) => {
      const el = semantic[id]
      if (!el) return
      const viz = visualization.nodes[id]
      const grandKids = nestedChildParts(id)
      const defaults = defaultNestedBox(id, grandKids.length > 0)
      const isContainer = grandKids.length > 0
      const childStyle = nodeInlineStyle(formatFor(id), viewMode, {
        isBoundary: isContainer,
      })
      const data = partData(id, el, isContainer)
      const box = sizedPartBox(
        id,
        el,
        data.ports,
        defaults.fallbackW,
        isContainer ? defaults.fallbackH : 120,
      )
      builtNodes.push({
        id,
        type: 'part',
        position: {
          x: viz?.x ?? 80 + (index % 2) * 320,
          y: viz?.y ?? 80 + Math.floor(index / 2) * 180,
        },
        style: {
          width: box.width,
          height: box.height,
          ...(isContainer ? { background: 'transparent' } : {}),
          ...childStyle,
        },
        data,
      })
    })

    const placeNested = (parentId: string, parentW: number, parentH: number, z: number) => {
      const kids = nestedChildParts(parentId)
      const padX = 28
      const padY = 48
      const gapX = 20
      const gapY = 16
      kids.forEach((id, index) => {
        const el = semantic[id]
        if (!el) return
        const viz = visualization.nodes[id]
        const grandKids = nestedChildParts(id)
        const defaults = defaultNestedBox(id, grandKids.length > 0)
        const kcols = Math.max(1, Math.min(3, kids.length || 1))
        const col = index % kcols
        const row = Math.floor(index / kcols)
        const defaultX = padX + col * (defaults.fallbackW + gapX)
        const defaultY = padY + row * (defaults.fallbackH + gapY)
        const useStored =
          viz &&
          Number.isFinite(viz.x) &&
          Number.isFinite(viz.y) &&
          viz.x >= 0 &&
          viz.y >= 0 &&
          viz.x < parentW - 40 &&
          viz.y < parentH - 40
        const isContainer = grandKids.length > 0
        const childStyle = nodeInlineStyle(formatFor(id), viewMode, {
          isBoundary: isContainer,
        })
        const data = partData(id, el, isContainer)
        const box = sizedPartBox(
          id,
          el,
          data.ports,
          defaults.fallbackW,
          defaults.fallbackH,
        )
        builtNodes.push({
          id,
          type: 'part',
          parentId,
          extent: 'parent',
          position: {
            x: useStored ? viz.x : defaultX,
            y: useStored ? viz.y : defaultY,
          },
          style: {
            width: box.width,
            height: box.height,
            ...(isContainer ? { background: 'transparent' } : {}),
            ...childStyle,
          },
          zIndex: z,
          data,
        })
        if (grandKids.length) {
          placeNested(id, box.width, box.height, z + 1)
        }
      })
    }
    for (const id of topLevel) {
      const node = builtNodes.find((n) => n.id === id)
      if (!node) continue
      const w = Number(node.style?.width) || 200
      const h = Number(node.style?.height) || 120
      if (nestedChildParts(id).length) placeNested(id, w, h, 1)
    }
  }

  const displaySet = new Set(builtNodes.map((n) => n.id))
  const nodesById = new Map(builtNodes.map((n) => [n.id, n]))

  const rootViz = visualization.nodes[rootId]
  const parentBounds =
    !arcadia && whitebox && root?.kind === 'part'
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
      let sourceHandle = portHandles ? sourceEndpoint : `rel-src-${conn.id}`
      let targetHandle = portHandles
        ? `target:${targetEndpoint}`
        : `rel-tgt-${conn.id}`
      let sourceOffset = 0.5
      let targetOffset = 0.5
      let manualAttachment = false
      let sourceSide: PortSide | undefined
      let targetSide: PortSide | undefined
      if (!portHandles) {
        const srcSide = edgeViz?.sourceSide as PortSide | null | undefined
        const tgtSide = edgeViz?.targetSide as PortSide | null | undefined
        if (srcSide || tgtSide) {
          // Either end persisted → keep manual; fill the missing end from geometry.
          const srcNode = nodesById.get(sourcePart)
          const tgtNode = nodesById.get(targetPart)
          const picked =
            srcNode && tgtNode
              ? pickRelationBoundarySides(
                  nodeBox(srcNode, nodesById),
                  nodeBox(tgtNode, nodesById),
                )
              : { sourceSide: 'right' as PortSide, targetSide: 'left' as PortSide }
          sourceSide = srcSide || picked.sourceSide
          targetSide = tgtSide || picked.targetSide
          sourceOffset =
            srcSide && edgeViz?.sourceOffset != null
              ? Number(edgeViz.sourceOffset)
              : 0.5
          targetOffset =
            tgtSide && edgeViz?.targetOffset != null
              ? Number(edgeViz.targetOffset)
              : 0.5
          manualAttachment = true
        } else {
          const srcNode = nodesById.get(sourcePart)
          const tgtNode = nodesById.get(targetPart)
          if (srcNode && tgtNode) {
            const picked = pickRelationBoundarySides(
              nodeBox(srcNode, nodesById),
              nodeBox(tgtNode, nodesById),
            )
            sourceSide = picked.sourceSide
            targetSide = picked.targetSide
          } else {
            sourceSide = 'right'
            targetSide = 'left'
          }
        }
      }
      const internal =
        !arcadia &&
        whitebox &&
        (sourcePart === rootId ||
          targetPart === rootId ||
          (sourcePart !== rootId && targetPart !== rootId))

      const visual = mergedEdgeVisual(relationKind, edgeViz?.style, viewMode)
      let markerStartKind: string | undefined
      let markerEnd = reactFlowMarker(visual.markerEnd)
      let markerStart = reactFlowMarker(visual.markerStart)
      if (arcadia && relationKind === 'subsetting') {
        markerStartKind = 'hollowDiamond'
        markerStart = reactFlowMarker('hollowDiamond')
        markerEnd = undefined
      }
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

      return {
        id: conn.id,
        source: sourcePart,
        target: targetPart,
        sourceHandle,
        targetHandle,
        type: 'sysml',
        label: relationEdgeLabel(conn),
        markerEnd,
        markerStart,
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
          sourceOffset,
          targetOffset,
          sourceSide,
          targetSide,
          manualAttachment,
          markerStartKind,
          onRelationEndMoved,
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

  // Orient composition edges to facing borders
  let orientedComposition = orientRelationBoundaryHandles(
    compositionEdges,
    builtNodes,
  )
  // Synthetic composition uses relationKind connection for styling; still allow end drag
  orientedComposition = orientedComposition.map((e) => ({
    ...e,
    data: {
      ...(e.data as object),
      // Keep diamond aggregation look; treat as movable relation
      relationKind:
        (e.data as { markerStartKind?: string })?.markerStartKind ===
        'hollowDiamond'
          ? 'subsetting'
          : 'dependency',
    },
  }))

  const allEdges = [...builtEdges, ...orientedComposition]
  const nodesWithHandles = applyRelationHandlesToNodes(builtNodes, allEdges)

  return {
    nodes: nodesWithHandles,
    edges: allEdges,
  }
}
