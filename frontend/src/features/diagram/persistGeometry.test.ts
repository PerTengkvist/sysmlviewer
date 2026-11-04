import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import {
  buildDragStopPatch,
  buildResizeEndPatch,
  mergeMovedNodes,
  withDescendants,
} from './persistGeometry'

function node(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    position: { x: 1, y: 2 },
    style: { width: 100, height: 50 },
    data: {},
    ...overrides,
  }
}

describe('mergeMovedNodes', () => {
  it('keeps every node and takes dragged positions', () => {
    const live = [node('a'), node('b')]
    const dragged = [node('a', { position: { x: 50, y: 60 } })]

    const merged = mergeMovedNodes(live, dragged)

    expect(merged.map((n) => n.id)).toEqual(['a', 'b'])
    expect(merged[0].position).toEqual({ x: 50, y: 60 })
    expect(merged[1].position).toEqual({ x: 1, y: 2 })
  })

  it('takes the new size of a resized node', () => {
    const resized = node('a', { style: { width: 300, height: 200 } })

    const [merged] = mergeMovedNodes([node('a')], [resized])

    expect(merged.style).toEqual({ width: 300, height: 200 })
  })
})

describe('withDescendants', () => {
  it('adds children at every depth', () => {
    const nodes = [
      node('a'),
      node('b', { parentId: 'a' }),
      node('c', { parentId: 'b' }),
      node('other'),
    ]

    expect(withDescendants(nodes, ['a'])).toEqual(new Set(['a', 'b', 'c']))
  })

  it('keeps the given ids when they have no children', () => {
    expect(withDescendants([node('a')], ['a'])).toEqual(new Set(['a']))
  })
})

describe('buildDragStopPatch', () => {
  it('includes every dragged node', () => {
    const patch = buildDragStopPatch([
      node('a', { position: { x: 5, y: 6 } }),
      node('b', { position: { x: 7, y: 8 } }),
    ])

    expect(patch).toEqual({
      a: { artifactId: 'a', x: 5, y: 6, width: 100, height: 50 },
      b: { artifactId: 'b', x: 7, y: 8, width: 100, height: 50 },
    })
  })
})

describe('buildResizeEndPatch', () => {
  it('takes the position from live nodes, as the batch only has dimensions', () => {
    const live = [node('a', { position: { x: 40, y: 30 } })]

    const patch = buildResizeEndPatch([{ id: 'a', width: 200, height: 90 }], live)

    expect(patch).toEqual({
      a: { artifactId: 'a', x: 40, y: 30, width: 200, height: 90 },
    })
  })

  it('includes children, which a top or left resize moves', () => {
    const live = [
      node('a'),
      node('child', { parentId: 'a', position: { x: 9, y: 8 } }),
      node('other', { parentId: 'b' }),
    ]

    const patch = buildResizeEndPatch([{ id: 'a', width: 200, height: 90 }], live)

    expect(patch.child).toEqual({ artifactId: 'child', x: 9, y: 8 })
    expect(patch.other).toBeUndefined()
  })

  it('keeps dimensions when the node is not among live nodes', () => {
    const patch = buildResizeEndPatch([{ id: 'gone', width: 200, height: 90 }], [])

    expect(patch).toEqual({ gone: { artifactId: 'gone', width: 200, height: 90 } })
  })
})
