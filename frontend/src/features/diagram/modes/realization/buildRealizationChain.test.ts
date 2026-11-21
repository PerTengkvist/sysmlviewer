import { describe, expect, it } from 'vitest'
import type { ChainEdge, ChainRole, SemanticElement, ViewPayload } from '../../../../api'
import {
  buildRealizationChain,
  countCrossings,
  CHAIN_COLUMN_X,
  orderColumns,
} from './buildRealizationChain'

function el(id: string, kind: SemanticElement['kind'], extra: Partial<SemanticElement> = {}): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop() ?? id,
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: null,
    ...extra,
  }
}

type Fixture = {
  roles: Record<string, ChainRole>
  edges: ChainEdge[]
  positions?: Record<string, { x: number; y: number }>
}

function payload({ roles, edges, positions = {} }: Fixture): ViewPayload {
  const kindOf: Record<ChainRole, SemanticElement['kind']> = {
    useCase: 'useCase',
    function: 'part',
    node: 'part',
    part: 'part',
  }
  return {
    view: { id: 'v', name: 'Chain', rootArtifactId: 'UC1', parentViewId: null, typeRef: 'AllocationView' },
    diagramMode: 'realizationChain',
    semantic: Object.fromEntries(
      Object.entries(roles).map(([id, role]) => [id, el(id, kindOf[role], { isDefinition: role === 'function' })]),
    ),
    visualization: {
      nodes: Object.fromEntries(
        Object.keys(roles).map((id) => [
          id,
          positions[id]
            ? { artifactId: id, ...positions[id], width: 200, height: 56 }
            : { artifactId: id },
        ]),
      ) as ViewPayload['visualization']['nodes'],
      edges: {},
    },
    subdiagrams: [],
    menus: {},
    chainRoles: roles,
    chainEdges: edges,
    chainLabels: Object.fromEntries(Object.keys(roles).map((id) => [id, id.toUpperCase()])),
  } as ViewPayload
}

const edge = (
  source: string,
  target: string,
  kind: ChainEdge['kind'],
  precision: ChainEdge['precision'] = 'step',
): ChainEdge => ({ source, target, kind, precision, viaInclude: false })

// Two use cases, two functions, three nodes, two parts. The model order puts F2
// first, which crosses the straight order: the barycenter pass has to repair it.
const FIXTURE: Fixture = {
  roles: { UC1: 'useCase', UC2: 'useCase', F2: 'function', F1: 'function', N1: 'node', N2: 'node', N3: 'node', P1: 'part', P2: 'part' },
  edges: [
    edge('F1', 'UC1', 'refine'),
    edge('F2', 'UC2', 'refine', 'coarse'),
    edge('F1', 'N1', 'owns'),
    edge('F1', 'N2', 'owns'),
    edge('F2', 'N3', 'owns'),
    edge('N1', 'P1', 'allocate'),
    edge('N2', 'P1', 'allocate'),
    edge('N3', 'P2', 'allocate'),
  ],
}

const build = (f: Fixture, opts: { ignoreSaved?: boolean } = {}) =>
  buildRealizationChain({ view: payload(f), viewMode: 'light', ...opts })

describe('buildRealizationChain', () => {
  it('puts the four roles in four columns with a strictly rising x', () => {
    const { nodes } = build(FIXTURE)
    const xOf = (id: string) => nodes.find((n) => n.id === id)!.position.x
    expect(xOf('UC1')).toBe(CHAIN_COLUMN_X.useCase)
    expect(xOf('F1')).toBe(CHAIN_COLUMN_X.function)
    expect(xOf('N1')).toBe(CHAIN_COLUMN_X.node)
    expect(xOf('P1')).toBe(CHAIN_COLUMN_X.part)
    const xs = [xOf('UC1'), xOf('F1'), xOf('N1'), xOf('P1')]
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
    expect(new Set(xs).size).toBe(4)
    // Same column, same x.
    expect(xOf('UC2')).toBe(xOf('UC1'))
    expect(xOf('N3')).toBe(xOf('N1'))
  })

  it('shows the label from the payload and the element type', () => {
    const { nodes } = build(FIXTURE)
    const uc = nodes.find((n) => n.id === 'UC1')!
    expect(uc.type).toBe('chain')
    expect(uc.data).toMatchObject({ label: 'UC1', role: 'useCase', typeLabel: 'use case' })
    expect(nodes.find((n) => n.id === 'F1')!.data).toMatchObject({ typeLabel: 'part def' })
  })

  it('orders the rows by barycenter, so the fixture has no crossings', () => {
    const naive = [['UC1', 'UC2'], ['F2', 'F1'], ['N1', 'N2', 'N3'], ['P1', 'P2']]
    expect(countCrossings(naive, FIXTURE.edges)).toBeGreaterThan(0)
    const columns = orderColumns(naive, FIXTURE.edges)
    expect(countCrossings(columns, FIXTURE.edges)).toBe(0)
    const { nodes } = build(FIXTURE)
    const y = (id: string) => nodes.find((n) => n.id === id)!.position.y
    expect(y('F1')).toBeLessThan(y('F2'))
  })

  it('draws refine dashed with its label and precision, explicit thinner', () => {
    const f: Fixture = { ...FIXTURE, edges: [...FIXTURE.edges, edge('F1', 'UC2', 'refine', 'explicit')] }
    const { edges } = build(f)
    const step = edges.find((e) => e.source === 'F1' && e.target === 'UC1')!
    expect(step.label).toBe('«refine» step')
    expect(step.style?.strokeDasharray).toBeTruthy()
    expect(step.markerEnd).toBeTruthy()
    const explicit = edges.find((e) => e.source === 'F1' && e.target === 'UC2')!
    expect(explicit.label).toBe('«refine» explicit')
    expect(Number(explicit.style?.strokeWidth)).toBeLessThan(Number(step.style?.strokeWidth))
    expect(explicit.data).toMatchObject({ kind: 'refine', precision: 'explicit' })
  })

  it('draws owns thin and solid without an arrow, and allocate with its label', () => {
    const { edges } = build(FIXTURE)
    const owns = edges.find((e) => e.source === 'F1' && e.target === 'N1')!
    expect(owns.label).toBeUndefined()
    expect(owns.markerEnd).toBeUndefined()
    expect(owns.style?.strokeDasharray).toBeUndefined()
    const allocate = edges.find((e) => e.source === 'N1' && e.target === 'P1')!
    expect(allocate.label).toBe('«allocate»')
    expect(allocate.markerEnd).toBeTruthy()
  })

  it('lets a saved position win over the layout, and redraw ignores it', () => {
    const f: Fixture = { ...FIXTURE, positions: { F1: { x: 1234, y: 567 } } }
    const saved = build(f).nodes.find((n) => n.id === 'F1')!
    expect(saved.position).toEqual({ x: 1234, y: 567 })
    expect(build(f).nodes.find((n) => n.id === 'F2')!.position.x).toBe(CHAIN_COLUMN_X.function)
    const redrawn = build(f, { ignoreSaved: true }).nodes.find((n) => n.id === 'F1')!
    expect(redrawn.position.x).toBe(CHAIN_COLUMN_X.function)
  })

  it('draws an element used by two use cases once', () => {
    const f: Fixture = {
      roles: { UC1: 'useCase', UC2: 'useCase', F1: 'function' },
      edges: [edge('F1', 'UC1', 'refine'), edge('F1', 'UC2', 'refine')],
    }
    const { nodes, edges } = build(f)
    expect(nodes.filter((n) => n.id === 'F1')).toHaveLength(1)
    expect(edges).toHaveLength(2)
  })

  it('draws a node that refines the use case itself with an edge across the function column', () => {
    const f: Fixture = {
      roles: { UC1: 'useCase', N1: 'node', P1: 'part' },
      edges: [edge('N1', 'UC1', 'refine', 'explicit'), edge('N1', 'P1', 'allocate', 'explicit')],
    }
    const { nodes, edges } = build(f)
    expect(nodes.find((n) => n.id === 'N1')!.position.x).toBe(CHAIN_COLUMN_X.node)
    const e = edges.find((x) => x.source === 'N1' && x.target === 'UC1')!
    expect(e.sourceHandle).toBe('l-out')
    expect(e.targetHandle).toBe('r-in')
  })

  it('skips an edge whose end is not in the payload', () => {
    const f: Fixture = { roles: { UC1: 'useCase' }, edges: [edge('GHOST', 'UC1', 'refine')] }
    expect(build(f).edges).toHaveLength(0)
  })

  it('is empty without a payload for the chain', () => {
    const view = { ...payload(FIXTURE), chainRoles: undefined, chainEdges: undefined } as ViewPayload
    expect(buildRealizationChain({ view, viewMode: 'light' })).toEqual({ nodes: [], edges: [] })
  })
})
