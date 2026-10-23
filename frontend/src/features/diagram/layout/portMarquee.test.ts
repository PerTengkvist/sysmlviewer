import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import {
  allPortIdsFromNodes,
  collectPortsInFlowRect,
  collectPortsInScreenRect,
  pointInRect,
  portFlowPoint,
  rectFromCorners,
} from './portMarquee'

function partNode(
  id: string,
  opts: {
    x: number
    y: number
    width?: number
    height?: number
    parentId?: string
    ports: { id: string; side: 'left' | 'right' | 'top' | 'bottom'; offset: number }[]
  },
): Node {
  return {
    id,
    position: { x: opts.x, y: opts.y },
    parentId: opts.parentId,
    width: opts.width ?? 100,
    height: opts.height ?? 100,
    style: { width: opts.width ?? 100, height: opts.height ?? 100 },
    data: { ports: opts.ports },
  } as Node
}

describe('rectFromCorners / pointInRect', () => {
  it('normalizes inverted drag', () => {
    expect(rectFromCorners({ x: 10, y: 20 }, { x: 4, y: 8 })).toEqual({
      x: 4,
      y: 8,
      width: 6,
      height: 12,
    })
  })

  it('includes boundary points with pad', () => {
    expect(pointInRect(0, 0, { x: 0, y: 0, width: 10, height: 10 })).toBe(true)
    expect(pointInRect(-2, 5, { x: 0, y: 0, width: 10, height: 10 }, 3)).toBe(
      true,
    )
  })
})

describe('collectPortsInFlowRect', () => {
  it('returns ports whose centers fall inside the rect', () => {
    const nodes = [
      partNode('p1', {
        x: 0,
        y: 0,
        ports: [
          { id: 'a', side: 'left', offset: 0.25 },
          { id: 'b', side: 'right', offset: 0.75 },
          { id: 'c', side: 'top', offset: 0.5 },
        ],
      }),
    ]
    // left@0.25 → (0, 25); right@0.75 → (100, 75); top@0.5 → (50, 0)
    const hit = collectPortsInFlowRect(
      nodes,
      { x: -5, y: 20, width: 20, height: 20 },
      0,
    )
    expect(hit).toEqual(['a'])
  })

  it('accounts for nested parent offsets', () => {
    const parent = partNode('parent', {
      x: 100,
      y: 50,
      ports: [],
    })
    const child = partNode('child', {
      x: 10,
      y: 20,
      parentId: 'parent',
      ports: [{ id: 'nested', side: 'left', offset: 0 }],
    })
    // absolute origin (110, 70); left@0 → (110, 70)
    expect(
      portFlowPoint(child, { id: 'nested', side: 'left', offset: 0 }, new Map([
        ['parent', parent],
        ['child', child],
      ])),
    ).toEqual({ x: 110, y: 70 })
    expect(
      collectPortsInFlowRect(
        [parent, child],
        { x: 100, y: 60, width: 20, height: 20 },
        0,
      ),
    ).toEqual(['nested'])
  })
})

describe('collectPortsInScreenRect', () => {
  it('hits handles whose bounding boxes intersect the marquee', () => {
    const mk = (id: string, box: { left: number; top: number; right: number; bottom: number }) => ({
      getAttribute: (name: string) => (name === 'data-handleid' ? id : null),
      getBoundingClientRect: () => box,
    })
    const handles = [
      mk('p1', { left: 40, top: 40, right: 50, bottom: 50 }),
      mk('p2', { left: 200, top: 200, right: 210, bottom: 210 }),
    ]
    const root = {
      querySelectorAll: () => ({
        forEach: (fn: (n: (typeof handles)[0]) => void) => handles.forEach(fn),
      }),
    } as unknown as ParentNode

    expect(
      collectPortsInScreenRect(
        ['p1', 'p2'],
        { left: 30, top: 30, width: 30, height: 30 },
        root,
      ),
    ).toEqual(['p1'])
    expect(
      collectPortsInScreenRect(
        ['p1', 'p2'],
        { left: 100, top: 100, width: 10, height: 10 },
        root,
      ),
    ).toEqual([])
  })

  it('lists port ids from nodes', () => {
    expect(
      allPortIdsFromNodes([
        partNode('a', {
          x: 0,
          y: 0,
          ports: [
            { id: 'p1', side: 'left', offset: 0.2 },
            { id: 'p2', side: 'right', offset: 0.5 },
          ],
        }),
      ]),
    ).toEqual(['p1', 'p2'])
  })
})
