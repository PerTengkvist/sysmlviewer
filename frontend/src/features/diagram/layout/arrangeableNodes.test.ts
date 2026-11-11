import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import { arrangeableNodeIds } from './arrangeableNodes'
import { alignFlowSelection } from './alignFlowSelection'
import { distributeFlowSelection } from './distributeNodes'

/** A node sized only by React Flow measurement (no style width/height). */
function measured(
  id: string,
  type: string | undefined,
  x: number,
  y: number,
  width = 160,
  height = 80,
): Node {
  return {
    id,
    ...(type ? { type } : {}),
    position: { x, y },
    measured: { width, height },
    data: {},
  }
}

describe('arrangeableNodeIds', () => {
  const nodes = [
    measured('req1', 'requirement', 0, 0),
    measured('uc1', 'useCase', 0, 0),
    measured('act', 'actor', 0, 0),
    measured('iface', 'part', 0, 0),
    measured('plain', undefined, 0, 0),
    measured('anno::p', 'portAnnotation', 0, 0),
  ]

  it('keeps requirement, use case, actor and part nodes in selection order', () => {
    expect(
      arrangeableNodeIds(nodes, ['uc1', 'req1', 'act', 'iface', 'plain']),
    ).toEqual(['uc1', 'req1', 'act', 'iface', 'plain'])
  })

  it('drops edges, port labels and unknown ids', () => {
    expect(
      arrangeableNodeIds(nodes, ['edge-1', 'anno::p', 'req1', 'missing']),
    ).toEqual(['req1'])
  })
})

describe('distribute requirement / use case / interface nodes', () => {
  it('spaces measured requirement nodes evenly along X', () => {
    const nodes = [
      measured('r1', 'requirement', 0, 0),
      measured('r2', 'requirement', 100, 40),
      measured('r3', 'requirement', 600, 0),
    ]
    const { patch } = distributeFlowSelection(
      nodes,
      arrangeableNodeIds(nodes, ['r1', 'r2', 'r3']),
      'horizontal',
    )
    // centers r1=80, r3=680 → r2 center 380 → x = 300
    expect(patch.r2?.x).toBe(300)
    expect(patch.r2?.y).toBe(40)
  })

  it('spaces mixed use case, requirement and interface nodes along Y', () => {
    const nodes = [
      measured('uc', 'useCase', 0, 0, 160, 60),
      measured('req', 'requirement', 10, 50, 160, 100),
      measured('if', 'part', 0, 400, 160, 60),
    ]
    const { patch } = distributeFlowSelection(
      nodes,
      arrangeableNodeIds(nodes, ['uc', 'req', 'if']),
      'vertical',
    )
    // centers uc=30, if=430 → req center 230 → y = 180
    expect(patch.req?.y).toBe(180)
    expect(patch.req?.x).toBe(10)
  })
})

describe('align with non-part nodes', () => {
  it('uses the first selected node as anchor, skipping selected edges', () => {
    const nodes = [
      measured('a', 'requirement', 0, 0),
      measured('b', 'useCase', 300, 120),
    ]
    const { patch } = alignFlowSelection(
      nodes,
      ['edge-1', 'a', 'b'],
      'horizontal',
    )
    expect(patch.a).toBeUndefined()
    expect(patch.b?.y).toBe(0)
    expect(patch.b?.x).toBe(300)
  })

  it('persists position only, never a fallback or measured size', () => {
    const nodes = [
      measured('a', 'requirement', 0, 0),
      { id: 'b', type: 'useCase', position: { x: 300, y: 120 }, data: {} },
    ]
    const { patch } = alignFlowSelection(nodes, ['a', 'b'], 'vertical')
    expect(patch.b?.x).toBeDefined()
    expect(patch.b?.width).toBeUndefined()
    expect(patch.b?.height).toBeUndefined()
  })
})
