import { describe, expect, it } from 'vitest'
import { DEFAULT_REQUIREMENT_DISPLAY } from '../../requirementDisplay'
import { buildStructureGraph } from './buildStructureGraph'
import type { ViewPayload } from '../../../../api'

function fixture(): ViewPayload {
  return {
    view: {
      id: 'P::V',
      name: 'Reqs',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    semantic: {
      P: {
        id: 'P',
        kind: 'package',
        name: 'P',
        parentId: null,
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::R1', 'P::Box', 'P::Login', 'P::Power', 'P::sat1'],
        fileId: 'f',
      },
      'P::R1': {
        id: 'P::R1',
        kind: 'requirement',
        name: 'Safety',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: ['P::R1::Type', 'P::R1::summary'],
        fileId: 'f',
        shortId: 'R-01',
        documentation: 'Be safe',
      },
      'P::R1::Type': {
        id: 'P::R1::Type',
        kind: 'attribute',
        name: 'Type',
        parentId: 'P::R1',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
        defaultValue: '"UserStory"',
      },
      'P::R1::summary': {
        id: 'P::R1::summary',
        kind: 'attribute',
        name: 'summary',
        parentId: 'P::R1',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
        defaultValue: '"Short summary"',
      },
      'P::Box': {
        id: 'P::Box',
        kind: 'part',
        name: 'Box',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::Login': {
        id: 'P::Login',
        kind: 'useCase',
        name: 'Login',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::Power': {
        id: 'P::Power',
        kind: 'interface',
        name: 'Power',
        parentId: 'P',
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: 'f',
      },
      'P::sat1': {
        id: 'P::sat1',
        kind: 'satisfy',
        name: 'sat1',
        parentId: 'P',
        typeRef: null,
        sourceId: 'P::Box',
        targetId: 'P::R1',
        children: [],
        fileId: 'f',
      },
    },
    visualization: {
      nodes: {
        'P::R1': {
          artifactId: 'P::R1',
          x: 10,
          y: 20,
          width: 220,
          height: 140,
          style: {
            light: { backgroundColor: '#ffeeee' },
          },
        },
      },
      edges: {},
    },
    subdiagrams: [],
    menus: {},
  }
}

describe('buildStructureGraph requirements mix', () => {
  it('includes requirement, part, interface and useCase nodes with satisfy edge', () => {
    const { nodes, edges } = buildStructureGraph({
      view: fixture(),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })
    const types = new Map(nodes.map((n) => [n.id, n.type]))
    expect(types.get('P::R1')).toBe('requirement')
    expect(types.get('P::Box')).toBe('part')
    expect(types.get('P::Login')).toBe('useCase')
    expect(types.get('P::Power')).toBe('part') // interface rendered as part node
    expect(edges.some((e) => e.id === 'P::sat1')).toBe(true)
    const reqData = nodes.find((n) => n.id === 'P::R1')?.data as {
      typeAttr?: string
      headerText?: string
      bodyText?: string
    }
    expect(reqData.typeAttr).toContain('UserStory')
    expect(reqData.headerText).toBe('R-01 Safety')
    expect(reqData.bodyText).toBe('Be safe')
  })

  it('keeps requirement outer style transparent so fill stays on the node', () => {
    const { nodes } = buildStructureGraph({
      view: fixture(),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
    })
    const req = nodes.find((n) => n.id === 'P::R1')
    expect(req?.style).toMatchObject({
      width: 220,
      height: 140,
      background: 'transparent',
      border: 'none',
    })
    const data = req?.data as { formatStyle?: { light?: { backgroundColor?: string } } }
    expect(data.formatStyle?.light?.backgroundColor).toBe('#ffeeee')
  })

  it('resolves bodyText from attribute when configured', () => {
    const { nodes } = buildStructureGraph({
      view: fixture(),
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
      requirementDisplay: {
        ...DEFAULT_REQUIREMENT_DISPLAY,
        body: { kind: 'attribute', name: 'summary' },
      },
    })
    const reqData = nodes.find((n) => n.id === 'P::R1')?.data as {
      bodyText?: string
    }
    expect(reqData.bodyText).toBe('Short summary')
  })
})
