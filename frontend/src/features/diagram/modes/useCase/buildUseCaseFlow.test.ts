import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { buildUseCaseFlow } from './buildUseCaseFlow'
import { DECISION_NODE_SIZE, PSEUDO_NODE_SIZE } from '../actionFlow/actionNodeSize'

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
    fileId: null,
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

  it('draws start and done as the small circles of the action flow', () => {
    const { nodes } = buildUseCaseFlow('P::Pay', semantic)
    for (const kind of ['start', 'done']) {
      const n = nodes.find((x) => (x.data as { kind: string }).kind === kind)!
      expect(n.style).toMatchObject({ width: PSEUDO_NODE_SIZE, height: PSEUDO_NODE_SIZE })
    }
    const decision = nodes.find((x) => (x.data as { kind: string }).kind === 'decide')!
    expect(decision.style).toMatchObject(DECISION_NODE_SIZE)
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

type Ends = { sourceHandle?: string | null; targetHandle?: string | null; type?: string; feedback?: boolean }

function endsOf(edges: ReturnType<typeof buildUseCaseFlow>['edges'], source: string, target: string): Ends {
  const e = edges.find((x) => x.source === source && x.target === target)
  expect(e, `edge ${source} -> ${target}`).toBeTruthy()
  return {
    sourceHandle: e!.sourceHandle,
    targetHandle: e!.targetHandle,
    type: e!.type,
    feedback: !!(e!.data as { feedback?: boolean } | undefined)?.feedback,
  }
}

/** A use case with steps `names` (start/done/decide by typeRef) and successions. */
function flowModel(
  steps: Array<[string, string | null]>,
  successions: Array<[string, string, string?]>,
): Record<string, SemanticElement> {
  const sem: Record<string, SemanticElement> = {
    'U::C': el({ id: 'U::C', kind: 'useCase', name: 'C' }),
  }
  for (const [name, typeRef] of steps) {
    sem[`U::C::${name}`] = el({
      id: `U::C::${name}`,
      kind: 'action',
      name,
      parentId: 'U::C',
      typeRef,
    })
  }
  successions.forEach(([s, t, name], i) => {
    const n = name || `succ${i + 1}`
    sem[`U::C::${n}`] = el({
      id: `U::C::${n}`,
      kind: 'succession',
      name: n,
      parentId: 'U::C',
      sourceId: `U::C::${s}`,
      targetId: `U::C::${t}`,
    })
  })
  return sem
}

describe('buildUseCaseFlow ports', () => {
  it('enters every step at the top and leaves it at the bottom', () => {
    const sem = flowModel(
      [['start', 'start'], ['a', null], ['b', null], ['done', 'done']],
      [['start', 'a'], ['a', 'b'], ['b', 'done']],
    )
    const { edges } = buildUseCaseFlow('U::C', sem)
    for (const [s, t] of [['start', 'a'], ['a', 'b'], ['b', 'done']]) {
      expect(endsOf(edges, `U::C::${s}`, `U::C::${t}`)).toEqual({
        sourceHandle: 'bottom',
        targetHandle: 'top',
        type: undefined,
        feedback: false,
      })
    }
  })

  it('enters a decision at the top and leaves yes to the left, else to the right', () => {
    const sem = flowModel(
      [['start', 'start'], ['ok', 'decide'], ['y', null], ['n', null]],
      [['start', 'ok'], ['ok', 'y', 'if_ok_yes'], ['ok', 'n', 'if_ok_else']],
    )
    const { edges } = buildUseCaseFlow('U::C', sem)
    expect(endsOf(edges, 'U::C::start', 'U::C::ok').targetHandle).toBe('in-top')
    expect(endsOf(edges, 'U::C::ok', 'U::C::y').sourceHandle).toBe('out-left')
    expect(endsOf(edges, 'U::C::ok', 'U::C::n').sourceHandle).toBe('out-right')
    // Branch names (if_ok_yes) read as the outcome only.
    expect(edges.find((e) => e.target === 'U::C::y')?.label).toBe('yes')
    expect(edges.find((e) => e.target === 'U::C::n')?.label).toBe('else')
  })

  it('draws a loop back on the right side, from the later step into the earlier one', () => {
    const sem = flowModel(
      [['start', 'start'], ['a', null], ['b', null]],
      [['start', 'a'], ['a', 'b'], ['b', 'a']],
    )
    const { edges } = buildUseCaseFlow('U::C', sem)
    expect(endsOf(edges, 'U::C::b', 'U::C::a')).toEqual({
      sourceHandle: 'out',
      targetHandle: 'in-right',
      type: 'smoothstep',
      feedback: true,
    })
    expect(endsOf(edges, 'U::C::a', 'U::C::b').feedback).toBe(false)
  })

  it('loops from a decision on its right side and sends the other branch down', () => {
    const sem = flowModel(
      [
        ['start', 'start'],
        ['transfer', null],
        ['report', null],
        ['pluggedIn', 'decide'],
        ['unplug', null],
        ['done', 'done'],
      ],
      [
        ['start', 'transfer'],
        ['transfer', 'report'],
        ['report', 'pluggedIn'],
        ['pluggedIn', 'transfer', 'if_pluggedIn_yes'],
        ['pluggedIn', 'unplug', 'if_pluggedIn_else'],
        ['unplug', 'done'],
      ],
    )
    const { edges } = buildUseCaseFlow('U::C', sem)
    expect(endsOf(edges, 'U::C::pluggedIn', 'U::C::transfer')).toEqual({
      sourceHandle: 'out-right',
      targetHandle: 'in-right',
      type: 'smoothstep',
      feedback: true,
    })
    expect(endsOf(edges, 'U::C::pluggedIn', 'U::C::unplug')).toMatchObject({
      sourceHandle: 'out-bottom',
      targetHandle: 'top',
      feedback: false,
    })
  })

  it('does not take converging branches for a loop', () => {
    const { edges } = buildUseCaseFlow('P::Pay', {
      ...payWithDone(),
    })
    for (const e of edges) {
      expect((e.data as { feedback?: boolean } | undefined)?.feedback ?? false).toBe(false)
    }
    expect(endsOf(edges, 'P::Pay::stepD', 'P::Pay::done')).toMatchObject({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
  })

  it('gives expanded case steps top and bottom ports too', () => {
    const { edges } = buildUseCaseFlow('P::Pay', payWithDone())
    const chain = edges.filter((e) => e.id.startsWith('flow-'))
    expect(chain.length).toBeGreaterThan(0)
    for (const e of chain) {
      expect(e.sourceHandle).toBe('bottom')
      expect(e.targetHandle === 'top' || e.targetHandle === 'in-top').toBe(true)
    }
  })
})

/** The Pay use case with both branches converging on done. */
function payWithDone(): Record<string, SemanticElement> {
  const sem: Record<string, SemanticElement> = {}
  const add = (e: SemanticElement) => {
    sem[e.id] = e
  }
  add(el({ id: 'P::Pay', kind: 'useCase', name: 'Pay' }))
  add(el({ id: 'P::Pay::start', kind: 'action', name: 'start', parentId: 'P::Pay', typeRef: 'start' }))
  add(
    el({
      id: 'P::Pay::scenarioA',
      kind: 'action',
      name: 'scenarioA',
      parentId: 'P::Pay',
      typeRef: 'scenarioA',
      metadataKeywords: ['perform'],
    }),
  )
  add(el({ id: 'P::scenarioA', kind: 'case', name: 'scenarioA', typeRef: 'CaseScenario' }))
  add(el({ id: 'P::scenarioA::doA', kind: 'action', name: 'doA', parentId: 'P::scenarioA' }))
  add(el({ id: 'P::Pay::chooseC', kind: 'action', name: 'chooseC', parentId: 'P::Pay', typeRef: 'decide' }))
  add(el({ id: 'P::Pay::stepC', kind: 'action', name: 'stepC', parentId: 'P::Pay' }))
  add(el({ id: 'P::Pay::stepD', kind: 'action', name: 'stepD', parentId: 'P::Pay' }))
  add(el({ id: 'P::Pay::done', kind: 'action', name: 'done', parentId: 'P::Pay', typeRef: 'done' }))
  const succ = (id: string, s: string, t: string) =>
    add(el({ id: `P::Pay::${id}`, kind: 'succession', name: id, parentId: 'P::Pay', sourceId: s, targetId: t }))
  succ('succ1', 'P::Pay::start', 'P::Pay::scenarioA')
  succ('succ2', 'P::Pay::scenarioA', 'P::Pay::chooseC')
  succ('if_chooseC_yes', 'P::Pay::chooseC', 'P::Pay::stepC')
  succ('if_chooseC_else', 'P::Pay::chooseC', 'P::Pay::stepD')
  succ('succ3', 'P::Pay::stepC', 'P::Pay::done')
  succ('succ4', 'P::Pay::stepD', 'P::Pay::done')
  return sem
}

type Box = { cx: number; top: number; bottom: number; left: number; right: number }

function boxes(nodes: ReturnType<typeof buildUseCaseFlow>['nodes']): Record<string, Box> {
  const out: Record<string, Box> = {}
  for (const n of nodes) {
    const w = Number(n.style?.width)
    const h = Number(n.style?.height)
    const name = n.id.split('::').pop()!
    out[name] = {
      cx: n.position.x + w / 2,
      top: n.position.y,
      bottom: n.position.y + h,
      left: n.position.x,
      right: n.position.x + w,
    }
  }
  return out
}

/** StartVehicle: two decisions, each branch ends in done. */
const startVehicle = () =>
  flowModel(
    [
      ['start', 'start'],
      ['pressStart', null],
      ['brakeHeld', 'decide'],
      ['checkKey', null],
      ['askForBrake', null],
      ['keyApproved', 'decide'],
      ['showReady', null],
      ['rejectKey', null],
      ['done', 'done'],
    ],
    [
      ['start', 'pressStart'],
      ['pressStart', 'brakeHeld'],
      ['brakeHeld', 'checkKey', 'if_brakeHeld_yes'],
      ['brakeHeld', 'askForBrake', 'if_brakeHeld_else'],
      ['checkKey', 'keyApproved'],
      ['keyApproved', 'showReady', 'if_keyApproved_yes'],
      ['keyApproved', 'rejectKey', 'if_keyApproved_else'],
      ['showReady', 'done'],
      ['rejectKey', 'done'],
      ['askForBrake', 'done'],
    ],
  )

describe('buildUseCaseFlow layout', () => {
  it('keeps a flow without branches in one column, top to bottom', () => {
    const sem = flowModel(
      [['start', 'start'], ['a', null], ['b', null], ['done', 'done']],
      [['start', 'a'], ['a', 'b'], ['b', 'done']],
    )
    const b = boxes(buildUseCaseFlow('U::C', sem).nodes)
    const order = ['start', 'a', 'b', 'done']
    for (const name of order) expect(b[name].cx).toBe(b.start.cx)
    for (let i = 1; i < order.length; i++) {
      expect(b[order[i]].top).toBeGreaterThan(b[order[i - 1]].bottom + 20)
    }
  })

  it('puts done last, below every branch', () => {
    const b = boxes(buildUseCaseFlow('U::C', startVehicle()).nodes)
    for (const [name, box] of Object.entries(b)) {
      if (name !== 'done') expect(box.bottom, name).toBeLessThan(b.done.top)
    }
    expect(b.start.top).toBe(Math.min(...Object.values(b).map((x) => x.top)))
  })

  it('places the branches after a decision side by side, yes left of else', () => {
    const b = boxes(buildUseCaseFlow('U::C', startVehicle()).nodes)
    for (const [yes, no] of [
      ['checkKey', 'askForBrake'],
      ['showReady', 'rejectKey'],
    ]) {
      expect(b[yes].right, `${yes} left of ${no}`).toBeLessThan(b[no].left)
      // Same row: they follow the same decision.
      expect(b[yes].top).toBe(b[no].top)
    }
    // A step follows its decision on the branch's side.
    expect(b.keyApproved.cx).toBe(b.checkKey.cx)
  })

  it('never stacks two steps on each other', () => {
    const list = Object.entries(boxes(buildUseCaseFlow('U::C', startVehicle()).nodes))
    for (const [n1, a] of list) {
      for (const [n2, c] of list) {
        if (n1 >= n2) continue
        const apart = a.right < c.left || c.right < a.left || a.bottom < c.top || c.bottom < a.top
        expect(apart, `${n1} / ${n2}`).toBe(true)
      }
    }
  })

  it('draws a loop on the right and the way out of the loop straight down', () => {
    // Drive: ... brake, then if arrived then arrive else accelerate (loop).
    const sem = flowModel(
      [
        ['start', 'start'],
        ['accelerate', null],
        ['brake', null],
        ['arrived', 'decide'],
        ['arrive', null],
        ['done', 'done'],
      ],
      [
        ['start', 'accelerate'],
        ['accelerate', 'brake'],
        ['brake', 'arrived'],
        ['arrived', 'arrive', 'if_arrived_yes'],
        ['arrived', 'accelerate', 'if_arrived_else'],
        ['arrive', 'done'],
      ],
    )
    const { nodes, edges } = buildUseCaseFlow('U::C', sem)
    const b = boxes(nodes)
    expect(endsOf(edges, 'U::C::arrived', 'U::C::accelerate')).toMatchObject({
      sourceHandle: 'out-right',
      targetHandle: 'in-right',
      feedback: true,
    })
    expect(b.accelerate.bottom).toBeLessThan(b.arrived.top)
    // The loop does not push the remaining step aside.
    expect(endsOf(edges, 'U::C::arrived', 'U::C::arrive').sourceHandle).toBe('out-bottom')
    for (const name of ['accelerate', 'brake', 'arrived', 'arrive', 'done']) {
      expect(b[name].cx, name).toBe(b.start.cx)
    }
    expect(b.done.top).toBeGreaterThan(b.arrive.bottom)
  })

  it('loops on yes too: PlayMedia picks another title, else stops below', () => {
    const sem = flowModel(
      [
        ['start', 'start'],
        ['selectTitle', null],
        ['playTitle', null],
        ['anotherTitle', 'decide'],
        ['stopPlayback', null],
        ['done', 'done'],
      ],
      [
        ['start', 'selectTitle'],
        ['selectTitle', 'playTitle'],
        ['playTitle', 'anotherTitle'],
        ['anotherTitle', 'selectTitle', 'if_anotherTitle_yes'],
        ['anotherTitle', 'stopPlayback', 'if_anotherTitle_else'],
        ['stopPlayback', 'done'],
      ],
    )
    const { nodes, edges } = buildUseCaseFlow('U::C', sem)
    const b = boxes(nodes)
    expect(endsOf(edges, 'U::C::anotherTitle', 'U::C::selectTitle').feedback).toBe(true)
    expect(endsOf(edges, 'U::C::anotherTitle', 'U::C::stopPlayback').sourceHandle).toBe('out-bottom')
    expect(b.stopPlayback.cx).toBe(b.anotherTitle.cx)
    expect(b.done.top).toBeGreaterThan(b.stopPlayback.bottom)
  })
})
