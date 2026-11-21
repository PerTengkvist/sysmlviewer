import { describe, expect, it } from 'vitest'
import type { SemanticElement, UseCaseFlowRealization, ViewPayload } from '../../../../api'
import { expandRealizationFlow } from './expandRealizationFlow'

const UC = 'P::UC::Start'
const SEC = 'P::F::Security'
const FLOW = `${SEC}::startFlow`
const AUTH = `${SEC}::auth`
const IMMO = `${SEC}::immo`
const VC = 'P::L::vc'
const BC = 'P::L::bc'
const DRIVER = `${UC}::Driver`
const step = (n: string) => `${UC}::${n}`
const fstep = (n: string) => `${FLOW}::${n}`

function el(
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

function succ(owner: string, n: number, source: string, target: string, name?: string) {
  const id = `${owner}::${name ?? `succ${n}`}`
  return el(id, 'succession', { name: name ?? `succ${n}`, sourceId: source, targetId: target })
}

type Opts = {
  realization?: Partial<UseCaseFlowRealization>
  laneTargets?: Record<string, string[]>
  extra?: SemanticElement[]
  /** Replace the use case successions. */
  successions?: SemanticElement[]
}

/** Start: pressStart (Driver) -> checkKey -> showReady -> done, askForBrake unlinked. */
function fixture(opts: Opts = {}): ViewPayload {
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

const pairs = (f: ReturnType<typeof expandRealizationFlow>) =>
  f.edges.map((e) => [e.source, e.target].join('>')).sort()
const lane = (f: ReturnType<typeof expandRealizationFlow>, id: string) =>
  f.nodes.find((n) => n.id === id)?.lane

describe('blackbox', () => {
  it('keeps the use case flow and puts each step in its actor lane or in the system lane', () => {
    const f = expandRealizationFlow(fixture(), 'blackbox')
    expect(f.nodes.map((n) => n.id).sort()).toEqual(
      ['start', 'pressStart', 'checkKey', 'showReady', 'askForBrake', 'done'].map(step).sort(),
    )
    expect(pairs(f)).toEqual(
      [
        [step('start'), step('pressStart')],
        [step('pressStart'), step('checkKey')],
        [step('checkKey'), step('showReady')],
        [step('showReady'), step('done')],
      ]
        .map((p) => p.join('>'))
        .sort(),
    )
    expect(f.lanes.map((l) => l.id)).toEqual([DRIVER, 'system'])
    expect(lane(f, step('pressStart'))).toBe(DRIVER)
    for (const s of ['checkKey', 'showReady', 'askForBrake']) expect(lane(f, step(s))).toBe('system')
    // start leads into the first step's lane, done follows the last.
    expect(lane(f, step('start'))).toBe(DRIVER)
    expect(lane(f, step('done'))).toBe('system')
  })

  it('names the system lane after the subject, else "System"', () => {
    expect(expandRealizationFlow(fixture(), 'blackbox').lanes.at(-1)!.label).toBe('System')
    const subject = `${UC}::car`
    const f = expandRealizationFlow(
      fixture({ extra: [el(subject, 'part', { name: 'Car' })], realization: { subject } }),
      'blackbox',
    )
    expect(f.lanes.at(-1)).toMatchObject({ id: 'system', label: 'Car', kind: 'system' })
    expect(f.lanes[0]).toMatchObject({ id: DRIVER, label: 'Driver', kind: 'actor' })
  })

  it('marks an unrealized step also without the white box', () => {
    const f = expandRealizationFlow(fixture(), 'blackbox')
    expect(f.nodes.find((n) => n.id === step('askForBrake'))).toMatchObject({ unrealized: true })
    expect(f.nodes.find((n) => n.id === step('checkKey'))?.unrealized).toBeFalsy()
  })
})

describe('whitebox', () => {
  it('replaces each realized step by its function steps and keeps the order', () => {
    const f = expandRealizationFlow(fixture(), 'whitebox')
    const ids = f.nodes.map((n) => n.id)
    expect(ids).toContain(fstep('checkKeyInCabin'))
    expect(ids).toContain(fstep('releaseImmobilizer'))
    expect(ids).not.toContain(step('checkKey'))
    expect(ids).not.toContain(step('showReady'))
    expect(pairs(f)).toEqual(
      [
        [step('start'), step('pressStart')],
        [step('pressStart'), fstep('checkKeyInCabin')],
        [fstep('checkKeyInCabin'), fstep('releaseImmobilizer')],
        [fstep('releaseImmobilizer'), step('done')],
      ]
        .map((p) => p.join('>'))
        .sort(),
    )
    // Function steps stand for themselves when selected.
    expect(f.nodes.find((n) => n.id === fstep('checkKeyInCabin'))).toMatchObject({
      artifactId: fstep('checkKeyInCabin'),
      label: 'checkKeyInCabin',
    })
  })

  it('runs the use case decision into the first step of a chain', () => {
    const guard = step('ok')
    const f = expandRealizationFlow(
      fixture({
        extra: [el(guard, 'action', { typeRef: 'decide' })],
        successions: [
          succ(UC, 1, step('start'), step('pressStart')),
          succ(UC, 2, step('pressStart'), guard),
          succ(UC, 3, guard, step('checkKey'), 'if_ok_yes'),
          succ(UC, 4, guard, step('showReady'), 'if_ok_else'),
          succ(UC, 5, step('checkKey'), step('done')),
          succ(UC, 6, step('showReady'), step('done')),
        ],
      }),
      'whitebox',
    )
    const byPair = Object.fromEntries(f.edges.map((e) => [`${e.source}>${e.target}`, e.label]))
    expect(byPair[`${guard}>${fstep('checkKeyInCabin')}`]).toBe('YES')
    expect(byPair[`${guard}>${fstep('releaseImmobilizer')}`]).toBe('NO')
    expect(f.nodes.find((n) => n.id === guard)).toMatchObject({ kind: 'decision' })
    expect(lane(f, guard)).toBe(DRIVER) // a decision stays where the flow comes from
  })

  it('orders two realizing steps by rank in their function flow, not by link order', () => {
    const f = expandRealizationFlow(
      fixture({
        realization: {
          stepRealizers: { [step('checkKey')]: [fstep('releaseImmobilizer'), fstep('checkKeyInCabin')] },
          systemSteps: [step('checkKey')],
          unrealizedSteps: [],
          realizerNodes: { [fstep('checkKeyInCabin')]: [AUTH], [fstep('releaseImmobilizer')]: [IMMO] },
        },
        successions: [
          succ(UC, 1, step('start'), step('pressStart')),
          succ(UC, 2, step('pressStart'), step('checkKey')),
          succ(UC, 3, step('checkKey'), step('done')),
        ],
      }),
      'whitebox',
    )
    expect(pairs(f)).toEqual(
      [
        [step('start'), step('pressStart')],
        [step('pressStart'), fstep('checkKeyInCabin')],
        [fstep('checkKeyInCabin'), fstep('releaseImmobilizer')],
        [fstep('releaseImmobilizer'), step('done')],
      ]
        .map((p) => p.join('>'))
        .sort(),
    )
  })

  it('draws a function step that realizes two use case steps twice, as <ucStep>/<fStep>', () => {
    const f = expandRealizationFlow(
      fixture({
        realization: {
          stepRealizers: {
            [step('checkKey')]: [fstep('checkKeyInCabin')],
            [step('showReady')]: [fstep('checkKeyInCabin'), fstep('releaseImmobilizer')],
          },
          unrealizedSteps: [step('askForBrake')],
        },
      }),
      'whitebox',
    )
    const ids = f.nodes.map((n) => n.id)
    expect(ids).toContain(`${step('checkKey')}/${fstep('checkKeyInCabin')}`)
    expect(ids).toContain(`${step('showReady')}/${fstep('checkKeyInCabin')}`)
    expect(ids).not.toContain(fstep('checkKeyInCabin'))
    // A step that realizes one step keeps its own id.
    expect(ids).toContain(fstep('releaseImmobilizer'))
    expect(f.nodes.find((n) => n.id === `${step('showReady')}/${fstep('checkKeyInCabin')}`)).toMatchObject({
      artifactId: fstep('checkKeyInCabin'),
    })
  })

  it('keeps an unrealized step in the system lane, marked', () => {
    const f = expandRealizationFlow(fixture(), 'whitebox')
    expect(f.nodes.find((n) => n.id === step('askForBrake'))).toMatchObject({
      lane: 'system',
      unrealized: true,
    })
  })

  it('keeps a coarsely realized step in the lane of the first node of its flow', () => {
    const flowNodes = { [FLOW]: [IMMO, AUTH] }
    const f = expandRealizationFlow(
      fixture({
        realization: {
          stepRealizers: {},
          coarseSteps: { [step('checkKey')]: [FLOW], [step('showReady')]: [FLOW] },
          unrealizedSteps: [step('askForBrake')],
          realizerNodes: flowNodes,
          realizerFunctions: { [FLOW]: SEC },
          nodeFunctions: { [AUTH]: [SEC], [IMMO]: [SEC] },
        },
      }),
      'whitebox',
    )
    expect(f.nodes.find((n) => n.id === step('checkKey'))).toMatchObject({
      coarse: true,
      lane: IMMO,
      badge: '+1',
    })
    expect(f.nodes.find((n) => n.id === step('checkKey'))?.unrealized).toBeFalsy()
  })

  it('has one lane per function node, grouped under its function, between actors and system', () => {
    const f = expandRealizationFlow(fixture(), 'whitebox')
    expect(f.lanes.map((l) => l.id)).toEqual([DRIVER, AUTH, IMMO, 'system'])
    expect(f.lanes.map((l) => l.kind)).toEqual(['actor', 'node', 'node', 'system'])
    expect(lane(f, fstep('checkKeyInCabin'))).toBe(AUTH)
    expect(lane(f, fstep('releaseImmobilizer'))).toBe(IMMO)
    expect(f.lanes[1]).toMatchObject({ group: SEC, groupLabel: 'Security', label: 'auth' })
    expect(f.lanes[2]).toMatchObject({ group: SEC })
    expect(f.lanes[0].group).toBeUndefined()
  })

  it('puts a step without a performing node in the lane of its function', () => {
    const f = expandRealizationFlow(
      fixture({
        realization: {
          realizerNodes: { [fstep('checkKeyInCabin')]: [], [fstep('releaseImmobilizer')]: [IMMO] },
          nodeFunctions: { [IMMO]: [SEC] },
        },
      }),
      'whitebox',
    )
    expect(lane(f, fstep('checkKeyInCabin'))).toBe(SEC)
    expect(f.lanes.find((l) => l.id === SEC)).toMatchObject({ kind: 'function', label: 'Security' })
  })

  it('gives a step with several performers the first one and a +n badge', () => {
    const f = expandRealizationFlow(
      fixture({
        realization: {
          realizerNodes: { [fstep('checkKeyInCabin')]: [AUTH, IMMO], [fstep('releaseImmobilizer')]: [IMMO] },
        },
      }),
      'whitebox',
    )
    expect(f.nodes.find((n) => n.id === fstep('checkKeyInCabin'))).toMatchObject({ lane: AUTH, badge: '+1' })
    expect(f.nodes.find((n) => n.id === fstep('releaseImmobilizer'))?.badge).toBeUndefined()
  })
})

describe('logical', () => {
  it('uses the allocate target of the node as lane', () => {
    const f = expandRealizationFlow(fixture(), 'logical')
    expect(f.nodes.map((n) => n.id).sort()).toEqual(
      expandRealizationFlow(fixture(), 'whitebox').nodes.map((n) => n.id).sort(),
    )
    expect(f.lanes.map((l) => l.id)).toEqual([DRIVER, VC, 'system'])
    expect(f.lanes[1]).toMatchObject({ kind: 'part', label: 'vc' })
    expect(f.lanes[1].group).toBeUndefined()
    expect(lane(f, fstep('checkKeyInCabin'))).toBe(VC)
    expect(lane(f, fstep('releaseImmobilizer'))).toBe(VC)
  })

  it('puts a node with several targets in the first and adds +n', () => {
    const f = expandRealizationFlow(fixture({ laneTargets: { [AUTH]: [VC, BC], [IMMO]: [BC] } }), 'logical')
    expect(f.nodes.find((n) => n.id === fstep('checkKeyInCabin'))).toMatchObject({ lane: VC, badge: '+1' })
    expect(f.nodes.find((n) => n.id === fstep('releaseImmobilizer'))).toMatchObject({ lane: BC })
    expect(f.lanes.map((l) => l.id)).toEqual([DRIVER, VC, BC, 'system'])
  })

  it('has an "unallocated" lane for a node without allocate target', () => {
    const f = expandRealizationFlow(fixture({ laneTargets: { [AUTH]: [VC] } }), 'logical')
    expect(lane(f, fstep('releaseImmobilizer'))).toBe('unallocated')
    expect(f.lanes.map((l) => l.id)).toEqual([DRIVER, VC, 'unallocated', 'system'])
  })
})

describe('composite use case', () => {
  const START_UC = 'P::UC::Start'
  const DRIVE = 'P::UC::Drive'
  const calls = [
    { id: `${DRIVE}::include_Start`, calledUseCaseId: START_UC },
    { id: `${DRIVE}::include_Unlock`, calledUseCaseId: 'P::UC::Unlock' },
  ]
  function drive(): ViewPayload {
    const v = fixture({
      extra: [
        el(DRIVE, 'useCase'),
        el(calls[0].id, 'include', { name: 'include_Start', sourceId: DRIVE, targetId: START_UC }),
        el(calls[1].id, 'include', { name: 'include_Unlock', sourceId: DRIVE, targetId: 'P::UC::Unlock' }),
        el('P::UC::Unlock', 'useCase', { name: 'Unlock' }),
      ],
      realization: {
        useCaseId: DRIVE,
        actors: [],
        actorSteps: {},
        systemSteps: [],
        unrealizedSteps: [],
        stepRealizers: {},
        realizerNodes: {},
        realizerFunctions: {},
        nodeFunctions: {},
        calls,
      },
    })
    v.view = { ...v.view, rootArtifactId: DRIVE }
    return v
  }

  it('draws an include step as a call node, chained in declaration order', () => {
    for (const mode of ['blackbox', 'whitebox', 'logical'] as const) {
      const f = expandRealizationFlow(drive(), mode)
      const call = f.nodes.find((n) => n.id === calls[0].id)!
      expect(call).toMatchObject({
        kind: 'call',
        label: '▸ Start',
        calledUseCaseId: START_UC,
        lane: 'system',
      })
      expect(f.nodes.find((n) => n.id === calls[1].id)?.label).toBe('▸ Unlock')
      const [first, second] = [calls[0].id, calls[1].id]
      expect(pairs(f)).toContain(`${first}>${second}`)
      const kinds = f.nodes.map((n) => n.kind).sort()
      expect(kinds).toEqual(['call', 'call', 'done', 'start'])
      expect(f.lanes.map((l) => l.id)).toEqual(['system'])
    }
  })
})

describe('a use case without successions', () => {
  it('chains its steps in declaration order between start and done', () => {
    const v = fixture({ successions: [] })
    delete v.semantic[step('start')]
    delete v.semantic[step('done')]
    const f = expandRealizationFlow(v, 'blackbox')
    const order = f.nodes.map((n) => n.kind)
    expect(order.filter((k) => k === 'start')).toHaveLength(1)
    expect(order.filter((k) => k === 'done')).toHaveLength(1)
    const next = new Map(f.edges.map((e) => [e.source, e.target]))
    const start = f.nodes.find((n) => n.kind === 'start')!.id
    const walk: string[] = []
    for (let id = next.get(start); id && walk.length < 20; id = next.get(id)) walk.push(id)
    expect(walk.slice(0, -1)).toEqual(['pressStart', 'checkKey', 'showReady', 'askForBrake'].map(step))
    expect(f.nodes.find((n) => n.id === walk.at(-1))?.kind).toBe('done')
  })
})
