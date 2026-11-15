import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../../../api'
import type { PartNodeData } from '../../PartNode'
import { buildStructureGraph } from './buildStructureGraph'

function part(id: string, name: string, extra: Partial<SemanticElement> = {}): SemanticElement {
  return {
    id,
    kind: 'part',
    name,
    parentId: 'P',
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f1',
    ...extra,
  }
}

describe('buildStructureGraph abstract parts', () => {
  const semantic: Record<string, SemanticElement> = {
    P: { ...part('P', 'P'), kind: 'package', parentId: null, children: ['P::A', 'P::u', 'P::C'] },
    'P::A': part('P::A', 'A', { isAbstract: true, isDefinition: true }),
    'P::u': part('P::u', 'u', { isAbstract: true }),
    'P::C': part('P::C', 'C', { isDefinition: true }),
  }
  const view: ViewPayload = {
    view: { id: 'v', name: 'V', rootArtifactId: 'P', parentViewId: null, typeRef: 'GeneralView' },
    diagramMode: 'structure',
    hierarchicalLevels: 2,
    semantic,
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }

  it('passes abstract and definition on to the part node', () => {
    const { nodes } = buildStructureGraph({
      view,
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
      structureNotation: 'sysmlv2',
    })
    const data = (id: string) => nodes.find((n) => n.id === id)!.data as PartNodeData
    expect(data('P::A')).toMatchObject({ isAbstract: true, isDefinition: true })
    expect(data('P::u').isAbstract).toBe(true)
    expect(data('P::u').isDefinition).toBeFalsy()
    expect(data('P::C').isAbstract).toBeFalsy()
  })
})
