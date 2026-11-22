import type {
  MatrixNodeColumn,
  Realization,
  SemanticElement,
  ViewPayload,
} from '../../../../api'

/**
 * The realization probe model (backend/tests/fixtures/realization_probe.sysml) as the
 * view payload of a `realizationMatrix` view exposing all four use cases.
 */
export const P = 'RealizationProbe::'
export const START = `${P}UC::Start`
export const UNLOCK = `${P}UC::Unlock`
export const LOCK = `${P}UC::Lock`
export const DRIVE = `${P}UC::Drive`
export const SEC = `${P}F::Security`
export const AUTH = `${SEC}::auth`
export const IMMO = `${SEC}::immo`
export const LOCKS = `${SEC}::locks`
export const VC = `${P}L::vc`
export const BC = `${P}L::bc`
export const REFINE_1 = `${P}refine1`
export const REFINE_2 = `${P}refine2`
export const REFINE_3 = `${P}refine3`
export const REFINE_4 = `${P}refine4`

export function el(
  id: string,
  kind: SemanticElement['kind'],
  parentId: string | null = null,
  shortId: string | null = null,
): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop() ?? id,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    shortId,
  }
}

export function probeRealization(): Realization {
  return {
    links: [
      {
        refineId: REFINE_1,
        sourceId: `${SEC}::startFlow::checkKeyInCabin`,
        targetId: `${START}::checkKey`,
        precision: 'step',
      },
      {
        refineId: REFINE_2,
        sourceId: `${SEC}::startFlow::releaseImmobilizer`,
        targetId: `${START}::showReady`,
        precision: 'step',
      },
      {
        refineId: REFINE_3,
        sourceId: `${SEC}::unlockFlow`,
        targetId: UNLOCK,
        precision: 'coarse',
      },
      { refineId: REFINE_4, sourceId: SEC, targetId: LOCK, precision: 'explicit' },
    ],
    actorSteps: {
      [START]: { [`${START}::pressStart`]: `${START}::Driver` },
      [UNLOCK]: { [`${UNLOCK}::pressUnlock`]: `${UNLOCK}::Driver` },
    },
    systemSteps: {
      [START]: [`${START}::checkKey`, `${START}::showReady`, `${START}::askForBrake`],
      [UNLOCK]: [`${UNLOCK}::unlockDoors`],
      [LOCK]: [`${LOCK}::lockDoors`],
    },
    stepRealizers: {
      [`${START}::checkKey`]: [`${SEC}::startFlow::checkKeyInCabin`],
      [`${START}::showReady`]: [`${SEC}::startFlow::releaseImmobilizer`],
    },
    coarseRealizers: { [UNLOCK]: [`${SEC}::unlockFlow`] },
    realizerNodes: {
      [`${SEC}::startFlow::checkKeyInCabin`]: [AUTH],
      [`${SEC}::startFlow::releaseImmobilizer`]: [IMMO],
      [`${SEC}::unlockFlow`]: [LOCKS],
    },
    nodeParts: { [AUTH]: [VC], [IMMO]: [VC], [LOCKS]: [BC] },
    useCases: {
      [START]: {
        functions: { [SEC]: 'step' },
        nodes: { [AUTH]: 'step', [IMMO]: 'step' },
        parts: { [VC]: 'step' },
        viaInclude: [],
        declared: [],
        nodeFunctions: { [AUTH]: [SEC], [IMMO]: [SEC] },
        functionNodes: {},
        functionParts: {},
        origin: { [SEC]: REFINE_1, [AUTH]: REFINE_1, [IMMO]: REFINE_2, [VC]: REFINE_1 },
      },
      [UNLOCK]: {
        functions: { [SEC]: 'coarse' },
        nodes: { [LOCKS]: 'coarse' },
        parts: { [BC]: 'coarse' },
        viaInclude: [],
        declared: [],
        nodeFunctions: { [LOCKS]: [SEC] },
        functionNodes: {},
        functionParts: {},
        origin: { [SEC]: REFINE_3, [LOCKS]: REFINE_3, [BC]: REFINE_3 },
      },
      [LOCK]: {
        functions: { [SEC]: 'explicit' },
        nodes: {},
        parts: {},
        viaInclude: [],
        declared: [SEC],
        nodeFunctions: {},
        functionNodes: { [AUTH]: SEC, [IMMO]: SEC, [LOCKS]: SEC },
        functionParts: { [VC]: SEC, [BC]: SEC },
        origin: { [SEC]: REFINE_4 },
      },
      [DRIVE]: {
        functions: { [SEC]: 'step' },
        nodes: { [AUTH]: 'step', [IMMO]: 'step', [LOCKS]: 'coarse' },
        parts: { [VC]: 'step', [BC]: 'coarse' },
        viaInclude: [SEC, AUTH, IMMO, LOCKS, VC, BC],
        declared: [],
        nodeFunctions: { [AUTH]: [SEC], [IMMO]: [SEC], [LOCKS]: [SEC] },
        functionNodes: {},
        functionParts: {},
        origin: {},
      },
    },
    inScope: [START],
    findings: [
      {
        code: 'unrealized-system-step',
        elementId: `${START}::askForBrake`,
        message: 'system step is not realized',
        useCaseId: START,
      },
    ],
  }
}

export const probeNodes: MatrixNodeColumn[] = [
  { id: AUTH, functionId: SEC },
  { id: IMMO, functionId: SEC },
  { id: LOCKS, functionId: SEC },
]

export type ProbeView = {
  semantic: Record<string, SemanticElement>
  realization: Realization
  matrixColumns: NonNullable<ViewPayload['matrixColumns']>
  matrixLabels: NonNullable<ViewPayload['matrixLabels']>
}

export function probeView(): ProbeView {
  const semantic: Record<string, SemanticElement> = {}
  const add = (e: SemanticElement) => {
    semantic[e.id] = e
  }
  add(el(START, 'useCase', `${P}UC`, 'UCA'))
  add(el(UNLOCK, 'useCase', `${P}UC`, 'UCB'))
  add(el(LOCK, 'useCase', `${P}UC`, 'UCC'))
  add(el(DRIVE, 'useCase', `${P}UC`, 'UCD'))
  for (const [uc, steps] of [
    [START, ['pressStart', 'checkKey', 'showReady', 'askForBrake']],
    [UNLOCK, ['pressUnlock', 'unlockDoors']],
    [LOCK, ['lockDoors']],
  ] as const) {
    for (const s of steps) add(el(`${uc}::${s}`, 'action', uc))
  }
  add(el(SEC, 'part'))
  for (const n of [AUTH, IMMO, LOCKS]) add(el(n, 'part', SEC))
  add(el(VC, 'part', `${P}L`))
  add(el(BC, 'part', `${P}L`))
  return {
    semantic,
    realization: probeRealization(),
    matrixColumns: { nodes: probeNodes.map((n) => ({ ...n })) },
    // As the backend serves them for this model: no name is shared, so nothing is qualified.
    matrixLabels: {
      rows: {
        [START]: 'UCA Start',
        [UNLOCK]: 'UCB Unlock',
        [LOCK]: 'UCC Lock',
        [DRIVE]: 'UCD Drive',
      },
      nodes: { [AUTH]: 'auth', [IMMO]: 'immo', [LOCKS]: 'locks' },
      parts: { [VC]: 'vc', [BC]: 'bc' },
      functions: { [SEC]: 'Security' },
    },
  }
}
