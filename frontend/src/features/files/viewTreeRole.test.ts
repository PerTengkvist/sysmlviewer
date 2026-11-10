import { describe, expect, it } from 'vitest'

import type { Project, SemanticElement } from '../../api'
import { packageDiagramId, viewTreeRole } from './viewTreeRole'

function element(id: string, extra: Partial<SemanticElement> = {}): SemanticElement {
  return {
    id,
    kind: 'view',
    name: id.split('::').pop()!,
    parentId: 'P',
    typeRef: 'GeneralView',
    sourceId: null,
    targetId: null,
    children: [],
    ...extra,
  } as SemanticElement
}

describe('viewTreeRole', () => {
  const diagrams = new Set(['P::carView', 'P::Old'])

  it('opens views that are diagrams', () => {
    expect(viewTreeRole(element('P::carView'), diagrams)).toEqual({
      opensDiagram: true,
      kindLabel: 'view',
    })
  })

  it('keeps an old view def that is a diagram openable', () => {
    expect(viewTreeRole(element('P::Old', { isDefinition: true }), diagrams)).toEqual({
      opensDiagram: true,
      kindLabel: 'view def',
    })
  })

  it('shows a view def that a usage refers to as an element', () => {
    expect(
      viewTreeRole(element('P::CarViewDef', { isDefinition: true }), diagrams),
    ).toEqual({ opensDiagram: false, kindLabel: 'view def' })
  })

  it('leaves other kinds alone', () => {
    expect(viewTreeRole(element('P::a', { kind: 'part' }), diagrams)).toEqual({
      opensDiagram: false,
      kindLabel: 'part',
    })
  })
})

describe('packageDiagramId', () => {
  const project = {
    semantic: {
      P: element('P', { kind: 'package', parentId: null }),
      'P::CarViewDef': element('P::CarViewDef', { isDefinition: true }),
      'P::carView': element('P::carView', { typeRef: 'CarViewDef' }),
      'P::seq': element('P::seq', { typeRef: 'SeqDef' }),
    },
    views: [
      { id: 'P::seq', name: 'seq', rootArtifactId: 'P', parentViewId: null, typeRef: 'SequenceView' },
      { id: 'P::carView', name: 'carView', rootArtifactId: 'P', parentViewId: null, typeRef: 'GeneralView' },
    ],
  } as unknown as Project

  it('opens the general diagram of the package, not a definition', () => {
    expect(packageDiagramId(project, 'P')).toBe('P::carView')
  })

  it('has nothing for a package without a general diagram', () => {
    expect(packageDiagramId(project, 'Q')).toBeNull()
  })
})
