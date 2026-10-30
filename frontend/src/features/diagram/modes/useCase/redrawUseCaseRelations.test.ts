import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { ViewPayload } from '../../../../api'
import { buildUseCaseGraph } from './buildUseCaseGraph'
import { redrawUseCaseRelations } from './redrawUseCaseRelations'

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
    visualization: {
      nodes: {
        'P::Login': {
          artifactId: 'P::Login',
          x: 100,
          y: 100,
          width: 168,
          height: 72,
          symbolRef: 'default',
          side: null,
          offset: null,
        },
        'P::Auth': {
          artifactId: 'P::Auth',
          x: 400,
          y: 100,
          width: 168,
          height: 72,
          symbolRef: 'default',
          side: null,
          offset: null,
        },
        'P::a': {
          artifactId: 'P::a',
          x: 400,
          y: 250,
          width: 88,
          height: 108,
          symbolRef: 'default',
          side: null,
          offset: null,
        },
      },
      edges: {},
    },
    subdiagrams: [],
    menus: {},
  }
}

type EdgeData = {
  routing?: string
  waypoints?: { x: number; y: number }[]
  sourceSide?: string
  targetSide?: string
  sourceOffset?: number
  targetOffset?: number
  sourceAnchorId?: string
  targetAnchorId?: string
  relationKind?: string
}

function corruptRelations(nodes: Node[], edges: Edge[]): Edge[] {
  return edges.map((e) => {
    if (e.id === 'P::inc1' || e.id === 'P::ext1') {
      return {
        ...e,
        sourceHandle: 'rel:stale',
        targetHandle: 'target:rel:stale',
        data: {
          ...(e.data as object),
          sourceSide: 'top',
          targetSide: 'bottom',
          sourceOffset: 0.2,
          targetOffset: 0.8,
          sourceAnchorId: 'rel:stale',
          targetAnchorId: 'rel:stale',
          waypoints: [{ x: 10, y: 20 }],
        },
      }
    }
    if (e.id.startsWith('use:')) {
      return {
        ...e,
        sourceHandle: 'out',
        targetHandle: 'target:rel:stale',
        data: {
          ...(e.data as object),
          targetSide: 'bottom',
          targetOffset: 0.9,
          targetAnchorId: 'rel:stale',
          waypoints: [{ x: 1, y: 2 }],
        },
      }
    }
    return e
  })
}

describe('redrawUseCaseRelations', () => {
  it('full redraw resets include facing sides and clears waypoints; nodes stay put', () => {
    const { nodes, edges: built } = buildUseCaseGraph(fixture(), 'light')
    const edges = corruptRelations(nodes, built)
    const loginBefore = nodes.find((n) => n.id === 'P::Login')!.position
    const authBefore = nodes.find((n) => n.id === 'P::Auth')!.position

    const { edges: next, edgePatch, nodePatch } = redrawUseCaseRelations(
      nodes,
      edges,
    )

    expect(nodes.find((n) => n.id === 'P::Login')!.position).toEqual(loginBefore)
    expect(nodes.find((n) => n.id === 'P::Auth')!.position).toEqual(authBefore)

    const inc = next.find((e) => e.id === 'P::inc1')!
    const data = (inc.data || {}) as EdgeData
    expect(data.sourceSide).toBe('right')
    expect(data.targetSide).toBe('left')
    expect(data.sourceAnchorId).toBe('rel:P::inc1')
    expect(data.targetAnchorId).toBe('rel:P::inc1')
    expect(inc.sourceHandle).toBe('rel:P::inc1')
    expect(inc.targetHandle).toBe('target:rel:P::inc1')
    expect(data.waypoints).toEqual([])
    expect(edgePatch['P::inc1']).toMatchObject({
      artifactId: 'P::inc1',
      sourceSide: 'right',
      targetSide: 'left',
      sourceAnchorId: 'rel:P::inc1',
      targetAnchorId: 'rel:P::inc1',
      waypoints: [],
    })
    expect(nodePatch['P::Login']?.anchors).toBeDefined()
  })

  it('full redraw moves actor use line off hard-coded out; sourceHandle is rel id', () => {
    const { nodes, edges: built } = buildUseCaseGraph(fixture(), 'light')
    const edges = corruptRelations(nodes, built)

    const { edges: next, edgePatch, nodes: nextNodes } = redrawUseCaseRelations(
      nodes,
      edges,
    )

    const ext = next.find((e) => e.id === 'P::ext1')!
    const extData = (ext.data || {}) as EdgeData
    expect(extData.sourceSide).toBe('left')
    expect(extData.targetSide).toBe('right')
    expect(extData.waypoints).toEqual([])
    expect(edgePatch['P::ext1']).toBeDefined()

    const use = next.find((e) => e.id === 'use:P::a->P::Login')!
    expect(use.sourceHandle).toBe('rel:use:P::a->P::Login')
    expect(use.sourceHandle).not.toBe('out')
    const useData = (use.data || {}) as EdgeData
    expect(useData.sourceSide).toBe('left')
    expect(use.targetHandle).toBe('target:rel:use:P::a->P::Login')
    expect(edgePatch['use:P::a->P::Login']).toBeDefined()

    const actorAnchors = (
      nextNodes.find((n) => n.id === 'P::a')!.data as {
        anchors?: { side: string }[]
      }
    ).anchors!
    expect(actorAnchors.some((a) => a.side === 'left')).toBe(true)
  })

  it('onlyId redraws that relation and leaves others alone', () => {
    const { nodes, edges: built } = buildUseCaseGraph(fixture(), 'light')
    const edges = corruptRelations(nodes, built)

    const { edges: next, edgePatch } = redrawUseCaseRelations(nodes, edges, {
      onlyId: 'P::inc1',
    })

    const inc = next.find((e) => e.id === 'P::inc1')!
    expect(((inc.data || {}) as EdgeData).sourceSide).toBe('right')
    expect(((inc.data || {}) as EdgeData).waypoints).toEqual([])
    expect(edgePatch['P::inc1']).toBeDefined()

    const ext = next.find((e) => e.id === 'P::ext1')!
    const extData = (ext.data || {}) as EdgeData
    expect(extData.sourceSide).toBe('top')
    expect(extData.waypoints).toEqual([{ x: 10, y: 20 }])
    expect(edgePatch['P::ext1']).toBeUndefined()
  })

  it('unknown onlyId returns same edges and empty patch', () => {
    const { nodes, edges: built } = buildUseCaseGraph(fixture(), 'light')
    const edges = corruptRelations(nodes, built)

    const { edges: next, edgePatch, nodePatch } = redrawUseCaseRelations(
      nodes,
      edges,
      { onlyId: 'missing' },
    )

    expect(next).toBe(edges)
    expect(edgePatch).toEqual({})
    expect(nodePatch).toEqual({})
  })

  it('ignores non-relation edges', () => {
    const { nodes, edges: built } = buildUseCaseGraph(fixture(), 'light')
    const noise: Edge = {
      id: 'noise',
      source: 'P::Login',
      target: 'P::Auth',
      sourceHandle: 'a-left',
      targetHandle: 'target:a-right',
      type: 'straight',
      data: {
        sourceSide: 'left',
        targetSide: 'right',
        waypoints: [{ x: 9, y: 9 }],
      },
    }
    const edges = [...corruptRelations(nodes, built), noise]

    const { edges: next, edgePatch } = redrawUseCaseRelations(nodes, edges)

    const kept = next.find((e) => e.id === 'noise')!
    expect(((kept.data || {}) as EdgeData).waypoints).toEqual([{ x: 9, y: 9 }])
    expect(edgePatch.noise).toBeUndefined()
  })
})
