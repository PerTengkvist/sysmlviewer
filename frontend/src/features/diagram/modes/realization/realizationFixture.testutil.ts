import type { SemanticElement, UseCaseFlowRealization, ViewPayload } from '../../../../api'

/** A small use case with its realization, as the backend sends it; shared by the tests of this mode. */
export const UC = 'P::UC::Start'
export const SEC = 'P::F::Security'
export const FLOW = `${SEC}::startFlow`
export const AUTH = `${SEC}::auth`
export const IMMO = `${SEC}::immo`
export const VC = 'P::L::vc'
export const BC = 'P::L::bc'
export const DRIVER = `${UC}::Driver`
export const step = (n: string) => `${UC}::${n}`
export const fstep = (n: string) => `${FLOW}::${n}`

export function el(
  id: string,
  kind: SemanticElement['kind'],
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop()!,
    parentId: id.includes('::') ? id.slice(0, id.lastIndexOf('::')) : null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...extra,
  }
}

export function succ(owner: string, n: number, source: string, target: string, name?: string) {
  const id = `${owner}::${name ?? `succ${n}`}`
  return el(id, 'succession', { name: name ?? `succ${n}`, sourceId: source, targetId: target })
}

export type Opts = {
  realization?: Partial<UseCaseFlowRealization>
  laneTargets?: Record<string, string[]>
  extra?: SemanticElement[]
  /** Replace the use case successions. */
  successions?: SemanticElement[]
}

/** Start: pressStart (Driver) -> checkKey -> showReady -> done, askForBrake unlinked. */
export function fixture(opts: Opts = {}): ViewPayload {
  const base: SemanticElement[] = [
    el(UC, 'useCase'),
    el(DRIVER, 'actor'),
    el(step('start'), 'action', { typeRef: 'start' }),
    el(step('pressStart'), 'action'),
    el(step('checkKey'), 'action'),
    el(step('showReady'), 'action'),
    el(step('askForBrake'), 'action'),
    el(step('done'), 'action', { typeRef: 'done' }),
    ...(opts.successions ?? [
      succ(UC, 1, step('start'), step('pressStart')),
      succ(UC, 2, step('pressStart'), step('checkKey')),
      succ(UC, 3, step('checkKey'), step('showReady')),
      succ(UC, 4, step('showReady'), step('done')),
    ]),
    el(SEC, 'part'),
    el(FLOW, 'action'),
    el(fstep('start'), 'action', { typeRef: 'start' }),
    el(fstep('checkKeyInCabin'), 'action'),
    el(fstep('releaseImmobilizer'), 'action'),
    el(fstep('logStart'), 'action'),
    el(fstep('done'), 'action', { typeRef: 'done' }),
    succ(FLOW, 1, fstep('start'), fstep('checkKeyInCabin')),
    succ(FLOW, 2, fstep('checkKeyInCabin'), fstep('releaseImmobilizer')),
    succ(FLOW, 3, fstep('releaseImmobilizer'), fstep('logStart')),
    succ(FLOW, 4, fstep('logStart'), fstep('done')),
    el(AUTH, 'part'),
    el(IMMO, 'part'),
    el(VC, 'part'),
    el(BC, 'part'),
    ...(opts.extra ?? []),
  ]
  const realization: UseCaseFlowRealization = {
    useCaseId: UC,
    subject: null,
    inScope: true,
    actors: [DRIVER],
    actorSteps: { [step('pressStart')]: DRIVER },
    systemSteps: [step('checkKey'), step('showReady'), step('askForBrake')],
    unrealizedSteps: [step('askForBrake')],
    coarseSteps: {},
    stepRealizers: {
      [step('checkKey')]: [fstep('checkKeyInCabin')],
      [step('showReady')]: [fstep('releaseImmobilizer')],
    },
    realizerNodes: { [fstep('checkKeyInCabin')]: [AUTH], [fstep('releaseImmobilizer')]: [IMMO] },
    realizerFunctions: { [fstep('checkKeyInCabin')]: SEC, [fstep('releaseImmobilizer')]: SEC },
    nodeFunctions: { [AUTH]: [SEC], [IMMO]: [SEC] },
    calls: [],
    ...opts.realization,
  }
  return {
    view: { id: 'V::Start', name: 'Start', rootArtifactId: UC },
    diagramMode: 'useCaseRealization',
    semantic: Object.fromEntries(base.map((e) => [e.id, e])),
    visualization: { nodes: {}, edges: {} },
    flowRealization: realization,
    laneTargets: opts.laneTargets ?? { [AUTH]: [VC], [IMMO]: [VC] },
    realizationLabels: { [DRIVER]: 'Driver', [AUTH]: 'auth', [IMMO]: 'immo', [VC]: 'vc', [BC]: 'bc', [SEC]: 'Security' },
  } as unknown as ViewPayload
}

