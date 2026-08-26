import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { PartNodeData, PartPort } from '../PartNode'
import {
  pathCrossesObstacles,
  polylineHitsRect,
  redrawStructureConnections,
  resolveObstacleAwareWaypoints,
  type Rect,
} from './connectionRouting'
import { resolveRoutePoints } from '../edgeRouting'

const STATE_PATH = resolve(
  __dirname,
  '../../../../../data/projects/data_center/state.json',
)

type VizNode = {
  x?: number
  y?: number
  width?: number
  height?: number
  side?: string | null
  offset?: number | null
}

type StateFile = {
  semantic: Record<
    string,
    {
      kind: string
      name: string
      parentId?: string | null
      sourceId?: string | null
      targetId?: string | null
      children?: string[]
    }
  >
  visualization: {
    nodes: Record<string, VizNode>
    edges: Record<string, { waypoints?: { x: number; y: number }[] }>
  }
}

function loadState(): StateFile {
  return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as StateFile
}

const ROOT = 'DataCenterLogical::DataCenter'

function partNodeFromState(
  id: string,
  state: StateFile,
  opts: { parentId?: string; isBoundary?: boolean },
): Node {
  const viz = state.visualization.nodes[id] || {}
  const el = state.semantic[id]
  const ports: PartPort[] = (el?.children || [])
    .map((cid) => state.semantic[cid])
    .filter((c): c is NonNullable<typeof c> => !!c && c.kind === 'port')
    .map((port) => {
      const pv = state.visualization.nodes[port.id] || {}
      return {
        id: port.id,
        name: port.name,
        side: (pv.side || 'right') as PartPort['side'],
        offset: pv.offset ?? 0.5,
      }
    })
  // Boundary ports live on the root part itself
  if (opts.isBoundary) {
    for (const cid of el?.children || []) {
      const c = state.semantic[cid]
      if (!c || c.kind !== 'port') continue
      if (ports.some((p) => p.id === c.id)) continue
      const pv = state.visualization.nodes[c.id] || {}
      ports.push({
        id: c.id,
        name: c.name,
        side: (pv.side || 'right') as PartPort['side'],
        offset: pv.offset ?? 0.5,
      })
    }
  }
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: viz.x ?? 0, y: viz.y ?? 0 },
    width: viz.width ?? 180,
    height: viz.height ?? 110,
    style: { width: viz.width ?? 180, height: viz.height ?? 110 },
    data: {
      label: el?.name || id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports,
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

function iaacAbsRect(state: StateFile): Rect {
  const root = state.visualization.nodes[ROOT]
  const iaac = state.visualization.nodes[`${ROOT}::iaac`]
  const minX = (root.x ?? 0) + (iaac.x ?? 0)
  const minY = (root.y ?? 0) + (iaac.y ?? 0)
  return {
    minX,
    minY,
    maxX: minX + (iaac.width ?? 0),
    maxY: minY + (iaac.height ?? 0),
  }
}

describe('DataCenterLogical real layout — routes must not cut through iaac', () => {
  const state = loadState()
  const childIds = Object.values(state.semantic)
    .filter((el) => el.kind === 'part' && el.parentId === ROOT)
    .map((el) => el.id)

  const nodes: Node[] = [
    partNodeFromState(ROOT, state, { isBoundary: true }),
    ...childIds.map((id) =>
      partNodeFromState(id, state, { parentId: ROOT }),
    ),
  ]

  const connections = Object.entries(state.semantic)
    .filter(
      ([id, el]) =>
        el.kind === 'connection' && id.startsWith(`${ROOT}::`),
    )
    .map(([id, el]) => {
      const sourcePart = childIds.find((p) => el.sourceId?.startsWith(`${p}::`))
        || (el.sourceId?.startsWith(`${ROOT}::`) && !el.sourceId.slice(ROOT.length + 2).includes('::')
          ? ROOT
          : null)
      // owner part of port
      const ownerOf = (portId: string | null | undefined): string | null => {
        if (!portId) return null
        let cur = state.semantic[portId]
        while (cur) {
          if (cur.kind === 'part' && (cur.id === ROOT || childIds.includes(cur.id))) {
            return cur.id
          }
          if (!cur.parentId) break
          cur = state.semantic[cur.parentId]
        }
        return null
      }
      return {
        id,
        source: ownerOf(el.sourceId),
        target: ownerOf(el.targetId),
        sourceHandle: el.sourceId || '',
        targetHandle: `target:${el.targetId || ''}`,
      }
    })
    .filter((e): e is Edge & { source: string; target: string } =>
      !!e.source && !!e.target,
    )

  const edges: Edge[] = connections.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }))

  const iaac = iaacAbsRect(state)

  it('stored cluster_sai corners that cut iaac are repaired by resolveObstacleAwareWaypoints', () => {
    const stale = [
      { x: (iaac.minX + iaac.maxX) / 2, y: iaac.minY - 40 },
      { x: (iaac.minX + iaac.maxX) / 2, y: iaac.maxY + 40 },
    ]
    const root = state.visualization.nodes[ROOT]
    const bounds = {
      minX: root.x ?? 0,
      minY: root.y ?? 0,
      maxX: (root.x ?? 0) + (root.width ?? 800),
      maxY: (root.y ?? 0) + (root.height ?? 600),
    }
    const pathStale = [
      { x: stale[0].x, y: iaac.minY - 80 },
      ...stale,
      { x: stale[1].x, y: iaac.maxY + 80 },
    ]
    expect(polylineHitsRect(pathStale, iaac)).toBe(true)
    const fixed = resolveObstacleAwareWaypoints(
      pathStale[0].x,
      pathStale[0].y,
      pathStale[pathStale.length - 1].x,
      pathStale[pathStale.length - 1].y,
      stale,
      [iaac],
      bounds,
    )
    const path = resolveRoutePoints(
      pathStale[0].x,
      pathStale[0].y,
      pathStale[pathStale.length - 1].x,
      pathStale[pathStale.length - 1].y,
      fixed,
    )
    expect(polylineHitsRect(path, iaac)).toBe(false)
  })

  it('redrawStructureConnections clears every DataCenter edge through iaac', () => {
    const routed = redrawStructureConnections(nodes, edges, undefined, [], {
      separation: 5,
    })
    expect(routed.length).toBeGreaterThan(5)

    // Rebuild port endpoints like the router and check full polylines
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const absOrigin = (node: Node): { x: number; y: number } => {
      let x = node.position.x
      let y = node.position.y
      let pid = node.parentId
      while (pid) {
        const p = byId.get(pid)
        if (!p) break
        x += p.position.x
        y += p.position.y
        pid = p.parentId
      }
      return { x, y }
    }
    const portPt = (
      nodeId: string,
      portId: string,
    ): { x: number; y: number } | null => {
      const node = byId.get(nodeId)
      if (!node) return null
      const port = (node.data as PartNodeData).ports.find((p) => p.id === portId)
      if (!port) return null
      const o = absOrigin(node)
      const w = Number(node.style?.width ?? node.width ?? 180)
      const h = Number(node.style?.height ?? node.height ?? 110)
      const off = Math.min(0.95, Math.max(0.05, port.offset ?? 0.5))
      switch (port.side) {
        case 'left':
          return { x: o.x, y: o.y + off * h }
        case 'right':
          return { x: o.x + w, y: o.y + off * h }
        case 'top':
          return { x: o.x + off * w, y: o.y }
        case 'bottom':
          return { x: o.x + off * w, y: o.y + h }
      }
    }

    const through: string[] = []
    for (const r of routed) {
      const edge = edges.find((e) => e.id === r.id)
      if (!edge) continue
      const srcPort = String(edge.sourceHandle || '')
      const tgtPort = String(edge.targetHandle || '').replace(/^target:/, '')
      const start = portPt(edge.source, srcPort)
      const end = portPt(edge.target, tgtPort)
      if (!start || !end) continue
      // Skip edges that terminate on iaac — entering the part is expected
      if (edge.source.endsWith('::iaac') || edge.target.endsWith('::iaac')) {
        continue
      }
      const path = resolveRoutePoints(
        start.x,
        start.y,
        end.x,
        end.y,
        r.waypoints,
      )
      if (polylineHitsRect(path, iaac) || pathCrossesObstacles(path, [iaac])) {
        through.push(r.id.split('::').pop() || r.id)
      }
    }
    expect(through).toEqual([])
  })
})
