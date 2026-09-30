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
