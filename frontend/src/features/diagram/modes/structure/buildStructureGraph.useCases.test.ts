import { describe, expect, it } from 'vitest'
import { buildStructureGraph } from './buildStructureGraph'
import { USE_CASE_H, USE_CASE_W } from '../useCase/useCaseSize'
import type { SemanticElement, ViewPayload } from '../../../../api'

function el(
  id: string,
  kind: string,
  parentId: string | null,
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind,
    name: id.split('::').pop() || id,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...extra,
  } as SemanticElement
}

/**
 * Package P holds use case U (with subject part s, actor a and a part inside
 * the subject), use case V, requirement R and relations to R.
 */
function fixture(
  sizes: Record<string, { width: number; height: number }> = {},
  relations: SemanticElement[] = [],
): ViewPayload {
  const semantic: Record<string, SemanticElement> = {
    P: el('P', 'package', null, {
      children: ['P::U', 'P::V', 'P::R', ...relations.map((r) => r.id)],
    }),
    'P::U': el('P::U', 'useCase', 'P', { children: ['P::U::s', 'P::U::a'] }),
    'P::U::s': el('P::U::s', 'part', 'P::U', {
      metadataKeywords: ['subject'],
      children: ['P::U::s::motor'],
    }),
    'P::U::s::motor': el('P::U::s::motor', 'part', 'P::U::s'),
    'P::U::a': el('P::U::a', 'actor', 'P::U'),
    'P::V': el('P::V', 'useCase', 'P'),
    'P::R': el('P::R', 'requirement', 'P', { shortId: 'R-1' }),
  }
  for (const r of relations) semantic[r.id] = r
  const nodes: ViewPayload['visualization']['nodes'] = {}
  for (const id of Object.keys(semantic)) {
    if (semantic[id].kind === 'package' || semantic[id].sourceId) continue
    nodes[id] = {
      artifactId: id,
      x: 40,
      y: 40,
      width: sizes[id]?.width ?? 200,
      height: sizes[id]?.height ?? 120,
    } as (typeof nodes)[string]
  }
  nodes['P::V'] = { ...nodes['P::V'], x: 400 }
  nodes['P::R'] = { ...nodes['P::R'], x: 800 }
  return {
    view: {
      id: 'P::V1',
      name: 'Trace',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: 4,
    semantic,
    visualization: { nodes, edges: {} },
    subdiagrams: [],
    menus: {},
  } as ViewPayload
}

function build(view: ViewPayload) {
  return buildStructureGraph({
    view,
    onOpenView: () => {},
    onPortMoved: () => {},
    portMoveMode: false,
    showAttributes: false,
    viewMode: 'light',
    onWaypointsChange: () => {},
    onLabelOffsetChange: () => {},
  })
}

const satisfy = (id: string, sourceId: string) =>
  el(id, 'satisfy', 'P', { sourceId, targetId: 'P::R' })

describe('use cases in a general view', () => {
  it('draws only the use case, never its subject, actors or parts', () => {
    const { nodes } = build(fixture())
    const ids = nodes.map((n) => n.id)
    expect(ids).toEqual(expect.arrayContaining(['P::U', 'P::V', 'P::R']))
    expect(ids).not.toContain('P::U::s')
    expect(ids).not.toContain('P::U::a')
    expect(ids).not.toContain('P::U::s::motor')
    expect(nodes.filter((n) => n.parentId === 'P::U')).toEqual([])
    const u = nodes.find((n) => n.id === 'P::U')!
    expect(u.type).toBe('useCase')
    expect(u.style?.background).not.toBe('transparent')
  })

  it('sizes every use case like the use case view, whatever was saved', () => {
    const { nodes } = build(
      fixture({ 'P::U': { width: 600, height: 400 }, 'P::V': { width: 200, height: 120 } }),
    )
    for (const id of ['P::U', 'P::V']) {
      const n = nodes.find((x) => x.id === id)!
      expect(n.style?.width).toBe(USE_CASE_W)
      expect(n.style?.height).toBe(USE_CASE_H)
    }
  })

  it('lifts a relation from a hidden subject to its use case', () => {
    const { edges } = build(fixture({}, [satisfy('P::sat1', 'P::U::s')]))
    const e = edges.find((x) => x.id === 'P::sat1')
    expect(e).toBeDefined()
    expect(e!.source).toBe('P::U')
    expect(e!.target).toBe('P::R')
    expect((e!.data as { liftedFrom?: string[] }).liftedFrom).toEqual(['P::U::s'])
    // Use case ends bind to the shared boundary anchors.
    expect(e!.sourceHandle).toMatch(/^a-/)
    expect(e!.targetHandle).toMatch(/^target:a-/)
  })

  it('lifts from deeper inside the use case too', () => {
    const { edges } = build(fixture({}, [satisfy('P::sat1', 'P::U::s::motor')]))
    expect(edges.find((x) => x.id === 'P::sat1')?.source).toBe('P::U')
  })

  it('draws one edge when several hidden members relate the same way', () => {
    const { edges } = build(
      fixture({}, [satisfy('P::sat1', 'P::U::s'), satisfy('P::sat2', 'P::U::a')]),
    )
    const lifted = edges.filter((x) => x.source === 'P::U' && x.target === 'P::R')
    expect(lifted).toHaveLength(1)
  })

  it('does not add a lifted copy of a relation the use case already has', () => {
    const { edges } = build(
      fixture({}, [satisfy('P::sat0', 'P::U'), satisfy('P::sat1', 'P::U::s')]),
    )
    const lifted = edges.filter((x) => x.source === 'P::U' && x.target === 'P::R')
    expect(lifted.map((x) => x.id)).toEqual(['P::sat0'])
  })

  it('drops a relation between two members of the same use case', () => {
    const rel = el('P::dep', 'dependency', 'P', {
      sourceId: 'P::U::a',
      targetId: 'P::U::s',
    })
    const { edges } = build(fixture({}, [rel]))
    expect(edges.find((x) => x.id === 'P::dep')).toBeUndefined()
  })
})
