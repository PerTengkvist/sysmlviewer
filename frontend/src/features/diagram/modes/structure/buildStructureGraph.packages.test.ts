import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../../../api'
import { buildStructureGraph } from './buildStructureGraph'

function pkg(
  id: string,
  name: string,
  parentId: string | null,
  children: string[] = [],
): SemanticElement {
  return {
    id,
    kind: 'package',
    name,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children,
    fileId: 'f1',
  }
}

function part(
  id: string,
  name: string,
  parentId: string | null,
  children: string[] = [],
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
  }
}

function view(
  levels: number,
  semantic: Record<string, SemanticElement>,
): ViewPayload {
  return {
    view: {
      id: 'P::V',
      name: 'V',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: levels,
    semantic,
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildStructureGraph packages', () => {
  const semantic: Record<string, SemanticElement> = {
    P: pkg('P', 'P', null, ['P::Sub', 'P::Top']),
    'P::Sub': pkg('P::Sub', 'Sub', 'P', ['P::Sub::Inner']),
    'P::Sub::Inner': part('P::Sub::Inner', 'Inner', 'P::Sub'),
    'P::Top': part('P::Top', 'Top', 'P'),
  }

  it('shows package and part siblings under package root at levels=2', () => {
    const { nodes } = buildStructureGraph({
      view: view(2, semantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })
    const byId = new Map(nodes.map((n) => [n.id, n]))
    expect(byId.has('P::Sub')).toBe(true)
    expect(byId.has('P::Top')).toBe(true)
    expect(byId.get('P::Sub')?.type).toBe('part')
    expect((byId.get('P::Sub')?.data as { kind?: string }).kind).toBe('package')
    expect(byId.has('P::Sub::Inner')).toBe(false)
  })

  it('nests part under package at levels=3', () => {
    const { nodes } = buildStructureGraph({
      view: view(3, semantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })
    const inner = nodes.find((n) => n.id === 'P::Sub::Inner')
    expect(inner?.parentId).toBe('P::Sub')
    expect(inner?.type).toBe('part')
  })
})
