import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { buildUseCaseFlow } from './buildUseCaseFlow'

function el(
  partial: Partial<SemanticElement> &
    Pick<SemanticElement, 'id' | 'kind' | 'name'>,
): SemanticElement {
  return {
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    metadataKeywords: [],
    ...partial,
  }
}

describe('buildUseCaseFlow', () => {
  const semantic: Record<string, SemanticElement> = {
    'P::Pay': el({
      id: 'P::Pay',
      kind: 'useCase',
      name: 'Pay',
      documentation: 'Pay the fare',
      children: [
        'P::Pay::user',
        'P::Pay::system',
        'P::Pay::start',
        'P::Pay::scenarioA',
        'P::Pay::chooseC',
        'P::Pay::stepC',
        'P::Pay::stepD',
        'P::Pay::done',
        'P::Pay::succ1',
        'P::Pay::if_chooseC_yes',
        'P::Pay::if_chooseC_else',
      ],
    }),
    'P::Pay::user': el({
      id: 'P::Pay::user',
      kind: 'actor',
      name: 'user',
      parentId: 'P::Pay',
    }),
    'P::Pay::system': el({
      id: 'P::Pay::system',
      kind: 'part',
      name: 'system',
      parentId: 'P::Pay',
      metadataKeywords: ['subject'],
    }),
    'P::Pay::start': el({
      id: 'P::Pay::start',
      kind: 'action',
      name: 'start',
      parentId: 'P::Pay',
      typeRef: 'start',
    }),
    'P::Pay::scenarioA': el({
      id: 'P::Pay::scenarioA',
      kind: 'action',
      name: 'scenarioA',
      parentId: 'P::Pay',
      typeRef: 'scenarioA',
      metadataKeywords: ['perform'],
    }),
    'P::scenarioA': el({
      id: 'P::scenarioA',
      kind: 'case',
      name: 'scenarioA',
      typeRef: 'CaseScenario',
      children: ['P::scenarioA::start', 'P::scenarioA::doA', 'P::scenarioA::done'],
    }),
    'P::scenarioA::start': el({
      id: 'P::scenarioA::start',
      kind: 'action',
      name: 'start',
      parentId: 'P::scenarioA',
      typeRef: 'start',
    }),
    'P::scenarioA::doA': el({
      id: 'P::scenarioA::doA',
      kind: 'action',
      name: 'doA',
      parentId: 'P::scenarioA',
    }),
    'P::scenarioA::done': el({
      id: 'P::scenarioA::done',
      kind: 'action',
      name: 'done',
      parentId: 'P::scenarioA',
      typeRef: 'done',
    }),
    'P::Pay::chooseC': el({
      id: 'P::Pay::chooseC',
      kind: 'action',
      name: 'chooseC',
      parentId: 'P::Pay',
      typeRef: 'decide',
    }),
    'P::Pay::stepC': el({
      id: 'P::Pay::stepC',
      kind: 'action',
      name: 'stepC',
      parentId: 'P::Pay',
    }),
    'P::Pay::stepD': el({
      id: 'P::Pay::stepD',
      kind: 'action',
      name: 'stepD',
      parentId: 'P::Pay',
    }),
    'P::Pay::done': el({
      id: 'P::Pay::done',
      kind: 'action',
      name: 'done',
      parentId: 'P::Pay',
      typeRef: 'done',
    }),
    'P::Pay::succ1': el({
      id: 'P::Pay::succ1',
      kind: 'succession',
      name: 'succ1',
      parentId: 'P::Pay',
      sourceId: 'P::Pay::start',
      targetId: 'P::Pay::scenarioA',
    }),
    'P::Pay::if_chooseC_yes': el({
      id: 'P::Pay::if_chooseC_yes',
      kind: 'succession',
      name: 'if_chooseC_yes',
      parentId: 'P::Pay',
      sourceId: 'P::Pay::chooseC',
      targetId: 'P::Pay::stepC',
    }),
    'P::Pay::if_chooseC_else': el({
      id: 'P::Pay::if_chooseC_else',
      kind: 'succession',
      name: 'if_chooseC_else',
      parentId: 'P::Pay',
      sourceId: 'P::Pay::chooseC',
      targetId: 'P::Pay::stepD',
    }),
    'P::ChargeAction': el({
      id: 'P::ChargeAction',
      kind: 'action',
      name: 'ChargeAction',
    }),
    'P::Pay::charge': el({
      id: 'P::Pay::charge',
      kind: 'action',
      name: 'charge',
      parentId: 'P::Pay',
      typeRef: 'ChargeAction',
      metadataKeywords: ['perform'],
    }),
  }

  it('exposes title, actors, subject and objective on the left', () => {
    const { params } = buildUseCaseFlow('P::Pay', semantic)
    expect(params.title).toBe('Pay')
    expect(params.actors).toContain('user')
    expect(params.subjects).toContain('system')
    expect(params.objective).toContain('Pay the fare')
  })

  it('builds a top-down flow with start, perform, decide and done', () => {
    const { nodes } = buildUseCaseFlow('P::Pay', semantic)
    const kinds = nodes.map((n) => (n.data as { kind: string }).kind)
    expect(kinds).toContain('start')
    expect(kinds).toContain('performCase')
    expect(kinds).toContain('decide')
    expect(kinds).toContain('done')
    // CaseScenario expanded
    expect(nodes.some((n) => (n.data as { label: string }).label.includes('doA'))).toBe(
      true,
    )
  })

  it('links perform-of-action without expanding it', () => {
    const { actionLinks, nodes } = buildUseCaseFlow('P::Pay', semantic)
    expect(actionLinks).toContain('P::ChargeAction')
    const link = nodes.find(
      (n) => (n.data as { kind: string }).kind === 'actionLink',
    )
    expect(link).toBeTruthy()
  })
})

describe('buildUseCaseFlow requirement links', () => {
  const semantic: Record<string, SemanticElement> = {
    'UC::Start': el({
      id: 'UC::Start',
      kind: 'useCase',
      name: 'StartVehicle',
      children: ['UC::Start::objective_1'],
    }),
    'UC::Start::objective_1': el({
      id: 'UC::Start::objective_1',
      kind: 'dependency',
      name: 'objective_1',
      parentId: 'UC::Start',
      sourceId: 'UC::Start',
      targetId: 'R::PowerModes',
      metadataKeywords: ['objective'],
    }),
    'UC::dep2': el({
      id: 'UC::dep2',
      kind: 'dependency',
      name: 'dep2',
      sourceId: 'UC::Start',
      targetId: 'R::DriveToDest',
      metadataKeywords: ['refine'],
    }),
    'R::PowerModes': el({
      id: 'R::PowerModes',
      kind: 'requirement',
      name: 'PowerModes',
      shortId: 'REQ-PERF-06',
    }),
    'R::DriveToDest': el({
      id: 'R::DriveToDest',
      kind: 'requirement',
      name: 'DriveToDestination',
      shortId: 'US-DRIVE-01',
    }),
  }

  it('names the objective requirement instead of the dependency', () => {
    const { params } = buildUseCaseFlow('UC::Start', semantic)
    expect(params.objective).toBe('REQ-PERF-06 PowerModes')
  })

  it('lists every traced requirement with its relation', () => {
    const { params } = buildUseCaseFlow('UC::Start', semantic)
    expect(params.requirements).toEqual([
      { id: 'R::PowerModes', label: 'objective', name: 'REQ-PERF-06 PowerModes' },
      { id: 'R::DriveToDest', label: 'refine', name: 'US-DRIVE-01 DriveToDestination' },
    ])
  })
})

describe('buildUseCaseFlow objective', () => {
  it('prefers the objective requirement over the use case text', () => {
    const semantic: Record<string, SemanticElement> = {
      'UC::A': el({ id: 'UC::A', kind: 'useCase', name: 'A', documentation: 'Long description' }),
      'UC::A::objective_1': el({
        id: 'UC::A::objective_1',
        kind: 'dependency',
        name: 'objective_1',
        parentId: 'UC::A',
        sourceId: 'UC::A',
        targetId: 'R::X',
        metadataKeywords: ['objective'],
      }),
      'R::X': el({ id: 'R::X', kind: 'requirement', name: 'X', shortId: 'R-9' }),
    }
    expect(buildUseCaseFlow('UC::A', semantic).params.objective).toBe('R-9 X')
  })
})
