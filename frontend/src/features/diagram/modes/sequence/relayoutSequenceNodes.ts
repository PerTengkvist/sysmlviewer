import type { Edge, Node } from '@xyflow/react'
import type { SequenceLayout } from '../../../../api'
import type { LifelineNodeData } from './LifelineNode'
import { LIFELINE_TOP, sequenceGeometry } from './sequenceLayout'

/**
 * Re-pack the lifeline nodes on the canvas after a reorder or resize, using
 * the same rules as `buildSequenceGraph`. Returns the nodes with new x, a
 * common y, widths and shared header height, and the layout that was applied.
 */
export function relayoutSequenceNodes(
  nodes: Node[],
  edges: Edge[],
  layout: SequenceLayout | null | undefined,
): { nodes: Node[]; layout: SequenceLayout } {
  const lifelines = nodes.filter((n) => n.type === 'lifeline')
  const nameOf = (n: Node) => (n.data as unknown as LifelineNodeData).label
  const geometry = sequenceGeometry(
    lifelines.map((n) => ({ id: n.id, name: nameOf(n) })),
    edges.map((e) => ({
      sourceId: e.source,
      targetId: e.target,
      label: String((e.data as { label?: string } | undefined)?.label ?? ''),
    })),
    layout,
  )
  const out = nodes.map((node) => {
    if (node.type !== 'lifeline') return node
    const data = node.data as unknown as LifelineNodeData
    const totalH = geometry.headerHeight + data.lineHeight
    return {
      ...node,
      position: { x: geometry.xs[node.id], y: LIFELINE_TOP },
      width: undefined,
      height: undefined,
      style: { ...node.style, width: geometry.widths[node.id], height: totalH },
      data: { ...data, headerHeight: geometry.headerHeight },
    }
  })
  return { nodes: out, layout: { ...(layout ?? {}) } }
}
