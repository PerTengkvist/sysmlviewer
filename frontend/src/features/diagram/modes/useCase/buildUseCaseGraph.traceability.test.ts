import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { SemanticElement, ViewPayload } from '../../../../api'
import { buildUseCaseGraph } from './buildUseCaseGraph'

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
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    metadataKeywords: [],
    fileId: 'f',
    ...extra,
  }
}

/** `view T : UseCaseView { expose T::UseCases; expose T::Requirements; }` */
function traceView(
  overrides: Partial<ViewPayload> = {},
  extra: SemanticElement[] = [],
): ViewPayload {
  const els = [
    el('T', 'package'),
    el('T::UseCases', 'package', { parentId: 'T' }),
    el('T::UseCases::Start', 'useCase', { parentId: 'T::UseCases' }),
    el('T::UseCases::Brake', 'useCase', { parentId: 'T::UseCases' }),
    el('T::Requirements', 'package', { parentId: 'T' }),
    el('T::Requirements::PowerModes', 'requirement', {
      parentId: 'T::Requirements',
      shortId: 'REQ-PERF-06',
    }),
    el('T::Requirements::Braking', 'requirement', {
      parentId: 'T::Requirements',
    }),
    el('T::Requirements::Braking::Distance', 'requirement', {
      parentId: 'T::Requirements::Braking',
    }),
    el('T::UseCases::Start::objective_1', 'dependency', {
      parentId: 'T::UseCases::Start',
      sourceId: 'T::UseCases::Start',
      targetId: 'T::Requirements::PowerModes',
      metadataKeywords: ['objective'],
    }),
    el('T::dep2', 'dependency', {
      parentId: 'T',
      sourceId: 'T::UseCases::Brake',
      targetId: 'T::Requirements::Braking',
      metadataKeywords: ['refine'],
    }),
    el('T::sat1', 'satisfy', {
      parentId: 'T',
      sourceId: 'T::UseCases::Brake',
      targetId: 'T::Requirements::Braking::Distance',
    }),
    ...extra,
  ]
  return {
    view: {
      id: 'T::TraceView',
      name: 'TraceView',
      rootArtifactId: 'T::UseCases',
      parentViewId: null,
      typeRef: 'UseCaseView',
    },
    exposeRootIds: ['T::UseCases', 'T::Requirements'],
    diagramMode: 'useCase',
    semantic: Object.fromEntries(els.map((e) => [e.id, e])),
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
    ...overrides,
  } as ViewPayload
}

const ofType = (nodes: Node[], type: string) =>
  nodes.filter((n) => n.type === type).map((n) => n.id).sort()

describe('buildUseCaseGraph traceability', () => {
  it('draws requirements from a second expose as requirement nodes', () => {
    const { nodes } = buildUseCaseGraph(traceView(), 'light')
    expect(ofType(nodes, 'useCase')).toEqual([
      'T::UseCases::Brake',
      'T::UseCases::Start',
    ])
    expect(ofType(nodes, 'requirement')).toEqual([
      'T::Requirements::Braking',
      'T::Requirements::Braking::Distance',
      'T::Requirements::PowerModes',
    ])
    const req = nodes.find((n) => n.id === 'T::Requirements::PowerModes')!
    expect((req.data as { headerText?: string }).headerText).toContain('PowerModes')
    expect(req.parentId).toBeUndefined()
  })

  it('draws objective, refine and satisfy edges with their stereotype', () => {
    const { edges } = buildUseCaseGraph(traceView(), 'light')
    const byId = new Map(edges.map((e) => [e.id, e]))
    expect(byId.get('T::UseCases::Start::objective_1')?.label).toBe('«objective»')
    expect(byId.get('T::dep2')?.label).toBe('«refine»')
    expect(byId.get('T::sat1')?.label).toBe('«satisfy»')
    expect(byId.get('T::sat1')?.target).toBe('T::Requirements::Braking::Distance')
  })

  it('gives each requirement exactly one anchor per traced relation', () => {
    const { nodes, edges } = buildUseCaseGraph(traceView(), 'light')
    const req = nodes.find((n) => n.id === 'T::Requirements::Braking')!
    const anchors = (req.data as { anchors: { id: string }[] }).anchors
    expect(anchors.map((a) => a.id)).toEqual(['rel:T::dep2'])
    const edge = edges.find((e) => e.id === 'T::dep2')!
    expect(edge.targetHandle).toBe('target:rel:T::dep2')
  })

  it('places requirements to the right of the use cases, without overlap', () => {
    const { nodes } = buildUseCaseGraph(traceView(), 'light')
    const right = (n: Node) => n.position.x + Number(n.style?.width)
    const useCaseRight = Math.max(
      ...nodes.filter((n) => n.type === 'useCase').map(right),
    )
    const reqs = nodes.filter((n) => n.type === 'requirement')
    for (const r of reqs) expect(r.position.x).toBeGreaterThan(useCaseRight)
    const ys = reqs.map((r) => [r.position.y, r.position.y + Number(r.style?.height)])
    ys.sort((a, b) => a[0]! - b[0]!)
    for (let i = 1; i < ys.length; i++) expect(ys[i]![0]).toBeGreaterThanOrEqual(ys[i - 1]![1]!)
  })

  it('keeps a saved requirement position', () => {
    const view = traceView({
      visualization: {
        nodes: {
          'T::Requirements::PowerModes': {
            artifactId: 'T::Requirements::PowerModes',
            x: 900,
            y: 450,
            width: 220,
            height: 100,
          },
        },
        edges: {},
      },
    } as unknown as Partial<ViewPayload>)
    const req = buildUseCaseGraph(view, 'light').nodes.find(
      (n) => n.id === 'T::Requirements::PowerModes',
    )!
    expect(req.position).toEqual({ x: 900, y: 450 })
    expect(req.style?.width).toBe(220)
  })

  it('without exposeRootIds still shows only the first expose', () => {
    const { nodes } = buildUseCaseGraph(
      traceView({ exposeRootIds: undefined }),
      'light',
    )
    expect(ofType(nodes, 'useCase')).toHaveLength(2)
    expect(ofType(nodes, 'requirement')).toEqual([])
  })

  it('shows use cases from every exposed package', () => {
    const view = traceView(
      { exposeRootIds: ['T::UseCases', 'T::More'] },
      [
        el('T::More', 'package', { parentId: 'T' }),
        el('T::More::Park', 'useCase', { parentId: 'T::More' }),
      ],
    )
    expect(ofType(buildUseCaseGraph(view, 'light').nodes, 'useCase')).toEqual([
      'T::More::Park',
      'T::UseCases::Brake',
      'T::UseCases::Start',
    ])
  })
})

describe('buildUseCaseGraph requirement columns', () => {
  it('wraps many requirements into side-by-side columns without overlap', () => {
    const extra: SemanticElement[] = []
    for (let i = 0; i < 14; i++) {
      extra.push(
        el(`T::Requirements::R${String(i).padStart(2, '0')}`, 'requirement', {
          parentId: 'T::Requirements',
        }),
      )
    }
    const { nodes } = buildUseCaseGraph(traceView({}, extra), 'light')
    const reqs = nodes.filter((n) => n.type === 'requirement')
    expect(reqs).toHaveLength(17)
    const xs = new Set(reqs.map((r) => r.position.x))
    expect(xs.size).toBeGreaterThan(1)
    const boxes = reqs.map((r) => ({
      x: r.position.x,
      y: r.position.y,
      w: Number(r.style?.width),
      h: Number(r.style?.height),
    }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
    }
  })
})
