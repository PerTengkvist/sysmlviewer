import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { PortSide, SemanticElement, ViewPayload } from '../../../../api'
import type { ViewMode } from '../../../../settings'
import {
  bindStoredAnchor,
  resolveAnchors,
  type BoundaryAnchor,
} from '../../boundaryAnchors'
import { edgeStrokeStyle } from '../../elementStyle'
import { pickRelationBoundarySides } from '../../relationshipStyle'
import { absoluteNodeOrigin } from '../structure/buildStructureGraph'
import type { HighlightOpts } from '../sequence/buildSequenceGraph'
import type { ActorNodeData } from './ActorNode'
import type { UseCaseNodeData } from './UseCaseNode'

const LEFT = 24
const TOP = 40
const UC_W = 168
const UC_H = 72
const ACTOR_W = 88
const ACTOR_H = 108
const GAP = 28

/**
 * One shared coordinate on every element is the global merge placeholder,
 * not a diagram the user laid out. Any other finite position is kept,
 * including negative coordinates and diagrams larger than the old cap.
 */
function sharedPlaceholder(
  nodes: Record<string, { x?: number; y?: number } | undefined>,
): { x: number; y: number } | null {
  const points = Object.values(nodes).filter(
    (node): node is { x: number; y: number } =>
      !!node && Number.isFinite(node.x) && Number.isFinite(node.y),
  )
  if (points.length < 2) return null
  const { x, y } = points[0]
  return points.every((point) => point.x === x && point.y === y) ? { x, y } : null
}

function savedBox(
  viz: { x: number; y: number; width?: number | null; height?: number | null } | undefined,
  fallback: { x: number; y: number; width: number; height: number },
  placeholder: { x: number; y: number } | null,
): { x: number; y: number; width: number; height: number } {
  const trusted =
    !!viz &&
    Number.isFinite(viz.x) &&
    Number.isFinite(viz.y) &&
    !(placeholder && viz.x === placeholder.x && viz.y === placeholder.y)
  if (!trusted || !viz) return fallback
  return {
    x: viz.x,
    y: viz.y,
    width: viz.width && viz.width >= 48 ? viz.width : fallback.width,
    height: viz.height && viz.height >= 32 ? viz.height : fallback.height,
  }
}

export function buildUseCaseGraph(
  view: ViewPayload,
  viewMode: ViewMode,
  highlight: HighlightOpts = {},
): { nodes: Node[]; edges: Edge[] } {
  const selectedConnectionColor = highlight.selectedConnectionColor ?? '#2563eb'
  const selectedFactor = highlight.selectedConnectionLinewidthFactor ?? 3
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId
  const elements = Object.values(semantic) as SemanticElement[]

  const useCases = elements.filter(
    (e) => e.kind === 'useCase' && (e.parentId === rootId || e.id === rootId),
  )
  const actors = elements.filter((e) => e.kind === 'actor')
  const includes = elements.filter((e) => e.kind === 'include')
  const extends_ = elements.filter(
    (e) =>
      e.kind === 'dependency' && (e.metadataKeywords || []).includes('extend'),
  )

  const subject =
    elements.find(
      (e) =>
        e.parentId === rootId &&
        e.kind === 'part' &&
        (e.metadataKeywords || []).includes('subject'),
    ) || null

  const nodes: Node[] = []
  const placeholder = sharedPlaceholder(visualization.nodes)
  const cols = useCases.length > 6 ? 2 : 1
  const rows = Math.max(1, Math.ceil(useCases.length / cols))
  const subjectX = 140
  const subjectY = TOP
  const subjectW = 48 + cols * (UC_W + GAP)
  const subjectH = Math.max(220, 56 + rows * (UC_H + GAP))

  if (subject) {
    const box = savedBox(
      visualization.nodes[subject.id],
      {
        x: subjectX,
        y: subjectY,
        width: subjectW,
        height: subjectH,
      },
      placeholder,
    )
    nodes.push({
      id: subject.id,
      type: 'part',
      position: { x: box.x, y: box.y },
      style: {
        width: box.width,
        height: box.height,
      },
      data: {
        label: subject.name,
        artifactId: subject.id,
        kind: 'part',
        typeRef: subject.typeRef,
        isBoundary: true,
        ports: [],
        menuItems: [],
        formatStyle: visualization.nodes[subject.id]?.style,
        viewMode,
      },
    })
  }

  useCases.forEach((uc, i) => {
    if (uc.id === rootId && uc.kind === 'useCase' && useCases.length > 1) return
    const col = i % cols
    const row = Math.floor(i / cols)
    const box = savedBox(
      visualization.nodes[uc.id],
      {
        x: 24 + col * (UC_W + GAP),
        y: 28 + row * (UC_H + GAP),
        width: UC_W,
        height: UC_H,
      },
      placeholder,
    )
    const data: UseCaseNodeData = {
      label: uc.name,
      artifactId: uc.id,
      formatStyle: visualization.nodes[uc.id]?.style,
      viewMode,
      anchors: resolveAnchors(visualization.nodes[uc.id]?.anchors),
    }
    nodes.push({
      id: uc.id,
      type: 'useCase',
      parentId: subject?.id,
      extent: subject ? 'parent' : undefined,
      position: { x: box.x, y: box.y },
      style: { width: box.width, height: box.height },
      data,
    })
  })

  const useCaseIds = new Set(nodes.filter((n) => n.type === 'useCase').map((n) => n.id))
  const actorGroups: { id: string; name: string; useCaseIds: string[] }[] = []
  const actorByName = new Map<string, (typeof actorGroups)[number]>()
  const actorMembers = new Map<string, SemanticElement[]>()
  for (const actor of actors) {
    const key = actor.name.trim().toLowerCase()
    const members = actorMembers.get(key) || []
    members.push(actor)
    actorMembers.set(key, members)
    let group = actorByName.get(key)
    if (!group) {
      group = { id: actor.id, name: actor.name, useCaseIds: [] }
      actorByName.set(key, group)
      actorGroups.push(group)
    }
    if (actor.parentId && useCaseIds.has(actor.parentId)) {
      group.useCaseIds.push(actor.parentId)
    }
  }
  for (const [key, group] of actorByName) {
    const members = actorMembers.get(key) || []
    const saved = members.find((actor) => {
      const viz = visualization.nodes[actor.id]
      if (!viz || !Number.isFinite(viz.x) || !Number.isFinite(viz.y)) return false
      if (placeholder && viz.x === placeholder.x && viz.y === placeholder.y) return false
      return true
    })
    if (saved) group.id = saved.id
  }

  const actorSpan = Math.max(ACTOR_H, actorGroups.length * (ACTOR_H + GAP) - GAP)
  const actorTop = subjectY + Math.max(24, (subjectH - actorSpan) / 2)
  actorGroups.forEach((group, i) => {
    const box = savedBox(
      visualization.nodes[group.id],
      {
        x: LEFT,
        y: actorTop + i * (ACTOR_H + GAP),
        width: ACTOR_W,
        height: ACTOR_H,
      },
      placeholder,
    )
    const data: ActorNodeData = {
      label: group.name,
      artifactId: group.id,
      formatStyle: visualization.nodes[group.id]?.style,
      viewMode,
    }
    nodes.push({
      id: group.id,
      type: 'actor',
      position: { x: box.x, y: box.y },
      style: {
        width: box.width,
        height: box.height,
        background: 'transparent',
        border: 'none',
      },
      data,
    })
  })

  const idSet = new Set(nodes.map((n) => n.id))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const edges: Edge[] = []

  const boxOf = (node: Node) => {
    const origin = absoluteNodeOrigin(node, byId)
    return {
      x: origin.x,
      y: origin.y,
      width: Number(node.style?.width) || UC_W,
      height: Number(node.style?.height) || UC_H,
    }
  }

  const anchorsOf = (node: Node | undefined): BoundaryAnchor[] =>
    resolveAnchors((node?.data as { anchors?: BoundaryAnchor[] } | undefined)?.anchors)

  for (const group of actorGroups) {
    for (const useCaseId of [...new Set(group.useCaseIds)]) {
      if (!idSet.has(useCaseId) || !idSet.has(group.id)) continue
      const edgeId = `use:${group.id}->${useCaseId}`
      const edgeViz = visualization.edges[edgeId]
      const src = byId.get(group.id)
      const tgt = byId.get(useCaseId)
      const picked =
        src && tgt
          ? pickRelationBoundarySides(boxOf(src), boxOf(tgt))
          : { sourceSide: 'right' as PortSide, targetSide: 'left' as PortSide }
      const tgtAnchor = bindStoredAnchor(
        anchorsOf(tgt),
        (edgeViz?.targetSide as PortSide | undefined) || picked.targetSide,
        edgeViz?.targetOffset ?? undefined,
        edgeViz?.targetAnchorId,
      )
      edges.push({
        id: edgeId,
        source: group.id,
        target: useCaseId,
        sourceHandle: 'out',
        targetHandle: `target:${tgtAnchor.id}`,
        type: 'straight',
        style: { stroke: 'var(--part-stroke)', strokeWidth: 1.5 },
        data: {
          selectedColor: selectedConnectionColor,
          selectedFactor,
          targetSide: tgtAnchor.side,
          targetOffset: tgtAnchor.offset,
          targetAnchorId: tgtAnchor.id,
        },
      })
    }
  }

  const pushRelation = (
    el: SemanticElement,
    label: string,
    kind: 'include' | 'dependency',
  ) => {
    if (!el.sourceId || !el.targetId) return
    if (!idSet.has(el.sourceId) || !idSet.has(el.targetId)) return
    const edgeViz = visualization.edges[el.id]
    const src = byId.get(el.sourceId)
    const tgt = byId.get(el.targetId)
    const picked =
      src && tgt
        ? pickRelationBoundarySides(boxOf(src), boxOf(tgt))
        : { sourceSide: 'right' as PortSide, targetSide: 'left' as PortSide }
    const srcAnchor = bindStoredAnchor(
      anchorsOf(src),
      (edgeViz?.sourceSide as PortSide | undefined) || picked.sourceSide,
      edgeViz?.sourceOffset ?? undefined,
      edgeViz?.sourceAnchorId,
    )
    const tgtAnchor = bindStoredAnchor(
      anchorsOf(tgt),
      (edgeViz?.targetSide as PortSide | undefined) || picked.targetSide,
      edgeViz?.targetOffset ?? undefined,
      edgeViz?.targetAnchorId,
    )
    const stroke = edgeStrokeStyle(edgeViz?.style, viewMode)
    edges.push({
      id: el.id,
      source: el.sourceId,
      target: el.targetId,
      sourceHandle: srcAnchor.id,
      targetHandle: `target:${tgtAnchor.id}`,
      label,
      type: 'sysml',
      markerEnd: { type: MarkerType.Arrow, width: 14, height: 14 },
      style: {
        stroke: stroke.stroke || 'var(--part-stroke)',
        strokeWidth: stroke.strokeWidth || 1.5,
        strokeDasharray: '6 4',
      },
      data: {
        artifactId: el.id,
        routing: edgeViz?.routing || 'direct',
        relationKind: kind,
        waypoints: edgeViz?.waypoints || [],
        labelOffset: edgeViz?.labelOffset || { x: 0, y: 0 },
        sourceSide: srcAnchor.side,
        sourceOffset: srcAnchor.offset,
        targetSide: tgtAnchor.side,
        targetOffset: tgtAnchor.offset,
        sourceAnchorId: srcAnchor.id,
        targetAnchorId: tgtAnchor.id,
        selectedColor: selectedConnectionColor,
        selectedFactor,
      },
    })
  }

  for (const inc of includes) pushRelation(inc, '«include»', 'include')
  for (const ext of extends_) pushRelation(ext, '«extend»', 'dependency')

  return { nodes, edges }
}
