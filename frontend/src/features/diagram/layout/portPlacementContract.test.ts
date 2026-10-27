/**
 * The port placement mode is a contract every placement pipeline follows:
 * no port of a laid-out part may end on a side the mode forbids.
 */
import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import {
  allowedPortSides,
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  DEFAULT_HIERARCHIC_OPTIONS,
  inferPortFlowRole,
  PORT_PLACEMENT_MODES,
} from './autoLayoutOptions'
import { PIPELINE_IDS } from './placementPipelines'
import { runPlacementPipeline } from './runPlacementPipeline'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
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
    width: 160,
    height: 100,
    style: { width: 160, height: 100 },
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

function conn(id: string, s: string, t: string, sp: string, tp: string): Edge {
  return {
    id,
    source: s,
    target: t,
    sourceHandle: sp,
    targetHandle: `target:${tp}`,
    data: { relationKind: 'connection', routing: 'angular' },
  }
}

/** Four parts in a ring plus a nested part; a mix of named and unnamed roles. */
function fixture(): { nodes: Node[]; edges: Edge[] } {
  const nodes = [
    part('root', {
      isBoundary: true,
      ports: [{ id: 'root.p', name: 'p', side: 'top', offset: 0.5 }],
    }),
    part('a', {
      parentId: 'root',
      x: 0,
      y: 0,
      ports: [
        { id: 'a.powerOut', name: 'powerOut', side: 'right', offset: 0.3 },
        { id: 'a.ctrl', name: 'ctrl', side: 'top', offset: 0.7 },
      ],
    }),
    part('b', {
      parentId: 'root',
      x: 0,
      y: 300,
      ports: [
        { id: 'b.powerIn', name: 'powerIn', side: 'top', offset: 0.3 },
        { id: 'b.data', name: 'data', side: 'bottom', offset: 0.7 },
      ],
    }),
    part('c', {
      parentId: 'root',
      x: 300,
      y: 300,
      ports: [
        { id: 'c.data', name: 'data', side: 'top', offset: 0.3 },
        { id: 'c.sig', name: 'sig', side: 'left', offset: 0.7 },
      ],
    }),
    part('d', {
      parentId: 'root',
      x: 300,
      y: 0,
      ports: [{ id: 'd.sig', name: 'sig', side: 'bottom', offset: 0.5 }],
    }),
    part('d.inner', {
      parentId: 'd',
      x: 20,
      y: 40,
      ports: [{ id: 'd.inner.x', name: 'x', side: 'top', offset: 0.5 }],
    }),
  ]
  const edges = [
    conn('e1', 'a', 'b', 'a.powerOut', 'b.powerIn'),
    conn('e2', 'b', 'c', 'b.data', 'c.data'),
    conn('e3', 'c', 'd', 'c.sig', 'd.sig'),
    conn('e4', 'd', 'a', 'd.sig', 'a.ctrl'),
    conn('e5', 'root', 'a', 'root.p', 'a.ctrl'),
    conn('e6', 'd.inner', 'c', 'd.inner.x', 'c.sig'),
  ]
  return { nodes, edges }
}

const PORT_IDS = [
  'a.powerOut',
  'a.ctrl',
  'b.powerIn',
  'b.data',
  'c.data',
  'c.sig',
  'd.sig',
  'd.inner.x',
]

describe('port placement contract across pipelines', () => {
  const { nodes, edges } = fixture()
  const links = edges.map((e) => ({
    sourcePort: e.sourceHandle as string,
    targetPort: (e.targetHandle as string).replace(/^target:/, ''),
  }))
  const portByIdName = new Map<string, string>()
  for (const n of nodes) {
    for (const p of (n.data as PartNodeData).ports) portByIdName.set(p.id, p.name)
  }

  for (const pipeline of PIPELINE_IDS) {
    for (const mode of PORT_PLACEMENT_MODES) {
      it(`${pipeline} × ${mode}: every port side is allowed`, async () => {
        const result = await runPlacementPipeline(nodes, edges, {
          ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
          mode: 'advanced',
          pipeline,
          portPlacement: mode,
          hierarchic:
            pipeline === 'hierarchic'
              ? { ...DEFAULT_HIERARCHIC_OPTIONS, direction: 'DOWN', portConstraints: 'FREE' }
              : undefined,
        })
        for (const id of PORT_IDS) {
          const side = result.nodes[id]?.side
          expect(side, `${id} has a side`).toBeTruthy()
          const role = inferPortFlowRole(
            { id, name: portByIdName.get(id) || id },
            links,
          )
          expect(
            allowedPortSides(mode, role),
            `${id} (${role}) on ${side}`,
          ).toContain(side)
        }
      }, 20_000)
    }
  }
})
