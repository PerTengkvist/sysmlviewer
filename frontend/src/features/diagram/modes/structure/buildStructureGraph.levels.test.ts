import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../../api'
import {
  buildStructureGraph,
  findOwnerPart,
} from './buildStructureGraph'

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

function dep(
  id: string,
  parentId: string,
  sourceId: string,
  targetId: string,
): SemanticElement {
  return {
    id,
    kind: 'dependency',
    name: 'd',
    parentId,
    typeRef: null,
    sourceId,
    targetId,
    children: [],
    fileId: 'f1',
  }
}

describe('findOwnerPart', () => {
  it('does not promote hidden nested parts to visible ancestors', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::FD1': part('P::FD1', 'FD1', 'P', ['P::FD1::F1']),
      'P::FD1::F1': part('P::FD1::F1', 'F1', 'P::FD1'),
    }
    const display = new Set(['P::FD1'])
    expect(findOwnerPart('P::FD1::F1', semantic, display)).toBeNull()
    expect(findOwnerPart('P::FD1', semantic, display)).toBe('P::FD1')
  })
})

describe('hierarchicalLevels nesting', () => {
  const nestedSemantic: Record<string, SemanticElement> = {
    'P::Defs': {
      id: 'P::Defs',
      kind: 'package',
      name: 'Defs',
      parentId: 'P',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: ['P::Defs::FD1', 'P::Defs::FD2', 'P::Defs::depFD'],
      fileId: 'f1',
    },
    'P::Defs::FD1': part('P::Defs::FD1', 'FD1', 'P::Defs', [
      'P::Defs::FD1::F1',
      'P::Defs::FD1::F2',
      'P::Defs::FD1::depF',
    ]),
    'P::Defs::FD2': part('P::Defs::FD2', 'FD2', 'P::Defs'),
    'P::Defs::FD1::F1': part('P::Defs::FD1::F1', 'F1', 'P::Defs::FD1'),
    'P::Defs::FD1::F2': part('P::Defs::FD1::F2', 'F2', 'P::Defs::FD1'),
    'P::Defs::FD1::depF': dep(
      'P::Defs::FD1::depF',
      'P::Defs::FD1',
      'P::Defs::FD1::F1',
      'P::Defs::FD1::F2',
    ),
    'P::Defs::depFD': dep(
      'P::Defs::depFD',
      'P::Defs',
      'P::Defs::FD1',
      'P::Defs::FD2',
    ),
  }

  const baseView = (
    levels: number,
    semantic: Record<string, SemanticElement>,
  ): ViewPayload => ({
    view: {
      id: 'v',
      name: 'V',
      rootArtifactId: 'P::Defs',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: levels,
    semantic,
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  })

  it('levels=2 shows FD blackboxes without nested F parts or their deps', () => {
    const semantic = {
      'P::Defs': nestedSemantic['P::Defs'],
      'P::Defs::FD1': part('P::Defs::FD1', 'FD1', 'P::Defs'),
      'P::Defs::FD2': nestedSemantic['P::Defs::FD2'],
      'P::Defs::depFD': nestedSemantic['P::Defs::depFD'],
    }
    const { nodes, edges } = buildStructureGraph({
      view: baseView(2, semantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
      structureNotation: 'sysmlv2',
    })
    expect(nodes.map((n) => n.id).sort()).toEqual([
      'P::Defs::FD1',
      'P::Defs::FD2',
    ])
    expect(edges.map((e) => e.id)).toEqual(['P::Defs::depFD'])
  })

  it('levels=3 nests F parts and shows their dependencies', () => {
    const { nodes, edges } = buildStructureGraph({
      view: baseView(3, nestedSemantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
      structureNotation: 'sysmlv2',
    })
    expect(nodes.find((n) => n.id === 'P::Defs::FD1::F1')?.parentId).toBe(
      'P::Defs::FD1',
    )
    expect(nodes.find((n) => n.id === 'P::Defs::FD1')?.parentId).toBeUndefined()
    const ids = edges.map((e) => e.id).sort()
    expect(ids).toContain('P::Defs::depFD')
    expect(ids).toContain('P::Defs::FD1::depF')
  })
})
