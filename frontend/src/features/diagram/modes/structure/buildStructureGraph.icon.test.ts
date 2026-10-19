import { describe, expect, it } from 'vitest'
import type { SemanticElement, ViewPayload } from '../../../../api'
import type { PartNodeData } from '../../PartNode'
import { buildStructureGraph } from './buildStructureGraph'

function part(
  id: string,
  name: string,
  parentId: string | null,
  children: string[] = [],
  extra: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind: 'part',
    name,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children,
    fileId: 'f1',
    isReference: false,
    ...extra,
  }
}

describe('buildStructureGraph _icon', () => {
  const semantic: Record<string, SemanticElement> = {
    'P::Car': part('P::Car', 'Car', 'P', ['P::Car::ecu', 'P::Car::plain']),
    'P::Car::ecu': part('P::Car::ecu', 'ecu', 'P::Car', [
      'P::Car::ecu::_icon',
      'P::Car::ecu::_icon_body',
      'P::Car::ecu::voltage',
    ]),
    'P::Car::ecu::_icon': {
      id: 'P::Car::ecu::_icon',
      kind: 'attribute',
      name: '_icon',
      parentId: 'P::Car::ecu',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
      defaultValue: '"battery"',
    },
    'P::Car::ecu::_icon_body': {
      id: 'P::Car::ecu::_icon_body',
      kind: 'attribute',
      name: '_icon_body',
      parentId: 'P::Car::ecu',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
      defaultValue: '"cloud"',
    },
    'P::Car::ecu::voltage': {
      id: 'P::Car::ecu::voltage',
      kind: 'attribute',
      name: 'voltage',
      parentId: 'P::Car::ecu',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f1',
      defaultValue: '12',
    },
    'P::Car::plain': part('P::Car::plain', 'plain', 'P::Car'),
  }

  const view: ViewPayload = {
    view: {
      id: 'v',
      name: 'V',
      rootArtifactId: 'P::Car',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: 3,
    semantic,
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
  }

  it('sets iconName from _icon attribute', () => {
    const { nodes } = buildStructureGraph({
      view,
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: true,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
      structureNotation: 'sysmlv2',
    })
    const ecu = nodes.find((n) => n.id === 'P::Car::ecu')
    expect(ecu).toBeTruthy()
    const data = ecu!.data as PartNodeData
    expect(data.iconName).toBe('battery')
    expect(data.iconBodyName).toBe('cloud')
    expect(data.attributeNames).toEqual(['voltage'])
    expect(data.attributeNames).not.toContain('_icon')
    expect(data.attributeNames).not.toContain('_icon_body')
  })

  it('leaves iconName unset when part has no _icon', () => {
    const { nodes } = buildStructureGraph({
      view,
      onOpenView: () => {},
      onPortMoved: () => {},
      portMoveMode: false,
      showAttributes: false,
      viewMode: 'light',
      onWaypointsChange: () => {},
      onLabelOffsetChange: () => {},
      structureNotation: 'sysmlv2',
    })
    const plain = nodes.find((n) => n.id === 'P::Car::plain')
    expect((plain!.data as PartNodeData).iconName ?? null).toBeNull()
    expect((plain!.data as PartNodeData).iconBodyName ?? null).toBeNull()
  })
})
