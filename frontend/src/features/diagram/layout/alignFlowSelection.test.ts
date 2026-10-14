import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  alignFlowSelection,
  applyAlignPatchToFlowNodes,
  flowNodesToAlignable,
} from './alignFlowSelection'

function part(
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 40,
  parentId?: string,
): Node {
  return {
    id,
    position: { x, y },
    style: { width: w, height: h },
    data: {},
    ...(parentId ? { parentId } : {}),
  }
}

describe('alignFlowSelection', () => {
  it('aligns vertically so centers share the same X', () => {
    const nodes = [part('a', 0, 0), part('b', 200, 80)]
    const { patch } = alignFlowSelection(nodes, ['a', 'b'], 'vertical')
    expect(patch.a).toBeUndefined()
    expect(patch.b?.x).toBe(0)
    expect(patch.b?.y).toBe(80)
    expect(patch.b?.width).toBe(100)
    expect(patch.b?.height).toBe(40)
  })

  it('returns empty patch for a single selection', () => {
    const nodes = [part('a', 0, 0), part('b', 200, 80)]
    expect(alignFlowSelection(nodes, ['a'], 'vertical').patch).toEqual({})
  })

  it('ignores selected ids that are not among the nodes', () => {
    const nodes = [part('a', 0, 0)]
    expect(
      alignFlowSelection(nodes, ['missing', 'also'], 'vertical').patch,
    ).toEqual({})
  })

  it('moves a nested part in parent-relative coordinates', () => {
    const nodes = [
      part('parent', 100, 100, 400, 300),
      part('a', 0, 0, 100, 40, 'parent'),
      part('b', 200, 80, 100, 40, 'parent'),
    ]
    const { patch } = alignFlowSelection(nodes, ['a', 'b'], 'vertical')
    // Anchor a abs center X = 100+50 = 150 → b abs left = 100 → relative x = 0
    expect(patch.b?.x).toBe(0)
    expect(patch.b?.y).toBe(80)
  })

  it('walks nested parent origins for deeper nesting', () => {
    const nodes = [
      part('root', 50, 50, 500, 400),
      part('mid', 20, 20, 300, 200, 'root'),
      part('a', 10, 10, 80, 40, 'mid'),
      part('b', 120, 30, 80, 40, 'mid'),
    ]
    const items = flowNodesToAlignable(nodes)
    const b = items.find((i) => i.id === 'b')
    // mid absolute origin = 50+20 = 70
    expect(b?.parentAbs).toEqual({ x: 70, y: 70 })

    const { patch } = alignFlowSelection(nodes, ['a', 'b'], 'vertical')
    // a abs center X = 70+10+40 = 120 → b relative x = 120-40 - 70 = 10
    expect(patch.b?.x).toBe(10)
  })
})

describe('applyAlignPatchToFlowNodes', () => {
  it('updates live node positions from the patch', () => {
    const nodes = [part('a', 0, 0), part('b', 200, 80)]
    const { patch } = alignFlowSelection(nodes, ['a', 'b'], 'vertical')
    const next = applyAlignPatchToFlowNodes(nodes, patch)
    expect(next.find((n) => n.id === 'b')?.position).toEqual({ x: 0, y: 80 })
    expect(next.find((n) => n.id === 'a')?.position).toEqual({ x: 0, y: 0 })
  })
})
