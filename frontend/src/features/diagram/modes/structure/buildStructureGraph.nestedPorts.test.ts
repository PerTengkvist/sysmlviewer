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
        'P::System::iface',
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
    'P::System::iface': {
      id: 'P::System::iface',
      kind: 'interface',
      name: 'iface',
      parentId: 'P::System',
      typeRef: 'LayeredInterface',
      sourceId: 'P::System::a::layered_port',
      targetId: 'P::System::b::layered_port',
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

const graphOpts = {
  onOpenView: () => {},
  onPortMoved: () => {},
  portMoveMode: false,
  showAttributes: false,
  viewMode: 'light' as const,
  onWaypointsChange: () => {},
  onLabelOffsetChange: () => {},
}

describe('resolvePortHandleId', () => {
  it('maps nested port ends to the direct ancestor port on the owner', async () => {
    const { resolvePortHandleId } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    expect(
      resolvePortHandleId(
        'P::System::a::layered_port::hport_l1',
        'P::System::a',
        semantic,
      ),
    ).toBe('P::System::a::layered_port')
  })

  it('keeps a direct port as itself', async () => {
    const { resolvePortHandleId } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    expect(
      resolvePortHandleId('P::System::c1::l1p', 'P::System::c1', semantic),
    ).toBe('P::System::c1::l1p')
  })

  it('returns null when the endpoint is missing', async () => {
    const { resolvePortHandleId } = await import('./buildStructureGraph')
    expect(resolvePortHandleId('missing', 'P::System::a', {})).toBeNull()
  })
})

describe('buildStructureGraph nested ports', () => {
  it('shows only direct ports as handles (OMG hierarchical port)', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { nodes } = buildStructureGraph({
      view: viewOf(semantic),
      ...graphOpts,
    })

    const a = nodes.find((n) => n.id === 'P::System::a')
    const ports = (a?.data as { ports?: { id: string }[] })?.ports || []
    const ids = ports.map((p) => p.id)
    expect(ids).toEqual(['P::System::a::layered_port'])
    expect(ids).not.toContain('P::System::a::layered_port::hport_l1')
    expect(ids).not.toContain('P::System::a::layered_port::hport_l2')
  })

  it('resolves binding from nested leaf to composite handle; child leaf stays direct', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { edges } = buildStructureGraph({
      view: viewOf(semantic),
      ...graphOpts,
    })

    const bnd = edges.find((e) => e.id === 'P::System::bnd')
    expect(bnd).toBeDefined()
    expect(bnd?.sourceHandle).toBe('P::System::a::layered_port')
    expect(bnd?.targetHandle).toBe('target:P::System::c1::l1p')
  })

  it('resolves nested-end connection to composite handles on both sides', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { edges } = buildStructureGraph({
      view: viewOf(semantic),
      ...graphOpts,
    })

    const conn = edges.find((e) => e.id === 'P::System::conn')
    expect(conn).toBeDefined()
    expect(conn?.sourceHandle).toBe('P::System::a::layered_port')
    expect(conn?.targetHandle).toBe('target:P::System::b::layered_port')
  })

  it('keeps composite-to-composite interface on direct port handles', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { edges } = buildStructureGraph({
      view: viewOf(semantic),
      ...graphOpts,
    })

    const iface = edges.find((e) => e.id === 'P::System::iface')
    expect(iface).toBeDefined()
    expect(iface?.sourceHandle).toBe('P::System::a::layered_port')
    expect(iface?.targetHandle).toBe('target:P::System::b::layered_port')
  })

  it('adds subport annotation nodes and dashed edges in annotations mode', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { nodes, edges } = buildStructureGraph({
      view: viewOf(semantic),
      ...graphOpts,
      nestedPortReveal: 'annotations',
    })

    const anno = nodes.find((n) => n.id === 'anno::P::System::a::layered_port')
    expect(anno).toBeDefined()
    expect(anno?.type).toBe('portAnnotation')
    expect((anno?.data as { label?: string })?.label).toBe(
      'subports:{hport_l1, hport_l2}',
    )
    const link = edges.find(
      (e) => e.id === 'anno-edge::P::System::a::layered_port',
    )
    expect(link).toBeDefined()
    expect(link?.style?.strokeDasharray).toBeTruthy()
    expect(link?.sourceHandle).toBe('P::System::a::layered_port')
  })

  it('does not add annotations in hover mode', async () => {
    const { buildStructureGraph } = await import('./buildStructureGraph')
    const semantic = nestedPortSemantic()
    const { nodes } = buildStructureGraph({
      view: viewOf(semantic),
      ...graphOpts,
      nestedPortReveal: 'hover',
    })
    expect(nodes.some((n) => n.type === 'portAnnotation')).toBe(false)
  })
})
