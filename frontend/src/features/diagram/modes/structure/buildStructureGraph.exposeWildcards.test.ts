import { describe, expect, it } from 'vitest'
import { buildStructureGraph } from './buildStructureGraph'
import type { SemanticElement, ViewPayload } from '../../../../api'

/**
 * Payloads the backend sends for `expose P::*;` (P's direct members, P not
 * in the payload) and `expose P::**;` (P and every level, with
 * hierarchicalLevels set to the depth of the tree).
 */

function el(
  id: string,
  kind: string,
  parentId: string | null,
  children: string[] = [],
): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop() || id,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children,
    fileId: 'f',
  } as SemanticElement
}

function payload(
  rootId: string,
  semantic: SemanticElement[],
  opts: Partial<ViewPayload> = {},
): ViewPayload {
  return {
    view: {
      id: 'Pkg::V',
      name: 'V',
      rootArtifactId: rootId,
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: 2,
    semantic: Object.fromEntries(semantic.map((e) => [e.id, e])),
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
    ...opts,
  } as ViewPayload
}

function build(view: ViewPayload) {
  return buildStructureGraph({
    view,
    onOpenView: () => {},
    onPortMoved: () => {},
    portMoveMode: false,
    showAttributes: false,
    viewMode: 'light',
    onWaypointsChange: () => {},
    onLabelOffsetChange: () => {},
  })
}

describe('views with a wildcard expose', () => {
  it('P::* draws the members as top-level nodes, without P', () => {
    const { nodes } = build(
      payload(
        'P',
        [el('P::A', 'part', 'P'), el('P::B', 'part', 'P'), el('P::C', 'package', 'P')],
        { exposeKinds: { P: 'members' }, exposeControlsDepth: true },
      ),
    )
    expect(nodes.map((n) => n.id).sort()).toEqual(['P::A', 'P::B', 'P::C'])
    expect(nodes.every((n) => !n.parentId)).toBe(true)
  })

  it('P::** nests every level the payload holds', () => {
    const { nodes } = build(
      payload(
        'P',
        [
          el('P', 'package', null, ['P::A']),
          el('P::A', 'part', 'P', ['P::A::b']),
          el('P::A::b', 'part', 'P::A', ['P::A::b::c']),
          el('P::A::b::c', 'part', 'P::A::b'),
        ],
        {
          hierarchicalLevels: 4,
          exposeKinds: { P: 'recursive' },
          exposeControlsDepth: true,
        },
      ),
    )
    const parent = new Map(nodes.map((n) => [n.id, n.parentId]))
    expect(parent.get('P::A::b')).toBe('P::A')
    expect(parent.get('P::A::b::c')).toBe('P::A::b')
  })

  it('members of a part draw no frame', () => {
    const { nodes } = build(
      payload(
        'Car',
        [el('Car::engine', 'part', 'Car'), el('Car::wheel', 'part', 'Car')],
        { exposeKinds: { Car: 'members' }, exposeControlsDepth: true },
      ),
    )
    expect(nodes.map((n) => n.id).sort()).toEqual(['Car::engine', 'Car::wheel'])
    expect(
      nodes.some((n) => (n.data as { isBoundary?: boolean }).isBoundary),
    ).toBe(false)
  })
})
