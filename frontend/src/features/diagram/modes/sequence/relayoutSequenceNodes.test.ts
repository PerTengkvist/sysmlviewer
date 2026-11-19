import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { relayoutSequenceNodes } from './relayoutSequenceNodes'
import { LIFELINE_TOP } from './sequenceLayout'

function ll(id: string, label: string, x: number): Node {
  return {
    id,
    type: 'lifeline',
    position: { x, y: 300 },
    style: { width: 99, height: 400 },
    data: { label, headerHeight: 48, lineHeight: 352 },
  }
}
const edge = (id: string, source: string, target: string, label: string): Edge => ({
  id,
  source,
  target,
  data: { label },
})

describe('relayoutSequenceNodes', () => {
  const nodes = [ll('a', 'A', 500), ll('b', 'B', 10), ll('c', 'C', 250)]
  const edges = [edge('m1', 'a', 'b', 'hi'), edge('m2', 'b', 'c', 'yo')]

  it('packs on one line in default order and resets y', () => {
    const { nodes: out, layout } = relayoutSequenceNodes(nodes, edges, null)
    expect(layout).toEqual({})
    const sorted = [...out].sort((p, q) => p.position.x - q.position.x)
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b', 'c'])
    expect(out.every((n) => n.position.y === LIFELINE_TOP)).toBe(true)
  })

  it('applies a saved order and width and keeps the saved layout', () => {
    const saved = { order: ['c', 'b', 'a'], widths: { b: 200 } }
    const { nodes: out, layout } = relayoutSequenceNodes(nodes, edges, saved)
    expect(layout).toEqual(saved)
    const byId = Object.fromEntries(out.map((n) => [n.id, n]))
    expect(byId.c.position.x).toBeLessThan(byId.b.position.x)
    expect(byId.b.style?.width).toBe(200)
    expect(byId.b.position.x + 200).toBeLessThan(byId.a.position.x)
    expect(byId.a.style?.height).toBe(
      (byId.a.data as { headerHeight: number }).headerHeight + 352,
    )
  })
})
