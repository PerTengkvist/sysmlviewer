import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import { SUGGESTED_LEVEL_WEIGHTS } from './autoLayoutOptions'
import {
  groupChildrenByParent,
  layoutNestBottomUp,
  layoutNestBottomUpAdaptive,
  maxNestDepth,
  parentsOrderedDeepestFirst,
} from './nestBottomUp'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
    w?: number
    h?: number
    isBoundary?: boolean
    parentId?: string
    ports?: PartNodeData['ports']
    label?: string
  } = {},
): Node {
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    width: opts.w ?? 160,
    height: opts.h ?? 100,
    style: { width: opts.w ?? 160, height: opts.h ?? 100 },
    data: {
      label: opts.label ?? id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

/** PhysicalViewMini: boundary → batteryEcu → batteryControlSw + peer mechs. */
function physicalViewMini(): { nodes: Node[]; edges: Edge[] } {
  const nodes = [
    part('VehiclePhysical', { isBoundary: true, w: 900, h: 600 }),
    part('batteryEcu', {
      parentId: 'VehiclePhysical',
      x: 40,
      y: 40,
      w: 100,
      h: 80,
      ports: [
        { id: 'batteryEcu::energyOut', name: 'energyOut', side: 'right', offset: 0.4 },
        { id: 'batteryEcu::chargeIn', name: 'chargeIn', side: 'left', offset: 0.4 },
      ],
    }),
    part('batteryControlSw', {
      parentId: 'batteryEcu',
      x: 200,
      y: 10,
      w: 140,
      h: 72,
      ports: [
        {
          id: 'batteryControlSw::energyOut',
          name: 'energyOut',
          side: 'right',
          offset: 0.4,
        },
        {
          id: 'batteryControlSw::chargeIn',
          name: 'chargeIn',
          side: 'left',
          offset: 0.4,
        },
      ],
    }),
    part('electricMotor', {
      parentId: 'VehiclePhysical',
      x: 300,
      y: 40,
      w: 140,
      h: 72,
      ports: [
        { id: 'electricMotor::energyIn', name: 'energyIn', side: 'left', offset: 0.4 },
      ],
    }),
    part('chargeInletMech', {
      parentId: 'VehiclePhysical',
      x: 40,
      y: 300,
      w: 140,
      h: 72,
      ports: [
        {
          id: 'chargeInletMech::chargeOut',
          name: 'chargeOut',
          side: 'right',
          offset: 0.4,
        },
      ],
    }),
  ]
  const edges: Edge[] = [
    {
      id: 'internalEnergy',
      source: 'batteryControlSw',
      target: 'batteryEcu',
      sourceHandle: 'batteryControlSw::energyOut',
      targetHandle: 'target:batteryEcu::energyOut',
    },
    {
      id: 'energyMotor',
      source: 'batteryEcu',
      target: 'electricMotor',
      sourceHandle: 'batteryEcu::energyOut',
      targetHandle: 'target:electricMotor::energyIn',
    },
    {
      id: 'charge',
      source: 'chargeInletMech',
      target: 'batteryEcu',
      sourceHandle: 'chargeInletMech::chargeOut',
      targetHandle: 'target:batteryEcu::chargeIn',
    },
  ]
  return { nodes, edges }
}

describe('nestBottomUp helpers', () => {
  it('maxNestDepth is 2 for PhysicalViewMini', () => {
    const { nodes } = physicalViewMini()
    expect(maxNestDepth(nodes)).toBe(2)
  })

  it('groupChildrenByParent puts SW under ECU and mechs under boundary', () => {
    const { nodes } = physicalViewMini()
    const g = groupChildrenByParent(nodes)
    expect(g.get('batteryEcu')).toEqual(['batteryControlSw'])
    expect(g.get('VehiclePhysical')?.sort()).toEqual(
      ['batteryEcu', 'chargeInletMech', 'electricMotor'].sort(),
    )
  })

  it('parentsOrderedDeepestFirst lists batteryEcu before VehiclePhysical', () => {
    const { nodes } = physicalViewMini()
    const order = parentsOrderedDeepestFirst(nodes)
    expect(order.indexOf('batteryEcu')).toBeLessThan(
      order.indexOf('VehiclePhysical'),
    )
    expect(order[0]).toBe('batteryEcu')
  })
})

describe('layoutNestBottomUp', () => {
  it('sizes parent after children and places SW parent-relative', () => {
    const { nodes, edges } = physicalViewMini()
    const { nodePatch, processedParents } = layoutNestBottomUp(nodes, edges)
    expect(processedParents[0]).toBe('batteryEcu')

    const sw = nodePatch['batteryControlSw']!
    const ecu = nodePatch['batteryEcu']!
    expect(sw.x!).toBeGreaterThanOrEqual(24)
    expect(sw.y!).toBeGreaterThanOrEqual(24)
    expect(ecu.width!).toBeGreaterThanOrEqual(sw.x! + (sw.width || 140) + 24)
    expect(ecu.height!).toBeGreaterThanOrEqual(sw.y! + (sw.height || 72) + 24)
    // Bad seed (200,10) must be overwritten
    expect(sw.x).not.toBe(200)
  })

  it('places two nested siblings without overlap', () => {
    const nodes = [
      part('root', { isBoundary: true, w: 800, h: 600 }),
      part('ecu', { parentId: 'root', w: 100, h: 80 }),
      part('swA', { parentId: 'ecu', x: 5, y: 5, w: 140, h: 72 }),
      part('swB', { parentId: 'ecu', x: 5, y: 5, w: 140, h: 72 }),
    ]
    const { nodePatch } = layoutNestBottomUp(nodes, [])
    const a = nodePatch['swA']!
    const b = nodePatch['swB']!
    const gap = 8
    const noOverlap =
      a.x! + (a.width || 140) + gap <= b.x! ||
      b.x! + (b.width || 140) + gap <= a.x! ||
      a.y! + (a.height || 72) + gap <= b.y! ||
      b.y! + (b.height || 72) + gap <= a.y!
    expect(noOverlap).toBe(true)
    expect(nodePatch['ecu']!.width!).toBeGreaterThanOrEqual(
      Math.max(a.x! + (a.width || 140), b.x! + (b.width || 140)) + 24,
    )
  })
})

describe('layoutNestBottomUpAdaptive', () => {
  it('grows parent with corridor pad and records scope plans', async () => {
    const nodes = [
      part('root', { isBoundary: true, w: 800, h: 600 }),
      part('ecu', { parentId: 'root', w: 100, h: 80 }),
      part('swA', {
        parentId: 'ecu',
        w: 140,
        h: 72,
        ports: [
          { id: 'swA::out', name: 'energyOut', side: 'right', offset: 0.5 },
        ],
      }),
      part('swB', {
        parentId: 'ecu',
        w: 140,
        h: 72,
        ports: [
          { id: 'swB::in', name: 'energyIn', side: 'left', offset: 0.5 },
        ],
      }),
    ]
    const edges: Edge[] = [
      {
        id: 'c1',
        source: 'swA',
        target: 'swB',
        sourceHandle: 'swA::out',
        targetHandle: 'target:swB::in',
      },
    ]
    const { nodePatch, scopePlans } = await layoutNestBottomUpAdaptive(
      nodes,
      edges,
      SUGGESTED_LEVEL_WEIGHTS,
    )
    expect(scopePlans?.some((p) => p.parentId === 'ecu')).toBe(true)
    const ecu = nodePatch['ecu']!
    const a = nodePatch['swA']!
    const b = nodePatch['swB']!
    expect(ecu.width!).toBeGreaterThanOrEqual(
      Math.max(a.x! + (a.width || 140), b.x! + (b.width || 140)) + 24,
    )
    // Corridor from leaf weights (high bendMin/portClarity) exceeds base pad.
    expect(ecu.width!).toBeGreaterThan(140 + 140 + 16 + 48)
  })

  it('keeps row-pack path available via layoutNestBottomUp', () => {
    const nodes = [
      part('root', { isBoundary: true, w: 800, h: 600 }),
      part('ecu', { parentId: 'root', w: 100, h: 80 }),
      part('swA', { parentId: 'ecu', w: 140, h: 72 }),
      part('swB', { parentId: 'ecu', w: 140, h: 72 }),
    ]
    const { nodePatch } = layoutNestBottomUp(nodes, [])
    expect(nodePatch['swA']!.y).toBe(nodePatch['swB']!.y)
    expect(nodePatch['swB']!.x!).toBeGreaterThan(nodePatch['swA']!.x!)
  })
})
