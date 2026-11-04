import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import type { VisualizationEdge } from '../../api'
import { buildViewSnapshot } from './buildViewSnapshot'

function part(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    type: 'part',
    position: { x: 10, y: 20 },
    style: { width: 180, height: 110 },
    data: { artifactId: id, ports: [] },
    ...overrides,
  }
}

function edge(id: string, data: Record<string, unknown>): Edge {
  return { id, source: 'a', target: 'b', data: { artifactId: id, ...data } }
}

const noSaved = { edges: {} }

describe('buildViewSnapshot', () => {
  it('records position and size of each part', () => {
    const snapshot = buildViewSnapshot([part('Pkg::a')], [], noSaved)

    expect(snapshot.parts).toEqual({
      'Pkg::a': { x: 10, y: 20, width: 180, height: 110 },
    })
  })

  it('keeps the parent-relative position of a nested part', () => {
    const nested = part('Pkg::a::b', {
      parentId: 'Pkg::a',
      position: { x: 5, y: 6 },
    })

    const snapshot = buildViewSnapshot([nested], [], noSaved)

    expect(snapshot.parts['Pkg::a::b']).toMatchObject({ x: 5, y: 6 })
  })

  it('prefers the size set by a resize over the built style', () => {
    const resized = part('Pkg::a', { width: 300, height: 200 })

    const snapshot = buildViewSnapshot([resized], [], noSaved)

    expect(snapshot.parts['Pkg::a']).toMatchObject({ width: 300, height: 200 })
  })

  it('records ports from node data', () => {
    const withPort = part('Pkg::a', {
      data: {
        artifactId: 'Pkg::a',
        ports: [{ id: 'Pkg::a::p', name: 'p', side: 'left', offset: 0.25 }],
      },
    })

    const snapshot = buildViewSnapshot([withPort], [], noSaved)

    expect(snapshot.ports).toEqual({
      'Pkg::a::p': { side: 'left', offset: 0.25, labelOffset: { x: 0, y: 0 } },
    })
  })

  it('records where a port name was moved to', () => {
    const withPort = part('Pkg::a', {
      data: {
        artifactId: 'Pkg::a',
        ports: [
          {
            id: 'Pkg::a::p',
            name: 'p',
            side: 'left',
            offset: 0.25,
            labelOffset: { x: 30, y: -12 },
          },
        ],
      },
    })

    const snapshot = buildViewSnapshot([withPort], [], noSaved)

    expect(snapshot.ports['Pkg::a::p']?.labelOffset).toEqual({ x: 30, y: -12 })
  })

  it('records edge geometry but not values that only exist on screen', () => {
    const connection = edge('Pkg::c', {
      routing: 'angular',
      waypoints: [{ x: 1, y: 2, locked: true }],
      labelOffset: { x: 3, y: 4 },
      jumps: [{ x: 9, y: 9 }],
      sourceSide: 'top',
      sourceOffset: 0.2,
      targetSide: 'left',
      targetOffset: 0.8,
      sourceAnchorId: 'n1',
      targetAnchorId: 'n2',
    })

    const snapshot = buildViewSnapshot([], [connection], noSaved)

    expect(snapshot.edges).toEqual({
      'Pkg::c': {
        routing: 'angular',
        waypoints: [{ x: 1, y: 2, locked: true }],
        labelOffset: { x: 3, y: 4 },
        sourceSide: 'top',
        sourceOffset: 0.2,
        targetSide: 'left',
        targetOffset: 0.8,
        sourceAnchorId: 'n1',
        targetAnchorId: 'n2',
      },
    })
  })

  it('skips edges that are not model elements', () => {
    const treeLink: Edge = {
      id: 'tree:a->b',
      source: 'a',
      target: 'b',
      data: { selectedColor: '#000' },
    }

    expect(buildViewSnapshot([], [treeLink], noSaved).edges).toEqual({})
  })

  it('keeps saved values the canvas does not hold', () => {
    const saved: Record<string, VisualizationEdge> = {
      'Pkg::c': {
        artifactId: 'Pkg::c',
        routing: 'angular',
        waypoints: [{ x: 1, y: 2 }],
        labelOffset: { x: 5, y: 6 },
        sourceSide: 'right',
        style: null,
      },
    }
    const canvasEdge = edge('Pkg::c', { waypoints: [{ x: 7, y: 8 }] })

    const snapshot = buildViewSnapshot([], [canvasEdge], { edges: saved })

    expect(snapshot.edges['Pkg::c']).toEqual({
      routing: 'angular',
      waypoints: [{ x: 7, y: 8 }],
      labelOffset: { x: 5, y: 6 },
      sourceSide: 'right',
    })
  })

  it('uses the route on screen when it differs from the edge data', () => {
    const canvasEdge = edge('Pkg::c', {
      routing: 'angular',
      waypoints: [{ x: 1, y: 1 }],
    })
    const displayed = new Map([['Pkg::c', [{ x: 2, y: 2 }, { x: 3, y: 3 }]]])

    const snapshot = buildViewSnapshot([], [canvasEdge], noSaved, displayed)

    expect(snapshot.edges['Pkg::c'].waypoints).toEqual([
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ])
  })

  it('ignores an empty displayed route', () => {
    const canvasEdge = edge('Pkg::c', {
      routing: 'angular',
      waypoints: [{ x: 1, y: 1 }],
    })
    const displayed = new Map([['Pkg::c', []]])

    const snapshot = buildViewSnapshot([], [canvasEdge], noSaved, displayed)

    expect(snapshot.edges['Pkg::c'].waypoints).toEqual([{ x: 1, y: 1 }])
  })
})
