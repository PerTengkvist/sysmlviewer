import { describe, expect, it } from 'vitest'
import { buildActionFlowGraph } from './buildActionFlowGraph'
import type { ViewPayload } from '../../../api'

function fixture(): ViewPayload {
  const root = 'P::BootFlow'
  const mk = (
    id: string,
    name: string,
    kind: 'action' | 'succession',
    extra: Partial<{
      typeRef: string | null
      sourceId: string | null
      targetId: string | null
      children: string[]
    }> = {},
  ) => ({
    id,
    kind,
    name,
    parentId: root,
    typeRef: extra.typeRef ?? null,
    sourceId: extra.sourceId ?? null,
    targetId: extra.targetId ?? null,
    children: extra.children ?? [],
    fileId: 'f',
  })
  return {
    view: {
      id: 'P::V',
      name: 'BootFlowView',
      rootArtifactId: root,
      parentViewId: null,
      typeRef: 'ActionFlowView',
    },
    diagramMode: 'actionFlow',
    semantic: {
      [root]: {
        id: root,
        kind: 'action',
        name: 'BootFlow',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [
          `${root}::start`,
          `${root}::loadApplication`,
          `${root}::testSuccessful`,
          `${root}::ready`,
          `${root}::reportFailure`,
          `${root}::stop`,
          `${root}::s1`,
          `${root}::s2`,
          `${root}::yes`,
          `${root}::no`,
        ],
        fileId: 'f',
      },
      [`${root}::start`]: mk(`${root}::start`, 'start', 'action', { typeRef: 'start' }),
      [`${root}::loadApplication`]: mk(
        `${root}::loadApplication`,
        'loadApplication',
        'action',
      ),
      [`${root}::testSuccessful`]: mk(
        `${root}::testSuccessful`,
        'testSuccessful',
        'action',
        { typeRef: 'decision' },
      ),
      [`${root}::ready`]: mk(`${root}::ready`, 'ready', 'action'),
      [`${root}::reportFailure`]: mk(
        `${root}::reportFailure`,
        'reportFailure',
        'action',
      ),
      [`${root}::stop`]: mk(`${root}::stop`, 'stop', 'action', { typeRef: 'done' }),
      [`${root}::s1`]: mk(`${root}::s1`, 's1', 'succession', {
        sourceId: `${root}::start`,
        targetId: `${root}::loadApplication`,
      }),
      [`${root}::s2`]: mk(`${root}::s2`, 's2', 'succession', {
        sourceId: `${root}::loadApplication`,
        targetId: `${root}::testSuccessful`,
      }),
      [`${root}::yes`]: mk(`${root}::yes`, 'yes', 'succession', {
        sourceId: `${root}::testSuccessful`,
        targetId: `${root}::ready`,
      }),
      [`${root}::no`]: mk(`${root}::no`, 'no', 'succession', {
        sourceId: `${root}::testSuccessful`,
        targetId: `${root}::reportFailure`,
      }),
    },
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildActionFlowGraph', () => {
  it('marks start/decision/done and labels YES/NO branches', () => {
    const { nodes, edges } = buildActionFlowGraph(fixture(), 'light')
    const start = nodes.find((n) => n.id.endsWith('::start'))
    expect(start?.data).toMatchObject({ isStart: true })
    expect(start?.style?.width).toBe(28)

    const decision = nodes.find((n) => n.id.endsWith('::testSuccessful'))
    expect(decision?.data).toMatchObject({
      isDecision: true,
      label: 'Test Successful?',
    })

    const yes = edges.find((e) => e.id.endsWith('::yes'))
    const no = edges.find((e) => e.id.endsWith('::no'))
    expect(yes?.label).toBe('YES')
    expect(yes?.sourceHandle).toBe('out-top')
    expect(yes?.targetHandle).toBe('in')
    expect(no?.label).toBe('NO')
    expect(no?.sourceHandle).toBe('out-bottom')

    const td = buildActionFlowGraph(fixture(), 'light', 'TD')
    const yesTd = td.edges.find((e) => e.id.endsWith('::yes'))
    const noTd = td.edges.find((e) => e.id.endsWith('::no'))
    const intoDecision = td.edges.find((e) => e.target.endsWith('::testSuccessful'))
    expect(yesTd?.sourceHandle).toBe('out-left')
    expect(yesTd?.targetHandle).toBe('top')
    expect(noTd?.sourceHandle).toBe('out-right')
    expect(intoDecision?.targetHandle).toBe('in-top')

    const intoDecisionLr = edges.find((e) => e.target.endsWith('::testSuccessful'))
    expect(intoDecisionLr?.targetHandle).toBe('in-left')
  })
})
