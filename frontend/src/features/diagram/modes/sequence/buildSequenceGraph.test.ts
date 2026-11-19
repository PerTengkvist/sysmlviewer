import { describe, expect, it } from 'vitest'
import { buildSequenceGraph } from './buildSequenceGraph'
import type { ViewPayload } from '../../../../api'
import { LIFELINE_LEFT, LIFELINE_TOP } from './sequenceLayout'

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
    expect(nodes[0].position.x).toBe(LIFELINE_LEFT)
    expect(nodes[1].position.x).toBeGreaterThan(
      nodes[0].position.x + Number(nodes[0].style?.width),
    )
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
    // Narrowed by the user; by default the header is as wide as the name.
    fixture.sequenceLayout = { widths: { 'P::I::A': 120 } }
    const { nodes } = buildSequenceGraph(fixture, 'light')
    const headers = nodes.map(
      (node) => (node.data as { headerHeight: number }).headerHeight,
    )
    expect(headers[0]).toBeGreaterThan(48)
    expect(headers[1]).toBe(headers[0])
    expect(nodes[0].style?.height).toBe(nodes[1].style?.height)
  })

  it('keeps the header one line high at the default width', () => {
    const fixture = seqFixture()
    fixture.semantic['P::I::A'].name = 'ManeuvrabilityController'
    const { nodes } = buildSequenceGraph(fixture, 'light')
    expect((nodes[0].data as { headerHeight: number }).headerHeight).toBe(48)
  })

  it('marks reply messages dashed and leaves requests solid', () => {
    const fixture = seqFixture()
    fixture.semantic['P::I::msg2'] = {
      ...fixture.semantic['P::I::msg1'],
      id: 'P::I::msg2',
      name: 'pong',
      typeRef: 'pong',
      sourceId: 'P::I::B',
      targetId: 'P::I::A',
      metadataKeywords: ['reply'],
    }
    const { edges } = buildSequenceGraph(fixture, 'light')
    expect(edges).toHaveLength(2)
    expect(edges[0].style?.strokeDasharray).toBeUndefined()
    expect(edges[1].style?.strokeDasharray).toBe('8 4')
    expect((edges[1].data as { isReply?: boolean }).isReply).toBe(true)
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
    expect(nodes[0].position.x).toBe(LIFELINE_LEFT)
    expect(nodes[1].position.x).toBeGreaterThan(nodes[0].position.x)
  })

  it('ignores stored x, y and width so lifelines always share one line', () => {
    const fixture = seqFixture()
    fixture.visualization.nodes = {
      'P::I::A': { ...vizNode('P::I::A'), x: 300, y: 500, width: 400 },
      'P::I::B': { ...vizNode('P::I::B'), x: 310, y: 10, width: 300 },
    }
    const { nodes } = buildSequenceGraph(fixture, 'light')
    expect(nodes[0].position.y).toBe(LIFELINE_TOP)
    expect(nodes[1].position.y).toBe(LIFELINE_TOP)
    const [a, b] = nodes
    expect(b.position.x).toBeGreaterThanOrEqual(a.position.x + Number(a.style?.width))
    expect(Number(a.style?.width)).toBeLessThan(200)
  })

  it('orders lifelines by first message, not by id', () => {
    const fixture = seqFixture()
    fixture.semantic['P::I::msg1'].sourceId = 'P::I::B'
    fixture.semantic['P::I::msg1'].targetId = 'P::I::A'
    const { nodes } = buildSequenceGraph(fixture, 'light')
    expect(nodes.map((n) => n.id)).toEqual(['P::I::B', 'P::I::A'])
    expect(nodes[0].position.x).toBeLessThan(nodes[1].position.x)
  })

  it('keeps messages in declaration order (msg10 after msg9)', () => {
    const fixture = seqFixture()
    delete fixture.semantic['P::I::msg1']
    for (let i = 1; i <= 11; i++) {
      fixture.semantic[`P::I::msg${i}`] = {
        ...seqFixture().semantic['P::I::A'],
        id: `P::I::msg${i}`,
        kind: 'message',
        name: `m${i}`,
        sourceId: 'P::I::A',
        targetId: 'P::I::B',
      }
    }
    const { edges } = buildSequenceGraph(fixture, 'light')
    expect(edges.map((e) => e.id.split('::').pop())).toEqual(
      Array.from({ length: 11 }, (_, i) => `msg${i + 1}`),
    )
    expect(edges[10].sourceHandle).toBe('msg-10-out')
  })

  it('applies saved order and widths (clamped) from sequenceLayout', () => {
    const fixture = seqFixture()
    fixture.sequenceLayout = {
      order: ['P::I::B', 'P::I::A'],
      widths: { 'P::I::A': 260, 'P::I::B': 1 },
    }
    const { nodes } = buildSequenceGraph(fixture, 'light')
    expect(nodes.map((n) => n.id)).toEqual(['P::I::B', 'P::I::A'])
    expect(nodes[1].style?.width).toBe(260)
    expect(Number(nodes[0].style?.width)).toBeGreaterThanOrEqual(56)
    expect((nodes[1].data as { minWidth: number }).minWidth).toBeGreaterThan(0)
  })
})

function occurrenceFixture(): ViewPayload {
  const base = seqFixture()
  const el = (
    id: string,
    kind: ViewPayload['semantic'][string]['kind'],
    extra: Partial<ViewPayload['semantic'][string]> = {},
  ) => ({
    id,
    kind,
    name: id.split('::').pop()!,
    parentId: 'P::S',
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...extra,
  })
  const list = [
    el('P::S', 'occurrence', { parentId: 'P' }),
    el('P::S::a', 'part', { isReference: true }),
    el('P::S::b', 'part'),
    el('P::S::unused', 'part'),
    el('P::PartA::sent', 'eventOccurrence', { parentId: 'P::PartA' }),
    el('P::S::m1', 'message', {
      sourceId: 'P::S::a',
      targetId: 'P::S::b',
      sourceEventId: 'P::PartA::sent',
      targetEventId: 'P::PartB::received',
    }),
    el('P::S::m2', 'message', {
      sourceId: 'P::S::b',
      targetId: 'P::S::a',
      metadataKeywords: ['Reply'],
    }),
  ]
  return {
    ...base,
    view: { ...base.view, rootArtifactId: 'P::S' },
    semantic: Object.fromEntries(list.map((e) => [e.id, e])),
  }
}

describe('buildSequenceGraph under an occurrence', () => {
  it('draws parts referenced by messages as lifelines', () => {
    const { nodes, edges } = buildSequenceGraph(occurrenceFixture(), 'light')
    expect(nodes.map((n) => n.id)).toEqual(['P::S::a', 'P::S::b'])
    expect(nodes.every((n) => n.type === 'lifeline')).toBe(true)
    expect(edges.map((e) => e.id)).toEqual(['P::S::m1', 'P::S::m2'])
    expect(edges[0].source).toBe('P::S::a')
    expect(edges[0].target).toBe('P::S::b')
  })

  it('does not draw unreferenced parts', () => {
    const { nodes } = buildSequenceGraph(occurrenceFixture(), 'light')
    expect(nodes.map((n) => n.id)).not.toContain('P::S::unused')
  })

  it('applies a saved sequenceLayout keyed on part ids', () => {
    const fixture = occurrenceFixture()
    fixture.sequenceLayout = { order: ['P::S::b', 'P::S::a'], widths: { 'P::S::a': 240 } }
    const { nodes } = buildSequenceGraph(fixture, 'light')
    expect(nodes.map((n) => n.id)).toEqual(['P::S::b', 'P::S::a'])
    expect(nodes[1].style?.width).toBe(240)
  })

  it('dashes #Reply and #reply messages', () => {
    const fixture = occurrenceFixture()
    fixture.semantic['P::S::m1'].metadataKeywords = ['reply']
    const { edges } = buildSequenceGraph(fixture, 'light')
    expect(edges[0].style?.strokeDasharray).toBe('8 4')
    expect(edges[1].style?.strokeDasharray).toBe('8 4')
  })

  it('labels a message with its name only', () => {
    const { edges } = buildSequenceGraph(occurrenceFixture(), 'light')
    expect(edges[0].label).toBe('m1')
  })

  it('passes event names on edge data', () => {
    const { edges } = buildSequenceGraph(occurrenceFixture(), 'light')
    const data = edges[0].data as { sourceEvent?: string; targetEvent?: string }
    expect(data.sourceEvent).toBe('sent')
    // not in the payload: the last id segment
    expect(data.targetEvent).toBe('received')
    expect((edges[1].data as { sourceEvent?: string }).sourceEvent).toBeUndefined()
  })
})

function vizNode(id: string) {
  return {
    artifactId: id,
    x: 0,
    y: 0,
    width: 120,
    height: 48,
    symbolRef: 'default-lifeline',
    side: null,
    offset: null,
  }
}
