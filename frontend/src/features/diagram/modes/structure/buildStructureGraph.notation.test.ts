import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../../api'
import {
  FILLED_DIAMOND_MARKER_ID,
  HOLLOW_DIAMOND_MARKER_ID,
} from '../../EdgeMarkerDefs'
import { reactFlowMarker } from '../../elementStyle'
import { orientRelationBoundaryHandles } from './buildStructureGraph'

function part(
  id: string,
  name: string,
  parentId: string | null,
  children: string[] = [],
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind: 'part',
    name,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children,
    fileId: 'f1',
    isReference: false,
    ...extra,
  }
}

function baseOpts(view: ViewPayload, structureNotation?: 'sysmlv2' | 'arcadia') {
  return {
    view,
    onOpenView: () => {},
    onPortMoved: () => {},
    portMoveMode: false,
    showAttributes: false,
    viewMode: 'light' as const,
    onWaypointsChange: () => {},
    onLabelOffsetChange: () => {},
    structureNotation,
  }
}

describe('reactFlowMarker diamonds', () => {
  it('maps hollow and filled diamonds to custom SVG marker ids', () => {
    expect(reactFlowMarker('hollowDiamond')).toBe(HOLLOW_DIAMOND_MARKER_ID)
    expect(reactFlowMarker('filledDiamond')).toBe(FILLED_DIAMOND_MARKER_ID)
  })
})

describe('structureNotation and ref visuals', () => {
  const semantic: Record<string, SemanticElement> = {
    'P::System': part('P::System', 'System', 'P', [
      'P::System::child',
      'P::System::shared',
      'P::System::subset1',
    ]),
    'P::System::child': part('P::System::child', 'child', 'P::System'),
    'P::System::shared': part('P::System::shared', 'shared', 'P::System', [], {
      isReference: true,
      typeRef: 'T',
    }),
    'P::Other::feat': part('P::Other::feat', 'feat', 'P::Other'),
    'P::System::subset1': {
      id: 'P::System::subset1',
      kind: 'subsetting',
      name: 'shared_subsets_feat',
      parentId: 'P::System',
      typeRef: null,
      sourceId: 'P::System::shared',
      targetId: 'P::Other::feat',
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
    semantic: {
      ...semantic,
      'P::Other': part('P::Other', 'Other', 'P', ['P::Other::feat']),
    },
    visualization: {
      nodes: {
        'P::System::child': {
          artifactId: 'P::System::child',
          x: 40,
          y: 60,
          width: 160,
          height: 90,
          symbolRef: 'part',
          side: null,
          offset: null,
        },
        'P::System::shared': {
          artifactId: 'P::System::shared',
          x: 240,
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

  it('sysmlv2 keeps nesting and marks ref parts', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const { nodes } = buildStructureGraph(baseOpts(view, 'sysmlv2'))
    const child = nodes.find((n) => n.id === 'P::System::child')
    const shared = nodes.find((n) => n.id === 'P::System::shared')
    expect(child?.parentId).toBe('P::System')
    expect(shared?.data?.isReference).toBe(true)
  })

  it('structureNotation default sysmlv2 keeps nesting', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const { nodes } = buildStructureGraph(baseOpts(view))
    expect(nodes.find((n) => n.id === 'P::System::child')?.parentId).toBe(
      'P::System',
    )
  })

  it('arcadia flattens nested part to composition edge', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const { nodes, edges } = buildStructureGraph(baseOpts(view, 'arcadia'))
    const child = nodes.find((n) => n.id === 'P::System::child')
    expect(child?.parentId).toBeUndefined()
    const comp = edges.find((e) =>
      String(e.id).startsWith('viz::composition::'),
    )
    expect(comp).toBeDefined()
    expect(comp?.source).toBe('P::System')
    expect(comp?.target).toBe('P::System::child')
    expect(comp?.data?.markerStartKind).toBe('filledDiamond')
    expect(comp?.markerStart).toBe(FILLED_DIAMOND_MARKER_ID)
  })

  it('arcadia ref uses hollow diamond', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    // Include Other::feat as peer so subsetting can resolve; also test ref composition
    const flatView: ViewPayload = {
      ...view,
      diagramMode: 'structure',
      semantic: {
        'P::Root': part('P::Root', 'Root', 'P', [
          'P::System',
          'P::Other',
          'P::System::shared',
          'P::System::child',
          'P::Other::feat',
          'P::System::subset1',
        ]),
        'P::System': part('P::System', 'System', 'P::Root', [
          'P::System::child',
          'P::System::shared',
          'P::System::subset1',
        ]),
        'P::System::child': part('P::System::child', 'child', 'P::System'),
        'P::System::shared': part('P::System::shared', 'shared', 'P::System', [], {
          isReference: true,
        }),
        'P::Other': part('P::Other', 'Other', 'P::Root', ['P::Other::feat']),
        'P::Other::feat': part('P::Other::feat', 'feat', 'P::Other'),
        'P::System::subset1': {
          id: 'P::System::subset1',
          kind: 'subsetting',
          name: 's',
          parentId: 'P::System',
          typeRef: null,
          sourceId: 'P::System::shared',
          targetId: 'P::Other::feat',
          children: [],
          fileId: 'f1',
        },
      },
      view: {
        id: 'v',
        name: 'V',
        rootArtifactId: 'P::Root',
        parentViewId: null,
        typeRef: 'GeneralView',
      },
      visualization: { nodes: {}, edges: {} },
    }
    const { edges } = buildStructureGraph(baseOpts(flatView, 'arcadia'))
    const agg = edges.find(
      (e) =>
        e.id === 'P::System::subset1' ||
        (e.data?.relationKind === 'subsetting' &&
          e.data?.markerStartKind === 'hollowDiamond'),
    )
    expect(agg).toBeDefined()
    expect(agg?.data?.markerStartKind).toBe('hollowDiamond')
    expect(agg?.markerStart).toBe(HOLLOW_DIAMOND_MARKER_ID)
  })

  it('uses persisted relation side/offset handles', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const depView: ViewPayload = {
      view: {
        id: 'v',
        name: 'V',
        rootArtifactId: 'P::System',
        parentViewId: null,
        typeRef: 'GeneralView',
      },
      diagramMode: 'whitebox',
      hierarchicalLevels: 2,
      semantic: {
        'P::System': part('P::System', 'System', 'P', [
          'P::System::a',
          'P::System::b',
          'P::System::dep1',
        ]),
        'P::System::a': part('P::System::a', 'a', 'P::System'),
        'P::System::b': part('P::System::b', 'b', 'P::System'),
        'P::System::dep1': {
          id: 'P::System::dep1',
          kind: 'dependency',
          name: 'uses',
          parentId: 'P::System',
          typeRef: null,
          sourceId: 'P::System::a',
          targetId: 'P::System::b',
          children: [],
          fileId: 'f1',
        },
      },
      visualization: {
        nodes: {
          'P::System::a': {
            artifactId: 'P::System::a',
            x: 40,
            y: 60,
            width: 100,
            height: 80,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
          'P::System::b': {
            artifactId: 'P::System::b',
            x: 260,
            y: 60,
            width: 100,
            height: 80,
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
            sourceSide: 'top',
            sourceOffset: 0.2,
            targetSide: 'bottom',
            targetOffset: 0.7,
          },
        },
      },
      subdiagrams: [],
      menus: {},
    }
    const { edges, nodes } = buildStructureGraph(baseOpts(depView))
    const dep = edges.find((e) => e.id === 'P::System::dep1')
    expect(dep?.sourceHandle).toBe('rel-src-P::System::dep1')
    expect(dep?.targetHandle).toBe('rel-tgt-P::System::dep1')
    expect(dep?.data?.sourceOffset).toBe(0.2)
    expect(dep?.data?.targetOffset).toBe(0.7)
    expect(dep?.data?.manualAttachment).toBe(true)
    const a = nodes.find((n) => n.id === 'P::System::a')
    const handles = (
      a?.data as {
        relationHandles?: { id: string; side: string; offset: number }[]
      }
    )?.relationHandles
    expect(
      handles?.some(
        (h) =>
          h.id === 'rel-src-P::System::dep1' &&
          h.side === 'top' &&
          h.offset === 0.2,
      ),
    ).toBe(true)
  })

  it('keeps single persisted source side/offset as manual', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const depView: ViewPayload = {
      view: {
        id: 'v',
        name: 'V',
        rootArtifactId: 'P::System',
        parentViewId: null,
        typeRef: 'GeneralView',
      },
      diagramMode: 'whitebox',
      hierarchicalLevels: 2,
      semantic: {
        'P::System': part('P::System', 'System', 'P', [
          'P::System::a',
          'P::System::b',
          'P::System::dep1',
        ]),
        'P::System::a': part('P::System::a', 'a', 'P::System'),
        'P::System::b': part('P::System::b', 'b', 'P::System'),
        'P::System::dep1': {
          id: 'P::System::dep1',
          kind: 'dependency',
          name: 'uses',
          parentId: 'P::System',
          typeRef: null,
          sourceId: 'P::System::a',
          targetId: 'P::System::b',
          children: [],
          fileId: 'f1',
        },
      },
      visualization: {
        nodes: {
          'P::System::a': {
            artifactId: 'P::System::a',
            x: 40,
            y: 60,
            width: 100,
            height: 80,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
          'P::System::b': {
            artifactId: 'P::System::b',
            x: 260,
            y: 60,
            width: 100,
            height: 80,
            symbolRef: 'part',
            side: null,
            offset: null,
          },
        },
        edges: {
          'P::System::dep1': {
            artifactId: 'P::System::dep1',
            routing: 'angular',
            waypoints: [],
            sourceSide: 'bottom',
            sourceOffset: 0.33,
          },
        },
      },
      subdiagrams: [],
      menus: {},
    }
    const { edges } = buildStructureGraph(baseOpts(depView))
    const dep = edges.find((e) => e.id === 'P::System::dep1')
    expect(dep?.data?.manualAttachment).toBe(true)
    expect(dep?.data?.sourceSide).toBe('bottom')
    expect(dep?.data?.sourceOffset).toBe(0.33)
    expect(dep?.data?.routing).toBe('angular')
  })

  it('absoluteNodeOrigin walks nested parent positions', async () => {
    const { absoluteNodeOrigin } = await import('./buildStructureGraph')
    const parent = {
      id: 'root',
      position: { x: 100, y: 50 },
      data: {},
    }
    const child = {
      id: 'child',
      parentId: 'root',
      position: { x: 20, y: 30 },
      data: {},
    }
    const byId = new Map<string, typeof parent | typeof child>([
      ['root', parent],
      ['child', child],
    ])
    expect(absoluteNodeOrigin(child as never, byId as never)).toEqual({
      x: 120,
      y: 80,
    })
  })

  it('orient skips manual relation attachment', () => {
    const nodes = [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        data: {},
        style: { width: 100, height: 80 },
      },
      {
        id: 'b',
        position: { x: 200, y: 0 },
        data: {},
        style: { width: 100, height: 80 },
      },
    ]
    const edges = [
      {
        id: 'dep',
        source: 'a',
        target: 'b',
        sourceHandle: 'rel-src-dep',
        targetHandle: 'rel-tgt-dep',
        data: {
          manualAttachment: true,
          sourceSide: 'top',
          targetSide: 'bottom',
          sourceOffset: 0.2,
          targetOffset: 0.8,
        },
      },
    ]
    const next = orientRelationBoundaryHandles(edges as never, nodes as never)
    expect(next[0].sourceHandle).toBe('rel-src-dep')
    expect(next[0].data).toMatchObject({
      manualAttachment: true,
      sourceSide: 'top',
      targetSide: 'bottom',
    })
  })
})
