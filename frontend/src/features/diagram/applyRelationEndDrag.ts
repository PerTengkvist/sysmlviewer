import type { Edge } from '@xyflow/react'
import type { PortSide } from '../../api'
import type { SysmlEdgeData } from './InternalEdge'

export type RelationEndPersist = {
  artifactId: string
  end: 'source' | 'target'
  side: PortSide
  offset: number
  companion?: { side: PortSide; offset: number }
}

export type ApplyRelationEndDragResult = {
  edges: Edge[]
  persist: RelationEndPersist | null
}

/** Pure update for relation-end drag; no React side effects. */
export function applyRelationEndDrag(
  edges: Edge[],
  artifactId: string,
  end: 'source' | 'target',
  side: PortSide,
  offset: number,
  shouldPersist: boolean,
): ApplyRelationEndDragResult {
  const next = edges.map((edge) => {
    if (
      edge.id !== artifactId &&
      (edge.data as SysmlEdgeData | undefined)?.artifactId !== artifactId
    ) {
      return edge
    }
    const data = { ...(edge.data as SysmlEdgeData) }
    if (end === 'source') {
      data.sourceSide = side
      data.sourceOffset = offset
      data.manualAttachment = true
      return {
        ...edge,
        sourceHandle: `rel-src-${edge.id}`,
        data,
      }
    }
    data.targetSide = side
    data.targetOffset = offset
    data.manualAttachment = true
    return {
      ...edge,
      targetHandle: `rel-tgt-${edge.id}`,
      data,
    }
  })

  if (!shouldPersist) {
    return { edges: next, persist: null }
  }

  const updated = next.find(
    (e) =>
      e.id === artifactId ||
      (e.data as SysmlEdgeData | undefined)?.artifactId === artifactId,
  )
  const d = (updated?.data || {}) as SysmlEdgeData
  const companion =
    end === 'source'
      ? d.targetSide
        ? { side: d.targetSide, offset: d.targetOffset ?? 0.5 }
        : undefined
      : d.sourceSide
        ? { side: d.sourceSide, offset: d.sourceOffset ?? 0.5 }
        : undefined

  return {
    edges: next,
    persist: { artifactId, end, side, offset, companion },
  }
}
