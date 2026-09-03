import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../api'
import {
  DEFAULT_RELATION_EDGE_STYLE,
  mergedEdgeVisual,
  pickRelationBoundarySides,
  relationEdgeLabel,
  strokeDasharray,
} from '../../relationshipStyle'

describe('relationshipStyle', () => {
  it('maps dependency to dashed open arrow', () => {
    expect(DEFAULT_RELATION_EDGE_STYLE.dependency).toEqual({
      lineStyle: 'dashed',
      markerEnd: 'openArrow',
      routing: 'direct',
    })
  })

  it('strokeDasharray returns pattern for dashed and dotted', () => {
    expect(strokeDasharray('dashed')).toBe('8 4')
    expect(strokeDasharray('dotted')).toBe('2 4')
    expect(strokeDasharray('solid')).toBeUndefined()
  })

  it('mergedEdgeVisual prefers explicit style overrides', () => {
    const merged = mergedEdgeVisual('dependency', {
      light: { lineStyle: 'solid', markerEnd: 'arrow' },
    }, 'light')
    expect(merged.lineStyle).toBe('solid')
    expect(merged.markerEnd).toBe('arrow')
  })

  it('pickRelationBoundarySides chooses facing borders', () => {
    expect(
      pickRelationBoundarySides(
        { x: 0, y: 0, width: 100, height: 80 },
        { x: 200, y: 0, width: 100, height: 80 },
      ),
    ).toEqual({ sourceSide: 'right', targetSide: 'left' })

    expect(
      pickRelationBoundarySides(
        { x: 0, y: 0, width: 100, height: 80 },
        { x: 0, y: 200, width: 100, height: 80 },
      ),
    ).toEqual({ sourceSide: 'bottom', targetSide: 'top' })
  })

  it('relationEdgeLabel uses guillemets for metadata keywords', () => {
    expect(
      relationEdgeLabel({ name: 'dep1', metadataKeywords: ['Mount'] }),
    ).toBe('«Mount»')
    expect(
      relationEdgeLabel({ name: 'dep1', metadataKeywords: ['Mount', 'Refine'] }),
    ).toBe('«Mount, Refine»')
    expect(
      relationEdgeLabel({ name: 'use', metadataKeywords: ['Mount'] }),
    ).toBe('«Mount»\nuse')
    expect(relationEdgeLabel({ name: 'uses' })).toBe('uses')
  })
})

describe('buildStructureGraph relationships', () => {
  it('builds part-boundary handles for dependency edges', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic: Record<string, SemanticElement> = {
      'P::System': {
        id: 'P::System',
        kind: 'part',
        name: 'System',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::System::logical', 'P::System::physical', 'P::System::dep1'],
        fileId: 'f1',
      },
      'P::System::logical': {
        id: 'P::System::logical',
        kind: 'part',
        name: 'logical',
        parentId: 'P::System',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f1',
      },
      'P::System::physical': {
        id: 'P::System::physical',
        kind: 'part',
        name: 'physical',
        parentId: 'P::System',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f1',
      },
      'P::System::dep1': {
        id: 'P::System::dep1',
        kind: 'dependency',
        name: 'uses',
        parentId: 'P::System',
        typeRef: null,
        sourceId: 'P::System::logical',
        targetId: 'P::System::physical',
        children: [],
        fileId: 'f1',
      },
    }

    const view: ViewPayload = {
      view: {
        id: 'v',
        name: 'V',
        rootArtifactId: 'P::System',
        parentViewId: null,
        typeRef: 'GeneralView',
      },
      diagramMode: 'whitebox',
      hierarchicalLevels: 2,
      semantic,
      visualization: {
        nodes: {
          'P::System::logical': {
            artifactId: 'P::System::logical',
            x: 40,
            y: 60,
            width: 160,
            height: 90,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
          'P::System::physical': {
            artifactId: 'P::System::physical',
            x: 260,
            y: 60,
            width: 160,
            height: 90,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
        },
        edges: {
          'P::System::dep1': {
            artifactId: 'P::System::dep1',
            routing: 'direct',
            waypoints: [],
            style: {
              light: { lineStyle: 'dashed', markerEnd: 'openArrow' },
            },
          },
        },
      },
      subdiagrams: [],
      menus: {},
    }

    const { edges } = buildStructureGraph({
      view,
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })

    const dep = edges.find((e) => e.id === 'P::System::dep1')
    expect(dep).toBeDefined()
    expect(dep?.sourceHandle).toBe('rel-src-P::System::dep1')
    expect(dep?.targetHandle).toBe('rel-tgt-P::System::dep1')
    expect(dep?.data?.relationKind).toBe('dependency')
    expect(dep?.style?.strokeDasharray).toBe('8 4')
    expect(dep?.markerEnd).toBeTruthy()
    expect(dep?.label).toBe('uses')
  })

  it('labels dependency edges with «keyword» from metadataKeywords', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic: Record<string, SemanticElement> = {
      'P::System': {
        id: 'P::System',
        kind: 'part',
        name: 'System',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::System::logical', 'P::System::physical', 'P::System::dep1'],
        fileId: 'f1',
      },
      'P::System::logical': {
        id: 'P::System::logical',
        kind: 'part',
        name: 'logical',
        parentId: 'P::System',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f1',
      },
      'P::System::physical': {
        id: 'P::System::physical',
        kind: 'part',
        name: 'physical',
        parentId: 'P::System',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f1',
      },
      'P::System::dep1': {
        id: 'P::System::dep1',
        kind: 'dependency',
        name: 'dep1',
        parentId: 'P::System',
        typeRef: null,
        sourceId: 'P::System::logical',
        targetId: 'P::System::physical',
        metadataKeywords: ['Mount'],
        children: [],
        fileId: 'f1',
      },
    }

    const view: ViewPayload = {
      view: {
        id: 'v',
        name: 'V',
        rootArtifactId: 'P::System',
        parentViewId: null,
        typeRef: 'GeneralView',
      },
      diagramMode: 'whitebox',
      hierarchicalLevels: 2,
      semantic,
      visualization: {
        nodes: {
          'P::System::logical': {
            artifactId: 'P::System::logical',
            x: 40,
            y: 60,
            width: 160,
            height: 90,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
          'P::System::physical': {
            artifactId: 'P::System::physical',
            x: 260,
            y: 60,
            width: 160,
            height: 90,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
        },
        edges: {},
      },
      subdiagrams: [],
      menus: {},
    }

    const { edges } = buildStructureGraph({
      view,
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })

    const dep = edges.find((e) => e.id === 'P::System::dep1')
    expect(dep?.label).toBe('«Mount»')
  })

  it('keeps port handles for connection edges', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic: Record<string, SemanticElement> = {
      'P::System': {
        id: 'P::System',
        kind: 'part',
        name: 'System',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::System::a', 'P::System::b', 'P::System::a::pout', 'P::System::b::pin', 'P::System::wire'],
        fileId: 'f1',
      },
      'P::System::a': {
        id: 'P::System::a',
        kind: 'part',
        name: 'a',
        parentId: 'P::System',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::System::a::pout'],
        fileId: 'f1',
      },
      'P::System::b': {
        id: 'P::System::b',
        kind: 'part',
        name: 'b',
        parentId: 'P::System',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::System::b::pin'],
        fileId: 'f1',
      },
      'P::System::a::pout': {
        id: 'P::System::a::pout',
        kind: 'port',
        name: 'pout',
        parentId: 'P::System::a',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f1',
      },
      'P::System::b::pin': {
        id: 'P::System::b::pin',
        kind: 'port',
        name: 'pin',
        parentId: 'P::System::b',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f1',
      },
      'P::System::wire': {
        id: 'P::System::wire',
        kind: 'connection',
        name: 'wire',
        parentId: 'P::System',
        typeRef: null,
        sourceId: 'P::System::a::pout',
        targetId: 'P::System::b::pin',
        children: [],
        fileId: 'f1',
      },
    }

    const view: ViewPayload = {
      view: {
        id: 'v',
        name: 'V',
        rootArtifactId: 'P::System',
        parentViewId: null,
        typeRef: 'GeneralView',
      },
      diagramMode: 'whitebox',
      hierarchicalLevels: 2,
      semantic,
      visualization: { nodes: {}, edges: {} },
      subdiagrams: [],
      menus: {},
    }

    const { edges } = buildStructureGraph({
      view,
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })

    const conn = edges.find((e) => e.id === 'P::System::wire')
    expect(conn?.sourceHandle).toBe('P::System::a::pout')
    expect(conn?.targetHandle).toBe('target:P::System::b::pin')
    expect(conn?.data?.routing).toBe('angular')
  })
})
