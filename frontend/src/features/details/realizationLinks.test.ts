import { describe, expect, it } from 'vitest'
import type { Realization, SemanticElement, UseCaseRealization } from '../../api'
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
const TWO = 'UC::Two'
const SEC = 'F::Security'
const F2 = 'F::Other'
const FLOW = `${SEC}::startFlow`
const FSTEP = `${FLOW}::checkKeyInCabin`
const AUTH = `${SEC}::auth`
const IMMO = `${SEC}::immo`
const VC = 'L::vc'

const semantic: Record<string, SemanticElement> = Object.fromEntries(
  [
    el({ id: UC, kind: 'useCase', name: 'Start', shortId: 'UCA', isDefinition: true }),
    el({ id: `${UC}::pressStart`, kind: 'action', name: 'pressStart', parentId: UC }),
    el({ id: `${UC}::checkKey`, kind: 'action', name: 'checkKey', parentId: UC }),
    el({ id: `${UC}::askForBrake`, kind: 'action', name: 'askForBrake', parentId: UC }),
    el({ id: `${UC}::Driver`, kind: 'actor', name: 'Driver', parentId: UC }),
    el({ id: 'UC::Drive', kind: 'useCase', name: 'Drive', isDefinition: true }),
    el({ id: 'UC::Lock', kind: 'useCase', name: 'Lock', isDefinition: true }),
    el({ id: TWO, kind: 'useCase', name: 'Two', isDefinition: true }),
    el({ id: `${TWO}::x`, kind: 'action', name: 'x', parentId: TWO }),
    el({ id: 'UC::Lonely', kind: 'useCase', name: 'Lonely', isDefinition: true }),
    el({ id: SEC, kind: 'part', name: 'Security', isDefinition: true }),
    el({ id: F2, kind: 'part', name: 'Other', isDefinition: true }),
    el({ id: FLOW, kind: 'action', name: 'startFlow', parentId: SEC }),
    el({ id: FSTEP, kind: 'action', name: 'checkKeyInCabin', parentId: FLOW }),
    el({ id: AUTH, kind: 'part', name: 'auth', parentId: SEC }),
    el({ id: IMMO, kind: 'part', name: 'immo', parentId: SEC }),
    el({ id: VC, kind: 'part', name: 'vc' }),
  ].map((e) => [e.id, e]),
)

const uc = (partial: Partial<UseCaseRealization>): UseCaseRealization => ({
  functions: {},
  nodes: {},
  parts: {},
  viaInclude: [],
  declared: [],
  origin: {},
  nodeFunctions: {},
  functionNodes: {},
  functionParts: {},
  ...partial,
})

const realization: Realization = {
  links: [
    { refineId: 'r1', sourceId: FSTEP, targetId: `${UC}::checkKey`, precision: 'step' },
    { refineId: 'r2', sourceId: SEC, targetId: 'UC::Lock', precision: 'explicit' },
  ],
  actorSteps: { [UC]: { [`${UC}::pressStart`]: `${UC}::Driver` } },
  systemSteps: {
    [UC]: [`${UC}::checkKey`, `${UC}::askForBrake`],
    [TWO]: [`${TWO}::x`],
  },
  stepRealizers: { [`${UC}::checkKey`]: [FSTEP] },
  coarseRealizers: { [`${UC}::askForBrake`]: [], [TWO]: [FLOW] },
  realizerNodes: { [FSTEP]: [AUTH], [FLOW]: [AUTH, IMMO] },
  nodeParts: { [AUTH]: [VC], [IMMO]: [] },
  useCases: {
    [UC]: uc({
      functions: { [SEC]: 'step' },
      nodes: { [AUTH]: 'step', [IMMO]: 'coarse' },
      parts: { [VC]: 'step' },
      nodeFunctions: { [AUTH]: [SEC], [IMMO]: [SEC] },
    }),
    'UC::Drive': uc({
      functions: { [SEC]: 'step' },
      nodes: { [AUTH]: 'step' },
      parts: { [VC]: 'step' },
      viaInclude: [SEC, AUTH, VC],
      nodeFunctions: { [AUTH]: [SEC] },
    }),
    'UC::Lock': uc({ functions: { [SEC]: 'explicit' }, declared: [SEC] }),
    // A node that refines the use case itself belongs to no function.
    'UC::Lonely': uc({ nodes: { [IMMO]: 'explicit' }, declared: [IMMO] }),
    // A node performing steps of two functions is listed under both.
    [TWO]: uc({
      functions: { [SEC]: 'step', [F2]: 'step' },
      nodes: { [AUTH]: 'step' },
      parts: { [VC]: 'step' },
      nodeFunctions: { [AUTH]: [SEC, F2] },
    }),
  },
  inScope: [UC, TWO],
  findings: [
    {
      code: 'unrealized-system-step',
      elementId: `${UC}::askForBrake`,
      message: 'system step is not realized', useCaseId: null,
    },
    {
      code: 'untraced-function-step',
      elementId: `${UC}::askForBrake`,
      message: 'other finding', useCaseId: null,
    },
  ],
}

const info = (id: string) => elementRealization(realization, semantic, id)
const e = (id: string, precision: string, viaInclude = false) => ({ id, precision, viaInclude })

describe('elementRealization', () => {
  it('groups a use case by function, function node and logical part, with precision', () => {
    expect(info(UC).realizedBy).toEqual([
      {
        function: e(SEC, 'step'),
        nodes: [
          { ...e(AUTH, 'step'), parts: [e(VC, 'step')] },
          { ...e(IMMO, 'coarse'), parts: [] },
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

  it('puts a node that refines the use case itself in a group without function', () => {
    expect(info('UC::Lonely').realizedBy).toEqual([
      { function: null, nodes: [{ ...e(IMMO, 'explicit'), parts: [] }] },
    ])
  })

  it('lists a node of two functions under each of them', () => {
    const groups = info(TWO).realizedBy
    expect(groups.map((g) => g.function?.id)).toEqual([SEC, F2])
    expect(groups[0].nodes.map((n) => n.id)).toEqual([AUTH])
    expect(groups[1].nodes.map((n) => n.id)).toEqual([AUTH])
  })

  it('shows who performs an actor step', () => {
    const r = info(`${UC}::pressStart`)
    expect(r.performedBy).toBe(`${UC}::Driver`)
    expect(r.unrealized).toBe(false)
    expect(r.stepRealizers).toEqual([])
  })

  it('lists the function steps of a system step with their performers from the payload', () => {
    const r = info(`${UC}::checkKey`)
    expect(r.performedBy).toBeNull()
    expect(r.stepRealizers).toEqual([
      { stepId: FSTEP, precision: 'step', nodeIds: [AUTH], viaUseCase: false },
    ])
    expect(r.unrealized).toBe(false)
  })

  it('lists a flow that realizes a step coarsely, with the nodes of its steps', () => {
    const withCoarse: Realization = {
      ...realization,
      coarseRealizers: { ...realization.coarseRealizers, [`${UC}::checkKey`]: [FLOW] },
    }
    const r = elementRealization(withCoarse, semantic, `${UC}::checkKey`)
    expect(r.stepRealizers).toEqual([
      { stepId: FSTEP, precision: 'step', nodeIds: [AUTH], viaUseCase: false },
      { stepId: FLOW, precision: 'coarse', nodeIds: [AUTH, IMMO], viaUseCase: false },
    ])
  })

  it('shows what realizes a system step through its use case when nothing does it directly', () => {
    const r = info(`${TWO}::x`)
    expect(r.stepRealizers).toEqual([
      { stepId: FLOW, precision: 'coarse', nodeIds: [AUTH, IMMO], viaUseCase: true },
    ])
    expect(r.unrealized).toBe(false)
  })

  it('flags an unrealized system step of a use case in scope, once', () => {
    const r = info(`${UC}::askForBrake`)
    expect(r.unrealized).toBe(true)
    // The gap is shown as "Not realized"; other findings stay.
    expect(r.findings.map((f) => f.code)).toEqual(['untraced-function-step'])
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
    expect(info(SEC).realizes.map((x) => [x.useCaseId, x.precision, x.viaInclude])).toEqual([
      [UC, 'step', false],
      ['UC::Drive', 'step', true],
      ['UC::Lock', 'explicit', false],
      [TWO, 'step', false],
    ])
    expect(info(IMMO).realizes).toEqual([
      { useCaseId: UC, stepId: null, precision: 'coarse', viaInclude: false },
      { useCaseId: 'UC::Lonely', stepId: null, precision: 'explicit', viaInclude: false },
    ])
  })

  it('lists the use cases a logical part realizes, via its function node', () => {
    const r = info(VC)
    expect(r.realizes).toEqual([])
    expect(r.realizesViaNode.map((x) => x.useCaseId)).toEqual([UC, 'UC::Drive', TWO])
  })

  it('is empty for an element of the model that is outside the realization', () => {
    const r = info(`${UC}::Driver`)
    expect(hasRealizationInfo(r)).toBe(false)
    expect(hasRealizationInfo(info(UC))).toBe(true)
    expect(hasRealizationInfo(info(`${UC}::askForBrake`))).toBe(true)
  })

  it('shows a finding on its element and none on others', () => {
    expect(info(`${UC}::askForBrake`).findings).toHaveLength(1)
    expect(info(UC).findings).toEqual([])
  })
})

describe('a function that stands for its nodes', () => {
  const realization = (): Realization => ({
    links: [],
    actorSteps: {},
    systemSteps: {},
    stepRealizers: {},
    coarseRealizers: {},
    realizerNodes: {},
    nodeParts: {},
    useCases: {
      'UC::Lonely': uc({
        functions: { [SEC]: 'explicit' },
        declared: [SEC],
        functionNodes: { [AUTH]: SEC, [IMMO]: SEC },
      }),
    },
    inScope: [],
    findings: [],
  })

  it('lists the nodes under the function, marked through its function', () => {
    const info = elementRealization(realization(), semantic, 'UC::Lonely')
    expect(info.realizedBy).toHaveLength(1)
    expect(info.realizedBy[0].nodes.map((n) => [n.id, n.precision, n.throughFunction])).toEqual([
      [AUTH, 'explicit', true],
      [IMMO, 'explicit', true],
    ])
  })

  it('lets the node say which use case it realizes through its function', () => {
    const info = elementRealization(realization(), semantic, AUTH)
    expect(info.realizes).toEqual([
      { useCaseId: 'UC::Lonely', stepId: null, precision: 'explicit', viaInclude: false, throughFunction: true },
    ])
  })

  it('lists the parts that the function reaches for the node', () => {
    const real = realization()
    real.nodeParts = { [AUTH]: [VC] }
    real.useCases['UC::Lonely'].functionParts = { [VC]: SEC }
    const node = elementRealization(real, semantic, 'UC::Lonely').realizedBy[0].nodes[0]
    expect(node.parts.map((p) => [p.id, p.throughFunction])).toEqual([[VC, true]])
    expect(elementRealization(real, semantic, VC).realizesViaNode[0]).toMatchObject({
      useCaseId: 'UC::Lonely',
      throughFunction: true,
    })
  })
})
