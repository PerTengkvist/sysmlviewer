import { describe, expect, it } from 'vitest'
import { buildStructureGraph } from './buildStructureGraph'
import type { ViewPayload } from '../../../../api'

/**
 * A view can expose a second root from another package (for example
 * `expose Functions; expose LogicalArchitecture::Car;`). The backend then
 * sends the allocation targets without their parent. They must still be drawn
 * as top-level nodes so the allocation edges have somewhere to land.
 */
function fixture(): ViewPayload {
  return {
    view: {
      id: 'F::V',
      name: 'Alloc',
      rootArtifactId: 'F',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: 3,
    semantic: {
      F: {
        id: 'F',
        kind: 'package',
        name: 'F',
        parentId: null,
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['F::Fn', 'F::alloc1'],
        fileId: 'f',
      },
      'F::Fn': {
        id: 'F::Fn',
        kind: 'part',
        name: 'Fn',
        parentId: 'F',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['F::Fn::entity'],
        fileId: 'f',
      },
      'F::Fn::entity': {
        id: 'F::Fn::entity',
        kind: 'part',
        name: 'entity',
        parentId: 'F::Fn',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      // Parent `L::Car` is not part of the payload.
      'L::Car::controller': {
        id: 'L::Car::controller',
        kind: 'part',
        name: 'controller',
        parentId: 'L::Car',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'g',
      },
      'F::alloc1': {
        id: 'F::alloc1',
        kind: 'allocation',
        name: 'alloc1',
        parentId: 'F',
        typeRef: null,
        sourceId: 'F::Fn::entity',
        targetId: 'L::Car::controller',
        children: [],
        fileId: 'f',
      },
    },
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildStructureGraph with a second exposed root', () => {
  it('draws orphaned parts as top-level nodes and keeps their allocation edges', () => {
    const { nodes, edges } = buildStructureGraph({
      view: fixture(),
      viewMode: 'light',
    })
    const ids = nodes.map((n) => n.id)
    expect(ids).toContain('F::Fn')
    expect(ids).toContain('F::Fn::entity')
    expect(ids).toContain('L::Car::controller')
    const orphan = nodes.find((n) => n.id === 'L::Car::controller')
    expect(orphan?.parentId).toBeUndefined()
    const alloc = edges.find((e) => e.id === 'F::alloc1')
    expect(alloc).toBeDefined()
    expect(alloc?.source).toBe('F::Fn::entity')
    expect(alloc?.target).toBe('L::Car::controller')
  })

  it('places an orphaned package beside a whitebox root part, with its parts nested', () => {
    const f = fixture()
    f.view.rootArtifactId = 'F::Fn'
    f.semantic['F::Fn'].parentId = null
    delete f.semantic['F']
    delete f.semantic['F::alloc1']
    f.semantic['L::Counterparts'] = {
      id: 'L::Counterparts',
      kind: 'package',
      name: 'Counterparts',
      parentId: 'L',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: ['L::Counterparts::controller'],
      fileId: 'g',
    }
    f.semantic['L::Counterparts::controller'] = {
      ...f.semantic['L::Car::controller'],
      id: 'L::Counterparts::controller',
      parentId: 'L::Counterparts',
    }
    delete f.semantic['L::Car::controller']
    f.semantic['F::Fn::dep1'] = {
      id: 'F::Fn::dep1',
      kind: 'dependency',
      name: 'dep1',
      parentId: 'F::Fn',
      typeRef: null,
      sourceId: 'F::Fn::entity',
      targetId: 'L::Counterparts::controller',
      children: [],
      fileId: 'f',
      metadataKeywords: ['implements'],
    }
    const { nodes, edges } = buildStructureGraph({ view: f, viewMode: 'light' })
    const pkg = nodes.find((n) => n.id === 'L::Counterparts')
    const part = nodes.find((n) => n.id === 'L::Counterparts::controller')
    expect(pkg).toBeDefined()
    expect(pkg?.parentId).toBeUndefined()
    expect(part?.parentId).toBe('L::Counterparts')
    expect(edges.find((e) => e.id === 'F::Fn::dep1')).toBeDefined()
  })
})
