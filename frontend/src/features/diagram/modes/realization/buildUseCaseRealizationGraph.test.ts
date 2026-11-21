import type { Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { UseCaseRealizationLayout } from '../../../../api'
import {
  LANE_GAP,
  buildUseCaseRealizationGraph,
  layoutAfterDrop,
  layoutAfterResize,
  packLanes,
} from './buildUseCaseRealizationGraph'
import { AUTH, DRIVER, FLOW, IMMO, SEC, UC, VC, el, fixture, fstep, step, succ } from './realizationFixture.testutil'

type Opts = Parameters<typeof fixture>[0]

function build(layout?: UseCaseRealizationLayout | null, opts?: Opts) {
  const view = fixture(opts)
  view.useCaseRealizationLayout = layout ?? null
  return buildUseCaseRealizationGraph({ view, viewMode: 'light' })
}
const byId = (nodes: Node[], id: string) => nodes.find((n) => n.id === id)!
const lane = (nodes: Node[], laneId: string) => byId(nodes, `lane:${laneId}`)
const width = (n: Node) => Number(n.style?.width)
const centre = (n: Node) => n.position.x + width(n) / 2

describe('mode and lanes', () => {
  it('opens in whitebox: one lane per actor and function node, then system, with rising x', () => {
    const g = build()
    expect(g.mode).toBe('whitebox')
    expect(g.order).toEqual([DRIVER, AUTH, IMMO, 'system'])
    const xs = g.order.map((l) => lane(g.nodes, l).position.x)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1])
  })

  it('takes the lane mode from the saved layout', () => {
    expect(build({ lanes: 'blackbox' }).order).toEqual([DRIVER, 'system'])
    expect(build({ lanes: 'logical' }).order).toEqual([DRIVER, VC, 'system'])
  })

  it('packs the lanes with a small gap, each as wide as its widest node plus a margin', () => {
    const g = build()
    const order = g.order
    for (let i = 1; i < order.length; i++) {
      const a = lane(g.nodes, order[i - 1])
      expect(lane(g.nodes, order[i]).position.x).toBe(a.position.x + width(a) + LANE_GAP)
    }
    for (const l of order) {
      const members = g.nodes.filter((n) => n.type === 'action' && (n.data as { laneId?: string }).laneId === l)
      const widest = Math.max(0, ...members.map(width))
      expect(width(lane(g.nodes, l))).toBeGreaterThanOrEqual(widest + 16)
    }
  })

  it('centres each node in its lane', () => {
    const g = build()
    const n = byId(g.nodes, fstep('checkKeyInCabin'))
    expect(centre(n)).toBeCloseTo(centre(lane(g.nodes, AUTH)), 5)
    expect((n.data as { laneId: string }).laneId).toBe(AUTH)
  })

  it('draws the lane headers on top, with a frame over the lanes of a function', () => {
    const g = build()
    expect((lane(g.nodes, AUTH).data as { label: string }).label).toBe('auth')
    expect((lane(g.nodes, DRIVER).data as { kind: string }).kind).toBe('actor')
    const frames = g.nodes.filter((n) => n.type === 'laneGroup')
    expect(frames).toHaveLength(1)
    const frame = frames[0]
    expect((frame.data as { label: string }).label).toBe('Security')
    const auth = lane(g.nodes, AUTH)
    const immo = lane(g.nodes, IMMO)
    expect(frame.position.x).toBe(auth.position.x)
    expect(frame.position.x + width(frame)).toBe(immo.position.x + width(immo))
    // The header row of the frame sits above the lane headers.
    expect(frame.position.y).toBeLessThan(auth.position.y)
    expect(lane(g.nodes, DRIVER).position.y).toBe(auth.position.y)
    // No frame without a group.
    expect(build({ lanes: 'logical' }).nodes.some((n) => n.type === 'laneGroup')).toBe(false)
  })
})

describe('rows', () => {
  it('sets y by the order of the flow: checkKeyInCabin lies between pressStart and releaseImmobilizer', () => {
    const g = build()
    const y = (id: string) => byId(g.nodes, id).position.y
    expect(y(step('start'))).toBeLessThan(y(step('pressStart')))
    expect(y(step('pressStart'))).toBeLessThan(y(fstep('checkKeyInCabin')))
    expect(y(fstep('checkKeyInCabin'))).toBeLessThan(y(fstep('releaseImmobilizer')))
    expect(y(fstep('releaseImmobilizer'))).toBeLessThan(y(step('done')))
    // The first row is below the lane header.
    expect(y(step('start'))).toBeGreaterThan(lane(g.nodes, AUTH).position.y + 20)
  })

  it('does not count a loop back as a step down', () => {
    const g = build(null, {
      successions: [
        succ(UC, 1, step('start'), step('pressStart')),
        succ(UC, 2, step('pressStart'), step('checkKey')),
        succ(UC, 3, step('checkKey'), step('showReady')),
        succ(UC, 4, step('showReady'), step('pressStart'), 'again'),
        succ(UC, 5, step('showReady'), step('done')),
      ],
    })
    const y = (id: string) => byId(g.nodes, id).position.y
    expect(y(step('pressStart'))).toBeLessThan(y(fstep('checkKeyInCabin')))
    expect(y(fstep('releaseImmobilizer'))).toBeLessThan(y(step('done')))
    expect(g.edges.find((e) => e.id.endsWith('again'))).toBeDefined()
  })

  it('never lets two nodes of one lane overlap, also when the flow branches', () => {
    const guard = `${UC}::ok`
    const g = build(null, {
      extra: [el(guard, 'action', { typeRef: 'decide' })],
      realization: { stepRealizers: {}, unrealizedSteps: [], coarseSteps: {} },
      successions: [
        succ(UC, 1, step('start'), guard),
        succ(UC, 2, guard, step('checkKey'), 'if_ok_yes'),
        succ(UC, 3, guard, step('showReady'), 'if_ok_else'),
        succ(UC, 4, step('checkKey'), step('done')),
        succ(UC, 5, step('showReady'), step('done')),
      ],
    })
    // Both branches sit in the system lane.
    const a = byId(g.nodes, step('checkKey'))
    const b = byId(g.nodes, step('showReady'))
    const [top, bottom] = a.position.y <= b.position.y ? [a, b] : [b, a]
    expect(bottom.position.y).toBeGreaterThanOrEqual(top.position.y + Number(top.style?.height))
  })

  it('draws the edges top-down with the branch labels', () => {
    const g = build()
    const edge = g.edges.find((e) => e.source === step('pressStart'))!
    expect(edge.target).toBe(fstep('checkKeyInCabin'))
    expect(edge.sourceHandle).toBe('bottom')
    expect(edge.targetHandle).toBe('top')
  })
})


describe('markers', () => {
  it('marks an unrealized step (red frame, warning) and a coarse step (dashed)', () => {
    const g = build()
    const lone = byId(g.nodes, step('askForBrake')).data as { unrealized?: boolean; label: string }
    expect(lone.unrealized).toBe(true)
    const coarse = build(null, {
      realization: {
        stepRealizers: {},
        coarseSteps: { [step('checkKey')]: [FLOW] },
        realizerNodes: { [FLOW]: [AUTH] },
        realizerFunctions: { [FLOW]: SEC },
        unrealizedSteps: [],
      },
    })
    expect((byId(coarse.nodes, step('checkKey')).data as { coarse?: boolean }).coarse).toBe(true)
    expect((byId(g.nodes, fstep('checkKeyInCabin')).data as { coarse?: boolean }).coarse).toBeFalsy()
  })

  it('shows the +n badge and keeps the element a click selects', () => {
    const g = build(null, {
      realization: {
        realizerNodes: { [fstep('checkKeyInCabin')]: [AUTH, IMMO], [fstep('releaseImmobilizer')]: [IMMO] },
      },
    })
    const n = byId(g.nodes, fstep('checkKeyInCabin')).data as { badge?: string; artifactId: string }
    expect(n.badge).toBe('+1')
    expect(n.artifactId).toBe(fstep('checkKeyInCabin'))
  })
})

describe('saved layout', () => {
  it('orders the lanes by the saved order of the mode; unknown ids go, new lanes follow', () => {
    const g = build({ order: { whitebox: ['system', 'gone', IMMO, DRIVER] } })
    expect(g.order).toEqual(['system', IMMO, DRIVER, AUTH])
    // The order of another mode is not used.
    expect(build({ lanes: 'logical', order: { whitebox: ['system', IMMO] } }).order).toEqual([DRIVER, VC, 'system'])
  })

  it('uses a saved width, but never narrower than the widest node', () => {
    const wide = build({ widths: { [AUTH]: 400 } })
    expect(width(lane(wide.nodes, AUTH))).toBe(400)
    const narrow = build({ widths: { [AUTH]: 10 } })
    expect(width(lane(narrow.nodes, AUTH))).toBeGreaterThan(100)
    const node = byId(narrow.nodes, fstep('checkKeyInCabin'))
    expect(width(lane(narrow.nodes, AUTH))).toBeGreaterThanOrEqual(width(node))
  })

  it('moves a lane with its nodes when the order changes', () => {
    const before = build()
    const after = build({ order: { whitebox: [DRIVER, IMMO, AUTH, 'system'] } })
    const n = fstep('checkKeyInCabin')
    expect(byId(after.nodes, n).position.x).toBeGreaterThan(byId(before.nodes, n).position.x)
    expect(centre(byId(after.nodes, n))).toBeCloseTo(centre(lane(after.nodes, AUTH)), 5)
  })
})

describe('dragging', () => {
  it('lets a lane move sideways but keeps the nodes fixed', () => {
    const g = build()
    expect(lane(g.nodes, AUTH).draggable).toBe(true)
    expect(byId(g.nodes, fstep('checkKeyInCabin')).draggable).toBe(false)
    expect(byId(g.nodes, step('start')).draggable).toBe(false)
    expect(g.nodes.find((n) => n.type === 'laneGroup')?.draggable).toBe(false)
  })

  it('keeps a double click on a step from zooming the canvas (a node that cannot be dragged must say nopan)', () => {
    const g = build()
    for (const n of g.nodes.filter((n) => n.type === 'action')) expect(n.className).toContain('nopan')
  })

  it('stores the order of the mode after a drop, and keeps the other fields', () => {
    const start: UseCaseRealizationLayout = {
      lanes: 'whitebox',
      order: { logical: ['a'] },
      widths: { [AUTH]: 200 },
    }
    const next = layoutAfterDrop(start, 'whitebox', [DRIVER, AUTH, IMMO, 'system'], AUTH, 500, {
      [DRIVER]: 100,
      [IMMO]: 300,
      system: 600,
    })
    expect(next).toEqual({
      lanes: 'whitebox',
      order: { logical: ['a'], whitebox: [DRIVER, IMMO, AUTH, 'system'] },
      widths: { [AUTH]: 200 },
    })
  })

  it('stores a width from a resize, not below the minimum', () => {
    expect(layoutAfterResize({ lanes: 'logical' }, AUTH, 321.4, 150)).toEqual({
      lanes: 'logical',
      widths: { [AUTH]: 321 },
    })
    expect(layoutAfterResize(null, AUTH, 90, 150)).toEqual({ widths: { [AUTH]: 150 } })
  })

  it('packs by order and widths', () => {
    expect(packLanes(['b', 'a'], { a: 100, b: 50 }, 10, 4)).toEqual({ b: 10, a: 64 })
  })
})
