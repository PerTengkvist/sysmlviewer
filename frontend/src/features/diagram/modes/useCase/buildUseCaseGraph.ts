import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { PortSide, SemanticElement, ViewPayload } from '../../../../api'
import type { RequirementDisplaySettings, ViewMode } from '../../../../settings'
import {
  DEFAULT_REQUIREMENT_DISPLAY,
  resolveRequirementBody,
  resolveRequirementHeader,
} from '../../requirementDisplay'
import { requirementTypeAttr } from '../../requirementStereotype'
import type { RequirementNodeData } from '../requirements/RequirementNode'
import { edgeStrokeStyle } from '../../elementStyle'
import { pickRelationBoundarySides } from '../../relationshipStyle'
import { absoluteNodeOrigin } from '../structure/buildStructureGraph'
import type { HighlightOpts } from '../sequence/buildSequenceGraph'
import { iconNameForElement } from '../../iconRef'
import type { ActorNodeData } from './ActorNode'
import type { UseCaseNodeData } from './UseCaseNode'
import type { BoundaryAnchor } from '../../boundaryAnchors'
import { syncUseCaseAnchors } from './syncUseCaseAnchors'

const LEFT = 24
const PACKAGE_ONLY: ReadonlySet<string> = new Set(['package'])
/** Requirements may nest in requirements and use cases as well as packages. */
const REQUIREMENT_OWNERS: ReadonlySet<string> = new Set([
  'package',
  'requirement',
  'useCase',
])
const TOP = 40
const UC_W = 168
const UC_H = 72
const ACTOR_W = 88
const ACTOR_H = 108
const GAP = 28
const REQ_W = 200
const REQ_H = 120
/** Requirements per column before the next column starts (at least). */
const REQ_PER_COLUMN = 6
/** Horizontal gap between the use cases and the requirement column. */
const REQ_COLUMN_GAP = 96

/** Requirement relations a use case diagram draws (traceability). */
function traceLabel(el: SemanticElement): string | null {
  if (el.kind === 'satisfy') return 'satisfy'
  if (el.kind !== 'dependency') return null
  const keyword = (el.metadataKeywords || [])[0]
  return keyword && keyword !== 'extend' ? keyword : 'dependency'
}

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
  requirementDisplay: RequirementDisplaySettings = DEFAULT_REQUIREMENT_DISPLAY,
): { nodes: Node[]; edges: Edge[] } {
  const selectedConnectionColor = highlight.selectedConnectionColor ?? '#2563eb'
  const selectedFactor = highlight.selectedConnectionLinewidthFactor ?? 3
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId
  const elements = Object.values(semantic) as SemanticElement[]
  // Every `expose` of the view; older payloads only carry the first.
  const rootIds = new Set(
    view.exposeRootIds?.length ? view.exposeRootIds : [rootId],
  )

  // Elements directly under an exposed root, or nested in packages under it
  // (for example UseCases::Driving and UseCases::Managing). `through` lists
  // the other owner kinds that may sit in between (nested requirements).
  const underRoot = (
    e: SemanticElement,
    through: ReadonlySet<string> = PACKAGE_ONLY,
  ): boolean => {
    let parentId = e.parentId
    while (parentId) {
      if (rootIds.has(parentId)) return true
      const parent = semantic[parentId]
      if (!parent || !through.has(parent.kind)) return false
      parentId = parent.parentId
    }
    return false
  }
  const exposed = (e: SemanticElement, through?: ReadonlySet<string>) =>
    rootIds.has(e.id) || underRoot(e, through)
  const useCases = elements.filter((e) => e.kind === 'useCase' && exposed(e))
  const requirements = elements
    .filter((e) => e.kind === 'requirement' && exposed(e, REQUIREMENT_OWNERS))
    .sort((a, b) => (a.shortId || a.id).localeCompare(b.shortId || b.id))
  // Group by owning package: each package becomes a column of the diagram.
  const groupKeys: string[] = []
  const groupIndex = new Map<string, number>()
  const rowInGroup = new Map<string, number>()
  for (const uc of useCases) {
    const key = uc.parentId || rootId
    if (!groupIndex.has(key)) {
      groupIndex.set(key, groupKeys.length)
      groupKeys.push(key)
    }
    rowInGroup.set(uc.id, (rowInGroup.get(key) ?? 0))
    rowInGroup.set(key, (rowInGroup.get(key) ?? 0) + 1)
  }
  const groupedByPackage = groupKeys.length > 1
  const actors = elements.filter((e) => e.kind === 'actor')
  const includes = elements.filter((e) => e.kind === 'include')
  const extends_ = elements.filter(
    (e) =>
      e.kind === 'dependency' && (e.metadataKeywords || []).includes('extend'),
  )

  const subject =
    elements.find(
      (e) =>
        !!e.parentId &&
        rootIds.has(e.parentId) &&
        e.kind === 'part' &&
        (e.metadataKeywords || []).includes('subject'),
    ) || null

  const nodes: Node[] = []
  const placeholder = sharedPlaceholder(visualization.nodes)
  const cols = groupedByPackage ? groupKeys.length : useCases.length > 6 ? 2 : 1
  const rows = groupedByPackage
    ? Math.max(1, ...groupKeys.map((key) => rowInGroup.get(key) ?? 0))
    : Math.max(1, Math.ceil(useCases.length / cols))
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
    const col = groupedByPackage ? groupIndex.get(uc.parentId || rootId) ?? 0 : i % cols
    const row = groupedByPackage ? rowInGroup.get(uc.id) ?? 0 : Math.floor(i / cols)
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
      anchors: visualization.nodes[uc.id]?.anchors || [],
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
    const actorEl = semantic[group.id]
    const data: ActorNodeData = {
      label: group.name,
      artifactId: group.id,
      formatStyle: visualization.nodes[group.id]?.style,
      viewMode,
      iconName: actorEl
        ? iconNameForElement(actorEl, semantic)
        : null,
      anchors: visualization.nodes[group.id]?.anchors || [],
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

  // Requirements: a column to the right of the use cases (and subject).
  const useCaseRight = Math.max(
    subject ? subjectX + subjectW : 0,
    ...nodes
      .filter((n) => n.type === 'useCase' && !n.parentId)
      .map((n) => n.position.x + Number(n.style?.width || UC_W)),
    LEFT + cols * (UC_W + GAP),
  )
  const reqX = useCaseRight + REQ_COLUMN_GAP
  // As many rows as the use cases take, so the columns stay level with them.
  const reqPerColumn = Math.max(REQ_PER_COLUMN, rows)
  requirements.forEach((req, i) => {
    const col = Math.floor(i / reqPerColumn)
    const row = i % reqPerColumn
    const box = savedBox(
      visualization.nodes[req.id],
      {
        x: reqX + col * (REQ_W + GAP),
        y: TOP + row * (REQ_H + GAP),
        width: REQ_W,
        height: REQ_H,
      },
      placeholder,
    )
    const data: RequirementNodeData = {
      label: req.name,
      artifactId: req.id,
      shortId: req.shortId,
      headerText: resolveRequirementHeader(req, semantic, requirementDisplay),
      bodyText: resolveRequirementBody(req, semantic, requirementDisplay),
      documentation: req.documentation,
      typeAttr: requirementTypeAttr(req, semantic),
      formatStyle: visualization.nodes[req.id]?.style,
      viewMode,
      anchors: visualization.nodes[req.id]?.anchors || [],
      exactAnchors: true,
    }
    nodes.push({
      id: req.id,
      type: 'requirement',
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
      edges.push({
        id: edgeId,
        source: group.id,
        target: useCaseId,
        sourceHandle: edgeViz?.sourceAnchorId || 'out',
        targetHandle: `target:${edgeViz?.targetAnchorId || 'a-left'}`,
        type: 'straight',
        style: { stroke: 'var(--part-stroke)', strokeWidth: 1.5 },
        data: {
          selectedColor: selectedConnectionColor,
          selectedFactor,
          sourceSide: (edgeViz?.sourceSide as PortSide | undefined) || picked.sourceSide,
          sourceOffset: edgeViz?.sourceOffset ?? 0.5,
          sourceAnchorId: edgeViz?.sourceAnchorId ?? undefined,
          targetSide: (edgeViz?.targetSide as PortSide | undefined) || picked.targetSide,
          targetOffset: edgeViz?.targetOffset ?? 0.5,
          targetAnchorId: edgeViz?.targetAnchorId ?? undefined,
          routing: edgeViz?.routing || 'direct',
          waypoints: edgeViz?.waypoints || [],
        },
      })
    }
  }

  const pushRelation = (
    el: SemanticElement,
    label: string,
    kind: 'include' | 'dependency' | 'satisfy',
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
    const stroke = edgeStrokeStyle(edgeViz?.style, viewMode)
    edges.push({
      id: el.id,
      source: el.sourceId,
      target: el.targetId,
      sourceHandle: edgeViz?.sourceAnchorId || `rel:${el.id}`,
      targetHandle: `target:${edgeViz?.targetAnchorId || `rel:${el.id}`}`,
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
        sourceSide: (edgeViz?.sourceSide as PortSide | undefined) || picked.sourceSide,
        sourceOffset: edgeViz?.sourceOffset ?? 0.5,
        targetSide: (edgeViz?.targetSide as PortSide | undefined) || picked.targetSide,
        targetOffset: edgeViz?.targetOffset ?? 0.5,
        sourceAnchorId: edgeViz?.sourceAnchorId ?? undefined,
        targetAnchorId: edgeViz?.targetAnchorId ?? undefined,
        selectedColor: selectedConnectionColor,
        selectedFactor,
      },
    })
  }

  for (const inc of includes) pushRelation(inc, '«include»', 'include')
  for (const ext of extends_) pushRelation(ext, '«extend»', 'dependency')
  // Traceability: objective / refine / derive / satisfy … to a requirement.
  const requirementIds = new Set(requirements.map((r) => r.id))
  for (const rel of elements) {
    const label = traceLabel(rel)
    if (!label || !rel.sourceId || !rel.targetId) continue
    if (!requirementIds.has(rel.sourceId) && !requirementIds.has(rel.targetId)) continue
    pushRelation(rel, `«${label}»`, rel.kind === 'satisfy' ? 'satisfy' : 'dependency')
  }

  const savedAnchors: Record<string, BoundaryAnchor[] | null | undefined> = {}
  for (const n of nodes) {
    if (n.type !== 'useCase' && n.type !== 'actor' && n.type !== 'requirement') continue
    savedAnchors[n.id] = visualization.nodes[n.id]?.anchors
  }
  const synced = syncUseCaseAnchors(nodes, edges, { savedAnchors })
  return { nodes: synced.nodes, edges: synced.edges }
}
