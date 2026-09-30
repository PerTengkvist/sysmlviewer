import { describe, expect, it } from 'vitest'
import { buildUseCaseGraph } from './buildUseCaseGraph'
import type { ViewPayload } from '../../../../api'

function fixture(): ViewPayload {
  return {
    view: {
      id: 'P::V',
      name: 'UC',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'UseCaseView',
    },
    diagramMode: 'useCase',
    semantic: {
      P: {
        id: 'P',
        kind: 'package',
        name: 'P',
        parentId: null,
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::Login', 'P::Auth', 'P::a', 'P::inc1'],
        fileId: 'f',
      },
      'P::Login': {
        id: 'P::Login',
        kind: 'useCase',
        name: 'Login',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::Auth': {
        id: 'P::Auth',
        kind: 'useCase',
        name: 'Auth',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::a': {
        id: 'P::a',
        kind: 'actor',
        name: 'Driver',
        parentId: 'P::Login',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::inc1': {
        id: 'P::inc1',
        kind: 'include',
        name: 'inc1',
        parentId: 'P::Login',
        typeRef: null,
        sourceId: 'P::Login',
        targetId: 'P::Auth',
        children: [],
        fileId: 'f',
      },
      'P::ext1': {
        id: 'P::ext1',
        kind: 'dependency',
        name: 'ext1',
        parentId: 'P',
        typeRef: null,
        sourceId: 'P::Auth',
        targetId: 'P::Login',
        children: [],
        fileId: 'f',
        metadataKeywords: ['extend'],
      },
    },
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildUseCaseGraph', () => {
  it('places use cases, actors, include and extend edges', () => {
    const { nodes, edges } = buildUseCaseGraph(fixture(), 'light')
    expect(nodes.some((n) => n.type === 'useCase')).toBe(true)
    const actor = nodes.find((n) => n.id === 'P::a')
    expect(actor?.type).toBe('actor')
    expect(edges.some((e) => e.id === 'P::inc1')).toBe(true)
    expect(edges.some((e) => e.label === '«include»')).toBe(true)
    expect(edges.some((e) => e.label === '«extend»')).toBe(true)
    expect(edges.some((e) => e.id === 'use:P::a->P::Login')).toBe(true)
    const inc = edges.find((e) => e.id === 'P::inc1')
    expect(inc?.type).toBe('sysml')
    expect((inc?.data as { routing?: string }).routing).toBe('direct')
    expect(inc?.sourceHandle).toBe('a-bottom')
    expect(inc?.targetHandle).toBe('target:a-top')
    const uc = nodes.find((n) => n.type === 'useCase')
    expect((uc?.data as { anchors?: unknown[] }).anchors).toHaveLength(4)
  })

  it('draws one stick-figure actor and a use line to each case it takes part in', () => {
    const view = fixture()
    view.semantic['P::b'] = {
      id: 'P::b',
      kind: 'actor',
      name: 'Driver',
      parentId: 'P::Auth',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f',
    }
    const { nodes, edges } = buildUseCaseGraph(view, 'light')
    const drivers = nodes.filter((n) => n.type === 'actor')
    expect(drivers).toHaveLength(1)
    expect(edges.filter((e) => e.id.startsWith('use:'))).toHaveLength(2)
  })

  it('ignores one shared global coordinate and separates the use cases', () => {
    const view = fixture()
    view.semantic.P.children = [...(view.semantic.P.children || []), 'P::vehicle']
    view.semantic['P::vehicle'] = {
      id: 'P::vehicle',
      kind: 'part',
      name: 'vehicle',
      parentId: 'P',
      typeRef: 'Car',
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f',
      metadataKeywords: ['subject'],
    }
    for (const id of Object.keys(view.semantic)) {
      view.visualization.nodes[id] = {
        artifactId: id,
        x: 80,
        y: 2600,
        width: 200,
        height: 120,
        symbolRef: 'default',
        side: null,
        offset: null,
      }
    }
    const { nodes } = buildUseCaseGraph(view, 'light')
    const login = nodes.find((n) => n.id === 'P::Login')!
    const auth = nodes.find((n) => n.id === 'P::Auth')!
    expect(login.position).not.toEqual(auth.position)
    expect(nodes.find((n) => n.id === 'P::a')?.type).toBe('actor')
  })

  it('keeps a saved position that is negative or far from the origin', () => {
    const view = fixture()
    view.visualization.nodes['P::Login'] = {
      artifactId: 'P::Login',
      x: -80,
      y: 2400,
      width: 168,
      height: 72,
      symbolRef: 'default',
      side: null,
      offset: null,
    }
    view.visualization.nodes['P::Auth'] = {
      artifactId: 'P::Auth',
      x: 400,
      y: 80,
      width: 168,
      height: 72,
      symbolRef: 'default',
      side: null,
      offset: null,
    }
    const { nodes } = buildUseCaseGraph(view, 'light')
    expect(nodes.find((n) => n.id === 'P::Login')?.position).toEqual({ x: -80, y: 2400 })
  })
})
