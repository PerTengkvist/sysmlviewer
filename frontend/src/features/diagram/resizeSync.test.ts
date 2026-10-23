import { describe, expect, it } from 'vitest'
import type { Node, NodeChange } from '@xyflow/react'
import {
  applyDimensionChangesToStyle,
  nodeBoxSize,
  nodeExtentSize,
} from './resizeSync'

function part(
  id: string,
  opts: {
    width?: number
    height?: number
    styleW?: number
    styleH?: number
    measuredW?: number
    measuredH?: number
  },
): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    width: opts.width,
    height: opts.height,
    style: {
      ...(opts.styleW != null ? { width: opts.styleW } : {}),
      ...(opts.styleH != null ? { height: opts.styleH } : {}),
    },
    measured:
      opts.measuredW != null || opts.measuredH != null
        ? { width: opts.measuredW, height: opts.measuredH }
        : undefined,
  } as Node
}

describe('nodeExtentSize', () => {
  it('prefers node.width/height over style when both exist', () => {
    const n = part('a', {
      width: 400,
      height: 300,
      styleW: 180,
      styleH: 120,
    })
    expect(nodeExtentSize(n)).toEqual({ width: 400, height: 300 })
  })

  it('falls back to style then measured', () => {
    expect(
      nodeExtentSize(part('a', { styleW: 200, styleH: 150 })),
    ).toEqual({ width: 200, height: 150 })
    expect(
      nodeExtentSize(part('a', { measuredW: 90, measuredH: 60 })),
    ).toEqual({ width: 90, height: 60 })
  })
})

describe('nodeBoxSize', () => {
  it('uses live width before stale style', () => {
    expect(
      nodeBoxSize(part('a', { width: 400, height: 300, styleW: 100, styleH: 80 })),
    ).toEqual({ width: 400, height: 300 })
  })
})

describe('applyDimensionChangesToStyle', () => {
  it('mirrors dimensions into style.width/height', () => {
    const nodes = [part('a', { styleW: 180, styleH: 120, width: 180, height: 120 })]
    const changes: NodeChange[] = [
      {
        type: 'dimensions',
        id: 'a',
        dimensions: { width: 400, height: 300 },
        resizing: false,
      },
    ]
    const next = applyDimensionChangesToStyle(nodes, changes)
    expect(next[0].width).toBe(400)
    expect(next[0].height).toBe(300)
    expect(next[0].style).toMatchObject({ width: 400, height: 300 })
  })

  it('leaves unrelated nodes unchanged', () => {
    const nodes = [
      part('a', { styleW: 100, styleH: 80 }),
      part('b', { styleW: 50, styleH: 40 }),
    ]
    const changes: NodeChange[] = [
      {
        type: 'dimensions',
        id: 'a',
        dimensions: { width: 200, height: 160 },
      },
    ]
    const next = applyDimensionChangesToStyle(nodes, changes)
    expect(next[1]).toBe(nodes[1])
    expect(next[0].style).toMatchObject({ width: 200, height: 160 })
  })

  it('is a no-op when there are no dimension changes', () => {
    const nodes = [part('a', { styleW: 100, styleH: 80 })]
    const next = applyDimensionChangesToStyle(nodes, [
      { type: 'position', id: 'a', position: { x: 1, y: 2 } },
    ])
    expect(next).toBe(nodes)
  })
})
