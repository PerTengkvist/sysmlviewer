import type { Edge, Node } from '@xyflow/react'
import type { SemanticElement, ViewPayload } from '../../../api'
import type { ViewMode } from '../../../settings'
import { edgeStrokeStyle } from '../../elementStyle'
import type { TreeNodeData } from './TreeNode'

const NODE_W = 160
const NODE_H = 36
const GAP_X = 24
const GAP_Y = 56
const LEFT = 40
const TOP = 40

const SKIP_KINDS = new Set([
  'port',
  'connection',
  'attribute',
  'message',
  'transition',
  'succession',
  'view',
])

export function buildTreeGraph(
  view: ViewPayload,
  viewMode: ViewMode,
  collapsedIds: Set<string>,
  onToggle: (artifactId: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const { semantic, visualization } = view
  const rootId = view.view.rootArtifactId
  const root = semantic[rootId]
  if (!root) return { nodes: [], edges: [] }

  const childrenOf = (id: string): SemanticElement[] => {
    const el = semantic[id]
    if (!el) return []
    return (el.children || [])
      .map((cid) => semantic[cid])
      .filter((c): c is SemanticElement => !!c && !SKIP_KINDS.has(c.kind))
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  type LayoutNode = { id: string; depth: number; x: number; y: number }
  const layout: LayoutNode[] = []
  let leafX = 0

  const walk = (id: string, depth: number): number => {
    const kids = collapsedIds.has(id) ? [] : childrenOf(id)
    if (!kids.length) {
      const x = leafX
      leafX += 1
      layout.push({ id, depth, x, y: depth })
      return x
    }
    const childXs = kids.map((k) => walk(k.id, depth + 1))
    const x = (Math.min(...childXs) + Math.max(...childXs)) / 2
    layout.push({ id, depth, x, y: depth })
    return x
  }
  walk(rootId, 0)

  const nodes: Node[] = layout.map((ln) => {
    const el = semantic[ln.id]
    const viz = visualization.nodes[ln.id]
    const kids = childrenOf(ln.id)
    const data: TreeNodeData = {
      label: el.name,
      artifactId: ln.id,
      kind: el.kind,
      collapsed: collapsedIds.has(ln.id),
      hasChildren: kids.length > 0 || (collapsedIds.has(ln.id) && childrenOf(ln.id).length === 0
        ? false
        : (el.children || []).some((cid) => {
            const c = semantic[cid]
            return c && !SKIP_KINDS.has(c.kind)
          })),
      formatStyle: viz?.style,
      viewMode,
      onToggle,
    }
    // Fix hasChildren when collapsed: still show toggle if element has structural children
    data.hasChildren = (el.children || []).some((cid) => {
      const c = semantic[cid]
      return c && !SKIP_KINDS.has(c.kind)
    })

    return {
      id: ln.id,
      type: 'tree',
      position: {
        x: viz && Number.isFinite(viz.x) ? viz.x : LEFT + ln.x * (NODE_W + GAP_X),
        y: viz && Number.isFinite(viz.y) && viz.y > 0 ? viz.y : TOP + ln.y * (NODE_H + GAP_Y),
      },
      style: {
        width: viz?.width ?? NODE_W,
        height: viz?.height ?? NODE_H,
      },
      data,
    }
  })

  const visible = new Set(layout.map((l) => l.id))
  const edges: Edge[] = []
  for (const ln of layout) {
    if (collapsedIds.has(ln.id)) continue
    for (const child of childrenOf(ln.id)) {
      if (!visible.has(child.id)) continue
      const stroke = edgeStrokeStyle(undefined, viewMode)
      edges.push({
        id: `tree:${ln.id}->${child.id}`,
        source: ln.id,
        target: child.id,
        sourceHandle: 'out',
        targetHandle: 'in',
        type: 'smoothstep',
        style: { stroke: stroke.stroke, strokeWidth: 1.5 },
      })
    }
  }

  return { nodes, edges }
}
