import { describe, expect, it } from 'vitest'
import { buildSequenceGraph } from './buildSequenceGraph'
import type { ViewPayload } from '../../../api'

function seqFixture(): ViewPayload {
  return {
    view: {
      id: 'P::V',
      name: 'V',
      rootArtifactId: 'P::I',
      parentViewId: null,
      typeRef: 'SequenceView',
    },
    diagramMode: 'sequence',
    semantic: {
      'P::I': {
        id: 'P::I',
        kind: 'interaction',
        name: 'I',
        parentId: 'P',
        typeRef: 'Interaction',
        sourceId: null,
        targetId: null,
        children: ['P::I::A', 'P::I::B', 'P::I::msg1'],
        fileId: 'f',
      },
      'P::I::A': {
        id: 'P::I::A',
        kind: 'lifeline',
        name: 'A',
        parentId: 'P::I',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::I::B': {
        id: 'P::I::B',
        kind: 'lifeline',
        name: 'B',
        parentId: 'P::I',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::I::msg1': {
        id: 'P::I::msg1',
        kind: 'message',
        name: 'ping',
        parentId: 'P::I',
        typeRef: 'ping',
        sourceId: 'P::I::A',
        targetId: 'P::I::B',
        children: [],
        fileId: 'f',
      },
    },
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildSequenceGraph', () => {
  it('places lifelines and ordered message edges', () => {
    const { nodes, edges } = buildSequenceGraph(seqFixture(), 'light')
    expect(nodes).toHaveLength(2)
    expect(nodes.every((n) => n.type === 'lifeline')).toBe(true)
    expect(nodes[0].position.x).toBe(60)
    expect(nodes[1].position.x).toBe(220)
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('P::I::A')
    expect(edges[0].target).toBe('P::I::B')
    expect(edges[0].sourceHandle).toBe('msg-0-out')
    expect(edges[0].targetHandle).toBe('msg-0-in')
    expect((edges[0].data as { sequenceIndex: number }).sequenceIndex).toBe(0)
  })

  it('passes selectedColor and selectedFactor on edges', () => {
    const { edges } = buildSequenceGraph(seqFixture(), 'light', {
      selectedConnectionColor: '#112233',
      selectedConnectionLinewidthFactor: 3,
    })
    expect(edges[0].data).toMatchObject({
      selectedColor: '#112233',
      selectedFactor: 3,
    })
  })

  it('uses one taller header when a camelCase lifeline name wraps', () => {
    const fixture = seqFixture()
    fixture.semantic['P::I::A'].name = 'ManeuvrabilityController'
    const { nodes } = buildSequenceGraph(fixture, 'light')
    const headers = nodes.map(
      (node) => (node.data as { headerHeight: number }).headerHeight,
    )
    expect(headers[0]).toBeGreaterThan(48)
    expect(headers[1]).toBe(headers[0])
    expect(nodes[0].style?.height).toBe(nodes[1].style?.height)
  })

  it('ignores merge-index positions far off to the right', () => {
    const fixture = seqFixture()
    fixture.visualization.nodes = {
      'P::I::A': {
        artifactId: 'P::I::A',
        x: 1200,
        y: 40,
        width: 120,
        height: 48,
        symbolRef: 'default-lifeline',
        side: null,
        offset: null,
      },
      'P::I::B': {
        artifactId: 'P::I::B',
        x: 1360,
        y: 40,
        width: 120,
        height: 48,
        symbolRef: 'default-lifeline',
        side: null,
        offset: null,
      },
    }
    const { nodes } = buildSequenceGraph(fixture, 'light')
    expect(nodes[0].position.x).toBe(60)
    expect(nodes[1].position.x).toBe(220)
  })
})
