type GeomNode = {
  id: string
  type?: string
  position: { x: number; y: number }
  style?: { width?: unknown; height?: unknown }
  data?: { label?: string; anchors?: unknown; [key: string]: unknown }
}

type GeomEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  data?: { relationKind?: string; label?: string; [key: string]: unknown }
}

function actorLabel(node: GeomNode | undefined): string {
  return String(node?.data?.label || '').trim().toLowerCase()
}

function edgeMatchKey(edge: GeomEdge): string {
  const kind = String(edge.data?.relationKind || '')
  return `${edge.source}>${edge.target}>${kind}`
}

/**
 * Keep geometry for artifacts that are still on the diagram.
 * New ids keep the freshly built placement. Removed ids are absent from the result.
 */
export function preserveExistingGeometry<N extends GeomNode, E extends GeomEdge>(
  builtNodes: N[],
  builtEdges: E[],
  previousNodes: GeomNode[],
  previousEdges: GeomEdge[],
): { nodes: N[]; edges: E[] } {
  const prevById = new Map(previousNodes.map((node) => [node.id, node]))
  const prevActors = previousNodes.filter((node) => node.type === 'actor')

  const nodes = builtNodes.map((node) => {
    const previous =
      prevById.get(node.id) ||
      (node.type === 'actor'
        ? prevActors.find((actor) => actorLabel(actor) === actorLabel(node))
        : undefined)
    if (!previous) return node
    const width = previous.style?.width ?? node.style?.width
    const height = previous.style?.height ?? node.style?.height
    return {
      ...node,
      position: { ...previous.position },
      style: { ...node.style, width, height },
      data: {
        ...node.data,
        anchors: previous.data?.anchors ?? node.data?.anchors,
      },
    }
  })

  const prevEdgeById = new Map(previousEdges.map((edge) => [edge.id, edge]))
  const prevEdgeByEnds = new Map(previousEdges.map((edge) => [edgeMatchKey(edge), edge]))
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  const edges = builtEdges.map((edge) => {
    let previous = prevEdgeById.get(edge.id) || prevEdgeByEnds.get(edgeMatchKey(edge))
    if (!previous && String(edge.id).startsWith('use:')) {
      const label = actorLabel(nodeById.get(edge.source))
      previous = previousEdges.find(
        (candidate) =>
          candidate.target === edge.target &&
          String(candidate.id).startsWith('use:') &&
          actorLabel(prevById.get(candidate.source)) === label,
      )
    }
    if (!previous?.data) return edge
    const prevData = previous.data
    return {
      ...edge,
      sourceHandle: previous.sourceHandle ?? edge.sourceHandle,
      targetHandle: previous.targetHandle ?? edge.targetHandle,
      data: {
        ...edge.data,
        waypoints: prevData.waypoints ?? edge.data?.waypoints,
        labelOffset: prevData.labelOffset ?? edge.data?.labelOffset,
        sourceSide: prevData.sourceSide ?? edge.data?.sourceSide,
        sourceOffset: prevData.sourceOffset ?? edge.data?.sourceOffset,
        targetSide: prevData.targetSide ?? edge.data?.targetSide,
        targetOffset: prevData.targetOffset ?? edge.data?.targetOffset,
        sourceAnchorId: prevData.sourceAnchorId ?? edge.data?.sourceAnchorId,
        targetAnchorId: prevData.targetAnchorId ?? edge.data?.targetAnchorId,
        routing: prevData.routing ?? edge.data?.routing,
      },
    }
  })

  return { nodes, edges }
}

const ATTACHMENT_KEYS = [
  'sourceSide',
  'sourceOffset',
  'sourceAnchorId',
  'targetSide',
  'targetOffset',
  'targetAnchorId',
] as const

type AttachmentRecord = Partial<Record<(typeof ATTACHMENT_KEYS)[number], unknown>>

/** Edge ids whose saved attachment differs between two layouts. */
export function changedEdgeAttachments(
  a: Record<string, AttachmentRecord>,
  b: Record<string, AttachmentRecord>,
): Set<string> {
  const out = new Set<string>()
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id] || {}
    const y = b[id] || {}
    if (ATTACHMENT_KEYS.some((k) => (x[k] ?? null) !== (y[k] ?? null))) out.add(id)
  }
  return out
}

/** Node ids whose saved boundary anchors differ between two layouts. */
export function changedNodeAnchors(
  a: Record<string, { anchors?: unknown }>,
  b: Record<string, { anchors?: unknown }>,
): Set<string> {
  const out = new Set<string>()
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = JSON.stringify(a[id]?.anchors ?? null)
    const y = JSON.stringify(b[id]?.anchors ?? null)
    if (x !== y) out.add(id)
  }
  return out
}

/**
 * Drop the on-screen attachment of edges and anchors an undo restored, so
 * `preserveExistingGeometry` takes them from the rebuilt (saved) diagram.
 * Positions and everything else on screen are kept.
 */
export function withoutRestoredAttachments<N extends GeomNode, E extends GeomEdge>(
  nodes: N[],
  edges: E[],
  restored: { edges: Set<string>; nodes: Set<string> },
): [N[], E[]] {
  if (!restored.edges.size && !restored.nodes.size) return [nodes, edges]
  const nextNodes = nodes.map((node) =>
    restored.nodes.has(node.id)
      ? { ...node, data: { ...node.data, anchors: undefined } }
      : node,
  )
  const nextEdges = edges.map((edge) => {
    if (!restored.edges.has(edge.id)) return edge
    const data = { ...edge.data } as Record<string, unknown>
    for (const k of ATTACHMENT_KEYS) delete data[k]
    return { ...edge, sourceHandle: undefined, targetHandle: undefined, data }
  })
  return [nextNodes, nextEdges]
}
