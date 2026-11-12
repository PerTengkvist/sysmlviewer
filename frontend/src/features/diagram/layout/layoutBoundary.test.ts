import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { layoutBoundaryId, normalizeLayoutBoundary } from './layoutBoundary'

function part(
  id: string,
  opts: { parentId?: string; isBoundary?: boolean; type?: string } = {},
): Node {
  return {
    id,
    type: opts.type ?? 'part',
    parentId: opts.parentId,
    position: { x: 0, y: 0 },
    style: { width: 160, height: 100 },
    data: {
      label: id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

const flag = (n: Node) => !!(n.data as PartNodeData).isBoundary

describe('layoutBoundaryId', () => {
  it('is the whitebox root when every node is inside it', () => {
    const nodes = [
      part('W', { isBoundary: true }),
      part('a', { parentId: 'W' }),
      part('K', { parentId: 'W', isBoundary: true }),
      part('k1', { parentId: 'K' }),
    ]
    expect(layoutBoundaryId(nodes)).toBe('W')
  })

  it('is none for a package root with several top-level containers', () => {
    const nodes = [
      part('C1', { isBoundary: true }),
      part('c1', { parentId: 'C1' }),
      part('C2', { isBoundary: true }),
      part('c2', { parentId: 'C2' }),
      part('C3', { isBoundary: true }),
      part('c3', { parentId: 'C3' }),
    ]
    expect(layoutBoundaryId(nodes)).toBeNull()
  })

  it('is none when another root sits beside the whitebox root', () => {
    const nodes = [
      part('W', { isBoundary: true }),
      part('a', { parentId: 'W' }),
      part('O'),
    ]
    expect(layoutBoundaryId(nodes)).toBeNull()
  })

  it('ignores nodes that AutoLayout does not place', () => {
    const nodes = [
      part('W', { isBoundary: true }),
      part('a', { parentId: 'W' }),
      part('label', { type: 'portAnnotation' }),
    ]
    expect(layoutBoundaryId(nodes)).toBe('W')
  })

  it('is none without a flagged node', () => {
    expect(layoutBoundaryId([part('a'), part('b')])).toBeNull()
  })
})

describe('normalizeLayoutBoundary', () => {
  it('keeps only the real boundary flagged', () => {
    const nodes = [
      part('W', { isBoundary: true }),
      part('K', { parentId: 'W', isBoundary: true }),
      part('k1', { parentId: 'K' }),
    ]
    const out = normalizeLayoutBoundary(nodes)
    expect(out.filter(flag).map((n) => n.id)).toEqual(['W'])
    // Untouched nodes keep their identity.
    expect(out[0]).toBe(nodes[0])
    expect(out[2]).toBe(nodes[2])
  })

  it('demotes every top-level container when none encloses the rest', () => {
    const nodes = [
      part('C1', { isBoundary: true }),
      part('c1', { parentId: 'C1' }),
      part('C2', { isBoundary: true }),
    ]
    expect(normalizeLayoutBoundary(nodes).filter(flag)).toEqual([])
  })
})
