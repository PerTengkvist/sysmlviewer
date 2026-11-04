import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../../../api'

function nestedPortSemantic(): Record<string, SemanticElement> {
  return {
    'P::System': {
      id: 'P::System',
      kind: 'part',
      name: 'System',
      parentId: 'P',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [
        'P::System::a',
        'P::System::b',
        'P::System::c1',
        'P::System::bnd',
        'P::System::conn',
      ],
      fileId: 'f1',
    },
    'P::System::a': {
      id: 'P::System::a',
      kind: 'part',
      name: 'a',
      parentId: 'P::System',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: ['P::System::a::layered_port'],
      fileId: 'f1',
    },
    'P::System::b': {
      id: 'P::System::b',
      kind: 'part',
      name: 'b',
      parentId: 'P::System',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: ['P::System::b::layered_port'],
      fileId: 'f1',
    },
    'P::System::c1': {
      id: 'P::System::c1',
      kind: 'part',
      name: 'c1',
      parentId: 'P::System',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: ['P::System::c1::l1p'],
      fileId: 'f1',
    },
    'P::System::a::layered_port': {
      id: 'P::System::a::layered_port',
      kind: 'port',
      name: 'layered_port',
      parentId: 'P::System::a',
      typeRef: 'hport',
      sourceId: null,
      targetId: null,
      children: [
        'P::System::a::layered_port::hport_l1',
        'P::System::a::layered_port::hport_l2',
      ],
      fileId: 'f1',
    },
    'P::System::a::layered_port::hport_l1': {
      id: 'P::System::a::layered_port::hport_l1',
      kind: 'port',
      name: 'hport_l1',
      parentId: 'P::System::a::layered_port',
      typeRef: 'l1',
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
    },
    'P::System::a::layered_port::hport_l2': {
      id: 'P::System::a::layered_port::hport_l2',
      kind: 'port',
      name: 'hport_l2',
      parentId: 'P::System::a::layered_port',
      typeRef: 'l2',
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
    },
    'P::System::b::layered_port': {
      id: 'P::System::b::layered_port',
      kind: 'port',
      name: 'layered_port',
      parentId: 'P::System::b',
      typeRef: 'hport',
      sourceId: null,
      targetId: null,
      children: ['P::System::b::layered_port::hport_l1'],
      fileId: 'f1',
    },
    'P::System::b::layered_port::hport_l1': {
      id: 'P::System::b::layered_port::hport_l1',
      kind: 'port',
      name: 'hport_l1',
      parentId: 'P::System::b::layered_port',
      typeRef: 'l1',
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
    },
    'P::System::c1::l1p': {
      id: 'P::System::c1::l1p',
      kind: 'port',
      name: 'l1p',
      parentId: 'P::System::c1',
      typeRef: 'l1',
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
    },
    'P::System::bnd': {
      id: 'P::System::bnd',
      kind: 'binding',
      name: 'bnd',
      parentId: 'P::System',
      typeRef: null,
      sourceId: 'P::System::a::layered_port::hport_l1',
      targetId: 'P::System::c1::l1p',
      children: [],
      fileId: 'f1',
    },
    'P::System::conn': {
      id: 'P::System::conn',
      kind: 'connection',
      name: 'conn',
      parentId: 'P::System',
      typeRef: null,
      sourceId: 'P::System::a::layered_port::hport_l1',
      targetId: 'P::System::b::layered_port::hport_l1',
      children: [],
      fileId: 'f1',
    },
  }
}

function viewOf(semantic: Record<string, SemanticElement>): ViewPayload {
  return {
    view: {
      id: 'v',
      name: 'V',
      rootArtifactId: 'P::System',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'whitebox',
    hierarchicalLevels: 2,
    semantic,
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildStructureGraph nested ports', () => {
  it('flattens leaf nested ports onto the owning part as handles', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { nodes } = buildStructureGraph({
      view: viewOf(semantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })

    const a = nodes.find((n) => n.id === 'P::System::a')
    const ports = (a?.data as { ports?: { id: string }[] })?.ports || []
    const ids = ports.map((p) => p.id)
    expect(ids).toContain('P::System::a::layered_port::hport_l1')
    expect(ids).toContain('P::System::a::layered_port::hport_l2')
    // Composite usage stays a handle so it can be connected as a whole.
    expect(ids).toContain('P::System::a::layered_port')
  })

  it('uses port handles for binding between nested leaf and child port', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const { usesPortHandles } = await import('../../relationshipStyle')
    expect(usesPortHandles('binding', 'port', 'port')).toBe(true)

    const semantic = nestedPortSemantic()
    const { edges } = buildStructureGraph({
      view: viewOf(semantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })

    const bnd = edges.find((e) => e.id === 'P::System::bnd')
    expect(bnd).toBeDefined()
    expect(bnd?.sourceHandle).toBe('P::System::a::layered_port::hport_l1')
    expect(bnd?.targetHandle).toBe('target:P::System::c1::l1p')
    expect(bnd?.sourceHandle?.startsWith('rel-')).toBe(false)
    expect(bnd?.targetHandle?.startsWith('rel-')).toBe(false)
  })

  it('connects nested leaf ports on different parents via port handles', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { edges } = buildStructureGraph({
      view: viewOf(semantic),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })

    const conn = edges.find((e) => e.id === 'P::System::conn')
    expect(conn).toBeDefined()
    expect(conn?.sourceHandle).toBe('P::System::a::layered_port::hport_l1')
    expect(conn?.targetHandle).toBe('target:P::System::b::layered_port::hport_l1')
  })
})
