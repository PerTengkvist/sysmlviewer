import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  elementTypeLabel,
  relatedElementLabel,
  elementDisplayName,
  elementRelations,
  featureLabel,
  featureTargets,
  occurrencePath,
  owningOccurrenceId,
  relationLabel,
  requirementUseCaseLinks,
  useCaseRequirementLinks,
} from './elementRelations'

function el(
  id: string,
  kind: SemanticElement['kind'],
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop()!,
    parentId: null,
    children: [],
    metadataKeywords: [],
    ...extra,
  } as SemanticElement
}

function model(...els: SemanticElement[]): Record<string, SemanticElement> {
  return Object.fromEntries(els.map((e) => [e.id, e]))
}

// Mirrors what the parser produces for the electric car use cases.
const semantic = model(
  el('UC::Start', 'useCase', { parentId: 'UC' }),
  el('UC::Stop', 'useCase', { parentId: 'UC' }),
  el('UC::Drive', 'useCase', { parentId: 'UC' }),
  el('R::PowerModes', 'requirement', { shortId: 'REQ-PERF-06' }),
  el('R::DriveToDest', 'requirement', { shortId: 'US-DRIVE-01' }),
  el('R::Derived', 'requirement'),
  el('UC::Start::objective_1', 'dependency', {
    parentId: 'UC::Start',
    sourceId: 'UC::Start',
    targetId: 'R::PowerModes',
    metadataKeywords: ['objective'],
  }),
  el('UC::dep2', 'dependency', {
    parentId: 'UC',
    sourceId: 'UC::Start',
    targetId: 'R::DriveToDest',
    metadataKeywords: ['refine'],
  }),
  el('UC::dep3', 'dependency', {
    parentId: 'UC',
    sourceId: 'UC::Stop',
    targetId: 'UC::Start',
    metadataKeywords: ['extend'],
  }),
  el('UC::include_Start', 'include', {
    parentId: 'UC::Drive',
    sourceId: 'UC::Drive',
    targetId: 'UC::Start',
  }),
  el('R::derive1', 'dependency', {
    sourceId: 'R::Derived',
    targetId: 'R::PowerModes',
    metadataKeywords: ['derive'],
  }),
  el('UC::satisfy1', 'satisfy', {
    sourceId: 'UC::Drive',
    targetId: 'R::DriveToDest',
  }),
  el('UC::Drive::inner', 'requirement', { parentId: 'UC::Drive' }),
)

describe('relationLabel', () => {
  it('uses the metadata keyword, else the relation kind', () => {
    expect(relationLabel(semantic['UC::dep2']!)).toBe('refine')
    expect(relationLabel(semantic['UC::Start::objective_1']!)).toBe('objective')
    expect(relationLabel(semantic['UC::satisfy1']!)).toBe('satisfy')
    expect(relationLabel(semantic['UC::include_Start']!)).toBe('include')
  })
})

describe('elementRelations', () => {
  it('lists outgoing and incoming relations with the far end', () => {
    const rels = elementRelations(semantic, 'UC::Start')
    const summary = rels.map((r) => `${r.direction} ${r.label} ${r.otherId}`)
    expect(summary).toEqual([
      'out objective R::PowerModes',
      'out refine R::DriveToDest',
      'in extend UC::Stop',
      'in include UC::Drive',
    ])
  })

  it('shows a requirement which use cases and requirements point at it', () => {
    const rels = elementRelations(semantic, 'R::PowerModes')
    expect(rels.map((r) => `${r.direction} ${r.label} ${r.otherId}`)).toEqual([
      'in derive R::Derived',
      'in objective UC::Start',
    ])
  })

  it('keeps owned relations between other elements', () => {
    const parts = model(
      el('P', 'part', { children: ['P::a', 'P::b', 'P::c1'] }),
      el('P::a', 'part', { parentId: 'P' }),
      el('P::b', 'part', { parentId: 'P' }),
      el('P::c1', 'connection', {
        parentId: 'P',
        sourceId: 'P::a',
        targetId: 'P::b',
      }),
    )
    const rels = elementRelations(parts, 'P')
    expect(rels).toHaveLength(1)
    expect(rels[0]).toMatchObject({
      direction: 'owned',
      label: 'connection',
      sourceId: 'P::a',
      targetId: 'P::b',
      otherId: null,
    })
  })
})

describe('useCaseRequirementLinks', () => {
  it('collects objective and refine targets', () => {
    expect(useCaseRequirementLinks(semantic, 'UC::Start')).toEqual([
      { requirementId: 'R::PowerModes', label: 'objective' },
      { requirementId: 'R::DriveToDest', label: 'refine' },
    ])
  })

  it('collects satisfy targets and requirements owned by the use case', () => {
    expect(useCaseRequirementLinks(semantic, 'UC::Drive')).toEqual([
      { requirementId: 'R::DriveToDest', label: 'satisfy' },
      { requirementId: 'UC::Drive::inner', label: 'requirement' },
    ])
  })

  it('is empty for a use case without requirement links', () => {
    expect(useCaseRequirementLinks(semantic, 'UC::Stop')).toEqual([])
  })
})

describe('requirementUseCaseLinks', () => {
  it('lists the use cases that trace to a requirement', () => {
    expect(requirementUseCaseLinks(semantic, 'R::DriveToDest')).toEqual([
      { useCaseId: 'UC::Drive', label: 'satisfy' },
      { useCaseId: 'UC::Start', label: 'refine' },
    ])
    expect(requirementUseCaseLinks(semantic, 'R::PowerModes')).toEqual([
      { useCaseId: 'UC::Start', label: 'objective' },
    ])
  })
})

describe('parts inside an occurrence', () => {
  const m = model(
    el('D::UnlockSequence', 'occurrence', { parentId: 'D' }),
    el('D::UnlockSequence::keyFob', 'part', { parentId: 'D::UnlockSequence' }),
    el('D::UnlockSequence::car', 'part', { parentId: 'D::UnlockSequence' }),
    el('D::UnlockSequence::car::locks', 'part', { parentId: 'D::UnlockSequence::car' }),
    el('L::Car', 'part', { parentId: 'L' }),
    el('L::Car::keyFob', 'part', { parentId: 'L::Car' }),
    el('D::UnlockSequence::keyFob_subsets_car_keyFob', 'subsetting', {
      parentId: 'D::UnlockSequence',
      sourceId: 'D::UnlockSequence::keyFob',
      targetId: 'L::Car::keyFob',
    }),
    el('D::UnlockSequence::car::locks_redefines_L_Car_locks', 'redefinition', {
      parentId: 'D::UnlockSequence::car',
      sourceId: 'D::UnlockSequence::car::locks',
      targetId: 'L::Car::locks',
    }),
  )

  it('names ends inside an occurrence with the occurrence', () => {
    expect(elementDisplayName(m['D::UnlockSequence::keyFob'], 'D::UnlockSequence::keyFob', m)).toBe(
      'UnlockSequence.keyFob',
    )
    expect(
      elementDisplayName(
        m['D::UnlockSequence::car::locks'],
        'D::UnlockSequence::car::locks',
        m,
      ),
    ).toBe('UnlockSequence.car.locks')
    // outside an occurrence, or without the model, the name is unchanged
    expect(elementDisplayName(m['L::Car::keyFob'], 'L::Car::keyFob', m)).toBe('keyFob')
    expect(elementDisplayName(m['D::UnlockSequence::keyFob'], 'x')).toBe('keyFob')
  })

  it('finds the owning occurrence and the path below it', () => {
    expect(owningOccurrenceId(m, 'D::UnlockSequence::car::locks')).toBe('D::UnlockSequence')
    expect(owningOccurrenceId(m, 'L::Car::keyFob')).toBeNull()
    expect(owningOccurrenceId(m, 'D::UnlockSequence')).toBeNull()
    expect(occurrencePath(m, 'D::UnlockSequence::car::locks')).toBe('car.locks')
  })

  it('lists what a part subsets or redefines', () => {
    expect(featureTargets(m, 'D::UnlockSequence::keyFob')).toEqual([
      {
        label: 'Subsets',
        relationId: 'D::UnlockSequence::keyFob_subsets_car_keyFob',
        targetId: 'L::Car::keyFob',
      },
    ])
    expect(featureTargets(m, 'D::UnlockSequence::car::locks')[0].label).toBe('Redefines')
    expect(featureTargets(m, 'L::Car::keyFob')).toEqual([])
    expect(featureLabel(m, 'L::Car::keyFob')).toBe('keyFob (Car)')
  })
})

describe('elementTypeLabel', () => {
  const t = (partial: Partial<SemanticElement> & { kind: SemanticElement['kind'] }) =>
    elementTypeLabel({ id: 'x', name: 'x', parentId: null, typeRef: null, sourceId: null, targetId: null, ...partial } as SemanticElement)

  it('gives the SysML keyword for usages and definitions', () => {
    expect(t({ kind: 'part' })).toBe('part')
    expect(t({ kind: 'part', isReference: true })).toBe('ref part')
    expect(t({ kind: 'part', isDefinition: true })).toBe('part def')
    expect(t({ kind: 'part', isDefinition: true, isAbstract: true })).toBe('abstract part def')
    expect(t({ kind: 'useCase', isDefinition: true, isAbstract: true })).toBe(
      'abstract use case def',
    )
    expect(t({ kind: 'part', isAbstract: true })).toBe('part')
    expect(t({ kind: 'useCase' })).toBe('use case')
    expect(t({ kind: 'useCase', isDefinition: true })).toBe('use case def')
    expect(t({ kind: 'requirement' })).toBe('requirement')
    expect(t({ kind: 'requirement', isDefinition: true })).toBe('requirement def')
    expect(t({ kind: 'action' })).toBe('action')
    expect(t({ kind: 'action', isDefinition: true })).toBe('action def')
    expect(t({ kind: 'occurrence', isDefinition: true })).toBe('occurrence def')
    expect(t({ kind: 'occurrence' })).toBe('occurrence')
    expect(t({ kind: 'eventOccurrence' })).toBe('event occurrence')
    expect(t({ kind: 'interaction' })).toBe('interaction')
    expect(t({ kind: 'interaction', isDefinition: true })).toBe('interaction def')
    expect(t({ kind: 'lifeline' })).toBe('lifeline')
    expect(t({ kind: 'message', isDefinition: true })).toBe('message def')
    for (const k of ['actor', 'port', 'state', 'attribute', 'message', 'view', 'package'] as const) {
      expect(t({ kind: k })).toBe(k)
    }
    expect(t({ kind: 'port', isDefinition: true })).toBe('port def')
  })

  it('keeps an unknown kind unchanged, with def for a definition', () => {
    expect(t({ kind: 'weird' as SemanticElement['kind'] })).toBe('weird')
    expect(t({ kind: 'weird' as SemanticElement['kind'], isDefinition: true })).toBe('weird def')
  })
})

describe('relatedElementLabel', () => {
  const sem: Record<string, SemanticElement> = {
    'UC::Start': { id: 'UC::Start', kind: 'useCase', name: 'StartVehicle', shortId: 'UC001', isDefinition: true, parentId: null, typeRef: null, sourceId: null, targetId: null } as SemanticElement,
    'F::auth': { id: 'F::auth', kind: 'part', name: 'authenticate', parentId: null, typeRef: null, sourceId: null, targetId: null } as SemanticElement,
    Occ: { id: 'Occ', kind: 'occurrence', name: 'UnlockSequence', isDefinition: true, parentId: null, typeRef: null, sourceId: null, targetId: null } as SemanticElement,
    'Occ::keyFob': { id: 'Occ::keyFob', kind: 'part', name: 'keyFob', isReference: true, parentId: 'Occ', typeRef: null, sourceId: null, targetId: null } as SemanticElement,
  }

  it('returns type, short id and name', () => {
    expect(relatedElementLabel(sem, 'UC::Start')).toEqual({ type: 'use case def', shortId: 'UC001', name: 'StartVehicle' })
  })
  it('has a null short id when the element has none', () => {
    expect(relatedElementLabel(sem, 'F::auth')).toEqual({ type: 'part', shortId: null, name: 'authenticate' })
  })
  it('names a part in an occurrence with its path', () => {
    expect(relatedElementLabel(sem, 'Occ::keyFob')).toEqual({ type: 'ref part', shortId: null, name: 'UnlockSequence.keyFob' })
  })
  it('falls back to the id without a type for a missing element', () => {
    expect(relatedElementLabel(sem, 'Nope')).toEqual({ type: null, shortId: null, name: 'Nope' })
  })
})
