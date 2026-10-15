import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  absoluteRectsOverlap,
  type ParentOfMap,
} from './flowPlacement'
import { DEFAULT_AUTO_LAYOUT_DIRECTIVES } from './autoLayoutOptions'
import { runPlacementPipeline } from './runPlacementPipeline'
import type { PlacementPipelineId } from './placementPipelines'

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
      label: id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: opts.ports || [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

function parentMap(nodes: Node[]): ParentOfMap {
  const m: ParentOfMap = new Map()
  for (const n of nodes) m.set(n.id, n.parentId)
  return m
}

function partIds(patch: Record<string, { x?: number | null }>, exclude: string) {
  return Object.keys(patch).filter(
    (id) => !id.includes('::') && id !== exclude && patch[id]?.x != null,
  )
}

describe('runPlacementPipeline', () => {
  const pipelines: PlacementPipelineId[] = [
    'connection-aware',
    'compact-pack',
    'flow-layered',
    'organic-force',
  ]

  for (const pipeline of pipelines) {
    it(`${pipeline}: no absolute overlaps among peers and nested`, async () => {
      const nodes = [
        part('root', { isBoundary: true, w: 600, h: 400 }),
        part('ecu', {
          parentId: 'root',
          x: 40,
          y: 40,
          w: 100,
          h: 80,
        }),
        part('sw', {
          parentId: 'ecu',
          x: 200,
          y: 10,
          w: 140,
          h: 72,
          ports: [
            { id: 'sw::out', name: 'energyOut', side: 'right', offset: 0.4 },
          ],
        }),
        part('mech', {
          parentId: 'root',
          x: 50,
          y: 50,
          w: 140,
          h: 72,
          ports: [
            { id: 'mech::in', name: 'energyIn', side: 'left', offset: 0.4 },
          ],
        }),
        part('other', { parentId: 'root', x: 60, y: 60, w: 140, h: 72 }),
      ]
      const edges: Edge[] = [
        {
          id: 'c1',
          source: 'sw',
          target: 'mech',
          sourceHandle: 'sw::out',
          targetHandle: 'target:mech::in',
        },
      ]
      const result = await runPlacementPipeline(nodes, edges, {
        ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
        mode: 'advanced',
        pipeline,
      })
      const parents = parentMap(nodes)
      const ids = partIds(result.nodes, 'root')
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i]!
          const b = ids[j]!
          if (parents.get(a) === b || parents.get(b) === a) continue
          expect(
            absoluteRectsOverlap(result.nodes, a, b, parents, 8),
            `${a} overlaps ${b}`,
          ).toBe(false)
        }
      }
      // Nested sw must sit inside grown ecu
      const ecu = result.nodes['ecu']!
      const sw = result.nodes['sw']!
      expect(sw.x!).toBeGreaterThanOrEqual(16)
      expect(sw.y!).toBeGreaterThanOrEqual(16)
      expect(ecu.width!).toBeGreaterThanOrEqual(sw.x! + (sw.width || 140) + 16)
      expect(ecu.height!).toBeGreaterThanOrEqual(sw.y! + (sw.height || 72) + 16)
    }, 15_000)
  }

  it('PhysicalViewMini with proxy ports: nested SW inside ECU, no peer overlap', async () => {
    const nodes = [
      part('VehiclePhysical', { isBoundary: true, w: 900, h: 600 }),
      part('batteryEcu', {
        parentId: 'VehiclePhysical',
        x: 40,
        y: 40,
        w: 100,
        h: 80,
        ports: [
          {
            id: 'batteryEcu::energyOut',
            name: 'energyOut',
            side: 'right',
            offset: 0.4,
          },
          {
            id: 'batteryEcu::chargeIn',
            name: 'chargeIn',
            side: 'left',
            offset: 0.4,
          },
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
        ],
      }),
      part('electricMotor', {
        parentId: 'VehiclePhysical',
        x: 50,
        y: 50,
        w: 140,
        h: 72,
        ports: [
          {
            id: 'electricMotor::energyIn',
            name: 'energyIn',
            side: 'left',
            offset: 0.4,
          },
        ],
      }),
      part('chargeInletMech', {
        parentId: 'VehiclePhysical',
        x: 60,
        y: 60,
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
    const result = await runPlacementPipeline(nodes, edges, {
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'advanced',
      pipeline: 'connection-aware',
    })
    const parents = parentMap(nodes)
    const ids = partIds(result.nodes, 'VehiclePhysical')
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!
        const b = ids[j]!
        if (parents.get(a) === b || parents.get(b) === a) continue
        expect(
          absoluteRectsOverlap(result.nodes, a, b, parents, 8),
          `${a} overlaps ${b}`,
        ).toBe(false)
      }
    }
    const ecu = result.nodes['batteryEcu']!
    const sw = result.nodes['batteryControlSw']!
    expect(sw.x).not.toBe(200)
    expect(ecu.width!).toBeGreaterThanOrEqual(sw.x! + (sw.width || 140) + 16)
    expect(ecu.height!).toBeGreaterThanOrEqual(sw.y! + (sw.height || 72) + 16)
  }, 15_000)
})
