import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import type { PartNodeData } from '../PartNode'
import { applyLayoutToFlowNodes } from './applyLayoutToFlowNodes'
import {
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  type AutoLayoutDirectives,
} from './autoLayoutOptions'
import { runPlacementPipeline } from './runPlacementPipeline'

/**
 * AutoLayout must keep every container to its own descendants: a top-level
 * container is never treated as the frame around the whole diagram, and
 * running AutoLayout again never grows anything.
 */

function part(
  id: string,
  opts: {
    parentId?: string
    isBoundary?: boolean
    x?: number
    y?: number
    w?: number
    h?: number
  } = {},
): Node {
  const w = opts.w ?? 160
  const h = opts.h ?? 90
  return {
    id,
    type: 'part',
    parentId: opts.parentId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    width: w,
    height: h,
    style: { width: w, height: h },
    data: {
      label: id,
      artifactId: id,
      kind: 'part',
      typeRef: null,
      ports: [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

/** Package root: three top-level containers (flagged like buildStructureGraph does) and a leaf. */
function packageRoot(): Node[] {
  return [
    part('C1', { isBoundary: true, w: 300, h: 200 }),
    part('c11', { parentId: 'C1', x: 20, y: 50 }),
    part('c12', { parentId: 'C1', x: 40, y: 60 }),
    part('C2', { isBoundary: true, x: 30, y: 10, w: 300, h: 200 }),
    part('c21', { parentId: 'C2', x: 20, y: 50 }),
    part('C3', { isBoundary: true, x: 60, y: 20, w: 300, h: 200 }),
    part('c31', { parentId: 'C3', x: 20, y: 50 }),
    part('c32', { parentId: 'C3', x: 30, y: 60 }),
    part('c33', { parentId: 'C3', x: 40, y: 70 }),
    part('L', { x: 90, y: 30 }),
  ]
}

/** Whitebox root with a second exposed root beside it. */
function whiteboxWithOrphan(): Node[] {
  return [
    part('W', { isBoundary: true, w: 500, h: 320 }),
    part('a', { parentId: 'W', x: 30, y: 60 }),
    part('b', { parentId: 'W', x: 240, y: 60 }),
    part('O', { isBoundary: true, x: 600, y: 0, w: 300, h: 200 }),
    part('o1', { parentId: 'O', x: 20, y: 50 }),
  ]
}

/** Plain whitebox with a nested container. */
function whiteboxNested(): Node[] {
  return [
    part('W', { isBoundary: true, w: 600, h: 400 }),
    part('a', { parentId: 'W', x: 30, y: 60 }),
    part('K', { parentId: 'W', isBoundary: true, x: 260, y: 60, w: 300, h: 220 }),
    part('k1', { parentId: 'K', x: 20, y: 50 }),
    part('k2', { parentId: 'K', x: 200, y: 50 }),
  ]
}

const PIPELINES: Record<string, Partial<AutoLayoutDirectives>> = {
  'favour-grid': { mode: 'simple', algorithm: 'favour-grid' },
  clustered: { mode: 'simple', algorithm: 'clustered' },
  layered: { mode: 'simple', algorithm: 'layered' },
  hierarchic: { mode: 'advanced', pipeline: 'hierarchic' },
}

function directives(d: Partial<AutoLayoutDirectives>): AutoLayoutDirectives {
  return { ...DEFAULT_AUTO_LAYOUT_DIRECTIVES, ...d }
}

type Box = { x: number; y: number; w: number; h: number }

function absoluteBoxes(
  nodes: Node[],
  patch: Record<string, Partial<VisualizationNode>>,
): Map<string, Box> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, Box>()
  const abs = (id: string): Box => {
    const hit = out.get(id)
    if (hit) return hit
    const n = byId.get(id)!
    const p = patch[id] || {}
    const local = {
      x: p.x ?? n.position.x,
      y: p.y ?? n.position.y,
      w: p.width ?? Number(n.style?.width),
      h: p.height ?? Number(n.style?.height),
    }
    const parent = n.parentId && byId.has(n.parentId) ? abs(n.parentId) : null
    const box = parent
      ? { ...local, x: parent.x + local.x, y: parent.y + local.y }
      : local
    out.set(id, box)
    return box
  }
  for (const n of nodes) abs(n.id)
  return out
}

function isAncestor(nodes: Node[], ancestor: string, id: string): boolean {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let cur = byId.get(id)?.parentId
  while (cur) {
    if (cur === ancestor) return true
    cur = byId.get(cur)?.parentId
  }
  return false
}

const TOL = 0.5

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w - TOL &&
    b.x < a.x + a.w - TOL &&
    a.y < b.y + b.h - TOL &&
    b.y < a.y + a.h - TOL
  )
}

function expectContainment(nodes: Node[], patch: Record<string, Partial<VisualizationNode>>) {
  const boxes = absoluteBoxes(nodes, patch)
  const ids = nodes.map((n) => n.id)
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue
      if (isAncestor(nodes, a, b) || isAncestor(nodes, b, a)) continue
      expect(overlaps(boxes.get(a)!, boxes.get(b)!), `${a} overlaps ${b}`).toBe(false)
    }
  }
  for (const n of nodes) {
    if (!n.parentId) continue
    const c = boxes.get(n.id)!
    const p = boxes.get(n.parentId)!
    expect(c.x, `${n.id} inside ${n.parentId} (left)`).toBeGreaterThanOrEqual(p.x - TOL)
    expect(c.y, `${n.id} inside ${n.parentId} (top)`).toBeGreaterThanOrEqual(p.y - TOL)
    expect(c.x + c.w, `${n.id} inside ${n.parentId} (right)`).toBeLessThanOrEqual(p.x + p.w + TOL)
    expect(c.y + c.h, `${n.id} inside ${n.parentId} (bottom)`).toBeLessThanOrEqual(p.y + p.h + TOL)
  }
}

describe('AutoLayout keeps containers to their own descendants', () => {
  for (const [name, d] of Object.entries(PIPELINES)) {
    it(`${name}: three top-level containers in a package root`, async () => {
      const nodes = packageRoot()
      const r = await runPlacementPipeline(nodes, [], directives(d))
      expectContainment(nodes, r.nodes)
    })

    it(`${name}: a second root beside the whitebox root`, async () => {
      const nodes = whiteboxWithOrphan()
      const r = await runPlacementPipeline(nodes, [], directives(d))
      expectContainment(nodes, r.nodes)
    })
  }
})

describe('running AutoLayout again grows nothing', () => {
  const fixtures: Record<string, () => Node[]> = {
    'package root': packageRoot,
    'whitebox + second root': whiteboxWithOrphan,
    'nested whitebox': whiteboxNested,
  }
  for (const name of ['favour-grid', 'hierarchic']) {
    for (const [fx, make] of Object.entries(fixtures)) {
      it(`${name}: ${fx}`, async () => {
        const d = directives(PIPELINES[name]!)
        const nodes = make()
        const first = await runPlacementPipeline(nodes, [], d)
        const after1 = applyLayoutToFlowNodes(nodes, first.nodes)
        const second = await runPlacementPipeline(after1, [], d)
        const b1 = absoluteBoxes(nodes, first.nodes)
        const b2 = absoluteBoxes(after1, second.nodes)
        for (const n of nodes) {
          expect(b2.get(n.id)!.w, `${n.id} width`).toBeLessThanOrEqual(b1.get(n.id)!.w + TOL)
          expect(b2.get(n.id)!.h, `${n.id} height`).toBeLessThanOrEqual(b1.get(n.id)!.h + TOL)
        }
      })
    }
  }
})
