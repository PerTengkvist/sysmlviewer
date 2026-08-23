import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  assignPortSidesAndOffsets,
  autoLayoutStructure,
  sizePartForPorts,
} from './structureAutoLayout'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
    w?: number
    h?: number
    label?: string
    isBoundary?: boolean
    parentId?: string
    ports?: PartNodeData['ports']
  } = {},
): Node {
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    width: opts.w ?? 160,
    height: opts.h ?? 100,
    style: { width: opts.w ?? 160, height: opts.h ?? 100 },
    data: {
      label: opts.label ?? id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

describe('sizePartForPorts', () => {
  it('grows width so left and right labels do not share the same space', () => {
    const small = sizePartForPorts('Box', [
      { name: 'a', side: 'left' },
      { name: 'b', side: 'right' },
    ])
    const wide = sizePartForPorts('Box', [
      { name: 'very_long_port_name_left', side: 'left' },
      { name: 'very_long_port_name_right', side: 'right' },
    ])
    expect(wide.width).toBeGreaterThan(small.width)
    expect(wide.width).toBeGreaterThan(220)
  })

  it('grows height with port count', () => {
    const few = sizePartForPorts('P', [
      { name: 'a', side: 'left' },
      { name: 'b', side: 'left' },
    ])
    const many = sizePartForPorts('P', [
      { name: 'a', side: 'left' },
      { name: 'b', side: 'left' },
      { name: 'c', side: 'left' },
      { name: 'd', side: 'left' },
      { name: 'e', side: 'left' },
    ])
    expect(many.height).toBeGreaterThan(few.height)
  })
})

describe('assignPortSidesAndOffsets', () => {
  it('places child port on left when parent peer port is on left', () => {
    const nodes = [
      part('root', {
        isBoundary: true,
        w: 500,
        h: 300,
        ports: [
          { id: 'root::p', name: 'p', side: 'left', offset: 0.4 },
        ],
      }),
      part('child', {
        parentId: 'root',
        x: 80,
        y: 60,
        ports: [
          { id: 'child::q', name: 'q', side: 'right', offset: 0.5 },
        ],
      }),
    ]
    const links = [
      {
        edgeId: 'c1',
        sourcePart: 'root',
        targetPart: 'child',
        sourcePort: 'root::p',
        targetPort: 'child::q',
      },
    ]
    const placed = assignPortSidesAndOffsets(nodes, links)
    expect(placed.get('child::q')?.side).toBe('left')
  })
})

describe('autoLayoutStructure', () => {
  it('returns size and position patches for parts and port sides', () => {
    const nodes = [
      part('root', { isBoundary: true, w: 400, h: 240 }),
      part('a', {
        parentId: 'root',
        label: 'Alpha',
        ports: [
          { id: 'a::out', name: 'out', side: 'right', offset: 0.4 },
        ],
      }),
      part('b', {
        parentId: 'root',
        label: 'Beta',
        x: 200,
        ports: [
          { id: 'b::in', name: 'in', side: 'left', offset: 0.4 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'a',
        target: 'b',
        sourceHandle: 'a::out',
        targetHandle: 'target:b::in',
      },
    ]
    const result = autoLayoutStructure(nodes, edges)
    expect(result.nodes['a']?.width).toBeGreaterThan(100)
    expect(result.nodes['b']?.x).toBeGreaterThan(result.nodes['a']?.x ?? 0)
    expect(result.nodes['a::out']?.side).toBeTruthy()
    expect(result.nodes['b::in']?.side).toBeTruthy()
  })
})
