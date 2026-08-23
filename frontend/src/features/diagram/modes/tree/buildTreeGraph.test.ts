import { describe, expect, it } from 'vitest'
import { buildTreeGraph } from './buildTreeGraph'
import type { ViewPayload } from '../../../api'

function treeFixture(): ViewPayload {
  return {
    view: {
      id: 'P::V',
      name: 'V',
      rootArtifactId: 'P::Root',
      parentViewId: null,
      typeRef: 'TreeView',
    },
    diagramMode: 'tree',
    semantic: {
      'P::Root': {
        id: 'P::Root',
        kind: 'part',
        name: 'Root',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::Root::A', 'P::Root::B'],
        fileId: 'f',
      },
      'P::Root::A': {
        id: 'P::Root::A',
        kind: 'part',
        name: 'A',
        parentId: 'P::Root',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::Root::A::C'],
        fileId: 'f',
      },
      'P::Root::B': {
        id: 'P::Root::B',
        kind: 'part',
        name: 'B',
        parentId: 'P::Root',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::Root::A::C': {
        id: 'P::Root::A::C',
        kind: 'part',
        name: 'C',
        parentId: 'P::Root::A',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
    },
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildTreeGraph', () => {
  it('lays out containment and hides collapsed descendants', () => {
    const full = buildTreeGraph(treeFixture(), 'light', new Set(), () => {})
    expect(full.nodes.map((n) => n.id).sort()).toEqual([
      'P::Root',
      'P::Root::A',
      'P::Root::A::C',
      'P::Root::B',
    ])
    expect(full.edges).toHaveLength(3)

    const collapsed = buildTreeGraph(
      treeFixture(),
      'light',
      new Set(['P::Root::A']),
      () => {},
    )
    expect(collapsed.nodes.map((n) => n.id).sort()).toEqual([
      'P::Root',
      'P::Root::A',
      'P::Root::B',
    ])
    expect(collapsed.nodes.find((n) => n.id === 'P::Root::A::C')).toBeUndefined()
  })

  it('uses compact sizes from view payload (backend tree defaults / overlay)', () => {
    const fixture = treeFixture()
    fixture.visualization.nodes = {
      'P::Root': {
        artifactId: 'P::Root',
        x: 40,
        y: 40,
        width: 160,
        height: 40,
        symbolRef: 'default-part',
        side: null,
        offset: null,
      },
      'P::Root::A': {
        artifactId: 'P::Root::A',
        x: 40,
        y: 120,
        width: 200,
        height: 40,
        symbolRef: 'default-part',
        side: null,
        offset: null,
      },
    }
    const { nodes } = buildTreeGraph(fixture, 'light', new Set(), () => {})
    const root = nodes.find((n) => n.id === 'P::Root')!
    const a = nodes.find((n) => n.id === 'P::Root::A')!
    expect(root.style).toMatchObject({ width: 160, height: 40 })
    expect(a.style).toMatchObject({ width: 200, height: 40 })
    expect(root.position).toEqual({ x: 40, y: 40 })
  })
})
