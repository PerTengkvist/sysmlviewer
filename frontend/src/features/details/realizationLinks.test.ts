import { describe, expect, it } from 'vitest'
import type { Realization, SemanticElement } from '../../api'
import { elementRealization, hasRealizationInfo } from './realizationLinks'

function el(
  partial: Partial<SemanticElement> & Pick<SemanticElement, 'id' | 'kind' | 'name'>,
): SemanticElement {
  return {
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    metadataKeywords: [],
    fileId: 'f',
    ...partial,
  }
}

const UC = 'UC::Start'
const SEC = 'F::Security'
const FLOW = `${SEC}::startFlow`
const FSTEP = `${FLOW}::checkKeyInCabin`
const AUTH = `${SEC}::auth`
const IMMO = `${SEC}::immo`

function perform(owner: string, target: string): SemanticElement {
  return el({
    id: `${owner}::perform_1`,
    kind: 'action',
    name: 'perform_1',
    parentId: owner,
    typeRef: 'startFlow.x',
    performTargetId: target,
    metadataKeywords: ['perform'],
  })
}

const semantic: Record<string, SemanticElement> = Object.fromEntries(
  [
    el({ id: UC, kind: 'useCase', name: 'Start', shortId: 'UCA', isDefinition: true }),
    el({ id: `${UC}::pressStart`, kind: 'action', name: 'pressStart', parentId: UC }),
    el({ id: `${UC}::checkKey`, kind: 'action', name: 'checkKey', parentId: UC }),
    el({ id: `${UC}::askForBrake`, kind: 'action', name: 'askForBrake', parentId: UC }),
    el({ id: `${UC}::Driver`, kind: 'actor', name: 'Driver', parentId: UC }),
    el({ id: 'UC::Drive', kind: 'useCase', name: 'Drive', isDefinition: true }),
    el({ id: SEC, kind: 'part', name: 'Security', isDefinition: true }),
    el({ id: FLOW, kind: 'action', name: 'startFlow', parentId: SEC }),
    el({ id: FSTEP, kind: 'action', name: 'checkKeyInCabin', parentId: FLOW }),
    el({ id: AUTH, kind: 'part', name: 'auth', parentId: SEC }),
    perform(AUTH, FSTEP),
    el({ id: IMMO, kind: 'part', name: 'immo', parentId: SEC }),
    el({ id: 'L::vc', kind: 'part', name: 'vc' }),
    el({ id: 'F::alloc', kind: 'allocation', name: 'alloc', sourceId: AUTH, targetId: 'L::vc' }),
  ].map((e) => [e.id, e]),
)

const realization: Realization = {
  links: [
    { refineId: 'r1', sourceId: FSTEP, targetId: `${UC}::checkKey`, precision: 'step' },
    { refineId: 'r2', sourceId: SEC, targetId: 'UC::Lock', precision: 'explicit' },
  ],
  actorSteps: { [UC]: { [`${UC}::pressStart`]: `${UC}::Driver` } },
  systemSteps: { [UC]: [`${UC}::checkKey`, `${UC}::askForBrake`] },
  stepRealizers: { [`${UC}::checkKey`]: [FSTEP] },
  coarseRealizers: {},
  useCases: {
    [UC]: {
      functions: { [SEC]: 'step' },
      nodes: { [AUTH]: 'step', [IMMO]: 'coarse' },
      parts: { 'L::vc': 'step' },
      viaInclude: [],
      declared: [],
      origin: {},
    },
    'UC::Drive': {
      functions: { [SEC]: 'step' },
      nodes: { [AUTH]: 'step' },
      parts: { 'L::vc': 'step' },
      viaInclude: [SEC, AUTH, 'L::vc'],
      declared: [],
      origin: {},
    },
    'UC::Lock': {
      functions: { [SEC]: 'explicit' },
      nodes: {},
      parts: {},
      viaInclude: [],
      declared: [SEC],
      origin: { [SEC]: 'r2' },
    },
  },
  inScope: [UC],
  findings: [
    {
      code: 'unrealized-system-step',
      elementId: `${UC}::askForBrake`,
      message: 'system step is not realized',
    },
  ],
}

const info = (id: string) => elementRealization(realization, semantic, id)

describe('elementRealization', () => {
  it('groups a use case by function, function node and logical part, with precision', () => {
    const r = info(UC)
    expect(r.realizedBy).toEqual([
      {
        function: { id: SEC, precision: 'step', viaInclude: false },
        nodes: [
          {
            id: AUTH,
            precision: 'step',
            viaInclude: false,
            parts: [{ id: 'L::vc', precision: 'step', viaInclude: false }],
          },
          { id: IMMO, precision: 'coarse', viaInclude: false, parts: [] },
        ],
      },
    ])
  })

  it('marks what a composite use case gets through include', () => {
    const [group] = info('UC::Drive').realizedBy
    expect(group.function?.viaInclude).toBe(true)
    expect(group.nodes[0].viaInclude).toBe(true)
    expect(group.nodes[0].parts[0].viaInclude).toBe(true)
  })

  it('shows who performs an actor step', () => {
    const r = info(`${UC}::pressStart`)
    expect(r.performedBy).toBe(`${UC}::Driver`)
    expect(r.unrealized).toBe(false)
    expect(r.stepRealizers).toEqual([])
  })

  it('lists the function steps of a system step with their performers', () => {
    const r = info(`${UC}::checkKey`)
    expect(r.performedBy).toBeNull()
    expect(r.stepRealizers).toEqual([{ stepId: FSTEP, precision: 'step', nodeIds: [AUTH] }])
    expect(r.unrealized).toBe(false)
  })

  it('flags an unrealized system step of a use case in scope', () => {
    const r = info(`${UC}::askForBrake`)
    expect(r.unrealized).toBe(true)
    expect(r.findings.map((f) => f.code)).toEqual(['unrealized-system-step'])
  })

  it('does not flag a step of a use case outside the scope', () => {
    const out: Realization = { ...realization, inScope: [] }
    expect(elementRealization(out, semantic, `${UC}::askForBrake`).unrealized).toBe(false)
  })

  it('lists the use case steps a function step realizes', () => {
    expect(info(FSTEP).realizes).toEqual([
      { useCaseId: UC, stepId: `${UC}::checkKey`, precision: 'step', viaInclude: false },
    ])
  })

  it('lists the use cases a function and a function node realize', () => {
    expect(info(SEC).realizes.map((e) => [e.useCaseId, e.precision, e.viaInclude])).toEqual([
      [UC, 'step', false],
      ['UC::Drive', 'step', true],
      ['UC::Lock', 'explicit', false],
    ])
    expect(info(IMMO).realizes).toEqual([
      { useCaseId: UC, stepId: null, precision: 'coarse', viaInclude: false },
    ])
  })

  it('lists the use cases a logical part realizes, via its function node', () => {
    const r = info('L::vc')
    expect(r.realizes).toEqual([])
    expect(r.realizesViaNode.map((e) => e.useCaseId)).toEqual([UC, 'UC::Drive'])
  })

  it('is empty for an element outside the realization', () => {
    const r = info('UC::Drive::nothing')
    expect(hasRealizationInfo(r)).toBe(false)
    expect(hasRealizationInfo(info(UC))).toBe(true)
    expect(hasRealizationInfo(info(`${UC}::askForBrake`))).toBe(true)
  })

  it('shows a finding on its element', () => {
    expect(info(`${UC}::askForBrake`).findings).toEqual([
      {
        code: 'unrealized-system-step',
        elementId: `${UC}::askForBrake`,
        message: 'system step is not realized',
      },
    ])
    expect(info(UC).findings).toEqual([])
  })
})
