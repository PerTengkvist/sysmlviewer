import { describe, expect, it } from 'vitest'
import { preserveExistingGeometry } from './preserveDiagramGeometry'

describe('preserveExistingGeometry', () => {
  it('keeps positions of artifacts that remain and places only new ones', () => {
    const previousNodes = [
      { id: 'a', position: { x: 10, y: 20 }, style: { width: 40, height: 30 } },
      { id: 'gone', position: { x: 1, y: 1 } },
    ]
    const builtNodes = [
      { id: 'a', position: { x: 0, y: 0 }, style: { width: 10, height: 10 } },
      { id: 'new', position: { x: 5, y: 6 }, style: { width: 8, height: 8 } },
    ]
    const { nodes } = preserveExistingGeometry(builtNodes, [], previousNodes, [])
    expect(nodes.find((node) => node.id === 'a')?.position).toEqual({ x: 10, y: 20 })
    expect(nodes.find((node) => node.id === 'a')?.style).toMatchObject({ width: 40, height: 30 })
    expect(nodes.find((node) => node.id === 'new')?.position).toEqual({ x: 5, y: 6 })
    expect(nodes.some((node) => node.id === 'gone')).toBe(false)
  })

  it('keeps an actor position when the grouped id changes but the name stays', () => {
    const previousNodes = [
      {
        id: 'P::Unlock::Driver',
        type: 'actor',
        position: { x: -40, y: 80 },
        data: { label: 'Driver' },
      },
    ]
    const builtNodes = [
      {
        id: 'P::Brake::Driver',
        type: 'actor',
        position: { x: 24, y: 40 },
        data: { label: 'Driver' },
      },
    ]
    const { nodes } = preserveExistingGeometry(builtNodes, [], previousNodes, [])
    expect(nodes[0].position).toEqual({ x: -40, y: 80 })
  })

  it('keeps edge attachment for a relation whose id changed', () => {
    const previousEdges = [
      {
        id: 'P::Drive::include_2',
        source: 'P::Drive',
        target: 'P::Brake',
        sourceHandle: 'extra-1',
        targetHandle: 'target:extra-2',
        data: { relationKind: 'include', sourceSide: 'top', targetSide: 'left' },
      },
    ]
    const builtEdges = [
      {
        id: 'P::Drive::include_Brake',
        source: 'P::Drive',
        target: 'P::Brake',
        sourceHandle: 'default',
        targetHandle: 'target:default',
        data: { relationKind: 'include', sourceSide: 'right', targetSide: 'left' },
      },
    ]
    const { edges } = preserveExistingGeometry([], builtEdges, [], previousEdges)
    expect(edges[0].sourceHandle).toBe('extra-1')
    expect(edges[0].data?.sourceSide).toBe('top')
  })
})
