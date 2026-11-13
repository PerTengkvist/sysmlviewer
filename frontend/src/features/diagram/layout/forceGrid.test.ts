import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { VisualizationNode } from '../../../api'
import type { PartNodeData, PartPort } from '../PartNode'
import { applyLayoutToFlowNodes } from './applyLayoutToFlowNodes'
import {
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  type AutoLayoutDirectives,
} from './autoLayoutOptions'
import { layoutForceGrid } from './forceGrid'
import { resolvePlacementPipeline, PIPELINE_IDS, pipelineLabel } from './placementPipelines'
import { runPlacementPipeline } from './runPlacementPipeline'
import { sizePartForPorts } from './structureAutoLayout'

function port(id: string, name: string, side: PartPort['side'] = 'top'): PartPort {
  return { id, name, side, offset: 0.5 }
}

function node(
  id: string,
  opts: {
    parentId?: string
    isBoundary?: boolean
    x?: number
    y?: number
    w?: number
    h?: number
    ports?: PartPort[]
    type?: string
    label?: string
  } = {},
): Node {
  const w = opts.w ?? 160
  const h = opts.h ?? 90
  return {
    id,
    type: opts.type ?? 'part',
    parentId: opts.parentId,
    position: { x: opts.x ?? 0, y: opts.y ?? 0 },
    width: w,
    height: h,
    style: { width: w, height: h },
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

const FORCE: AutoLayoutDirectives = {
  ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  mode: 'simple',
  algorithm: 'force-grid',
  portPlacement: 'inputsLeftOutputsRight',
}

type Box = { x: number; y: number; w: number; h: number }

function box(p: Partial<VisualizationNode> | undefined): Box {
  return { x: p!.x!, y: p!.y!, w: p!.width!, h: p!.height! }
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** Package root: a leaf saved 3x too big, a container saved huge, more leaves. */
function packageRoot(): Node[] {
  return [
    node('big', { w: 480, h: 270, label: 'motor' }),
    node('C', { isBoundary: true, x: 50, y: 50, w: 2400, h: 1600 }),
    node('c1', { parentId: 'C', x: 900, y: 700 }),
    node('c2', { parentId: 'C', x: 40, y: 900 }),
    node('l1', { x: 10, y: 10 }),
    node('l2', { x: 20, y: 20 }),
    node('l3', { x: 30, y: 30 }),
  ]
}

describe('force grid pipeline wiring', () => {
  it('is a simple algorithm and an advanced pipeline', () => {
    expect(PIPELINE_IDS).toContain('force-grid')
    expect(resolvePlacementPipeline(FORCE).id).toBe('force-grid')
    expect(pipelineLabel('force-grid')).toMatch(/Force grid/)
  })
})

describe('layoutForceGrid', () => {
  it('shrinks a leaf part to its name and ports, whatever was saved', () => {
    const ports = [port('p1', 'powerIn'), port('p2', 'torqueOut')]
    const nodes = [node('big', { w: 480, h: 270, label: 'motor', ports }), node('x')]
    const r = layoutForceGrid(nodes, [], FORCE)
    const fitted = sizePartForPorts('motor', [
      { name: 'powerIn', side: 'left' },
      { name: 'torqueOut', side: 'right' },
    ])
    expect(r.nodes.big).toMatchObject({ width: fitted.width, height: fitted.height })
  })

  it('puts inputs left and outputs right with the default port mode', () => {
    const ports = [port('p1', 'powerIn'), port('p2', 'torqueOut')]
    const r = layoutForceGrid([node('m', { ports }), node('x')], [], FORCE)
    expect(r.nodes.p1?.side).toBe('left')
    expect(r.nodes.p2?.side).toBe('right')
  })

  it('keeps the size of requirement and use case nodes', () => {
    const nodes = [
      node('R', { type: 'requirement', w: 260, h: 140 }),
      node('U', { type: 'useCase', w: 168, h: 72 }),
      node('x'),
    ]
    const r = layoutForceGrid(nodes, [], FORCE)
    expect(r.nodes.R).toMatchObject({ width: 260, height: 140 })
    expect(r.nodes.U).toMatchObject({ width: 168, height: 72 })
  })

  it('sizes a container from its children, not from a saved huge box', () => {
    const r = layoutForceGrid(packageRoot(), [], FORCE)
    const c = box(r.nodes.C)
    const c1 = box(r.nodes.c1)
    const c2 = box(r.nodes.c2)
    expect(c.w).toBeLessThan(600)
    expect(c.h).toBeLessThan(400)
    // Children are inside, below the header, and apart.
    for (const k of [c1, c2]) {
      expect(k.x).toBeGreaterThan(0)
      expect(k.y).toBeGreaterThanOrEqual(40)
      expect(k.x + k.w).toBeLessThan(c.w)
      expect(k.y + k.h).toBeLessThan(c.h)
    }
    expect(overlaps(c1, c2)).toBe(false)
  })

  it('places siblings in a compact grid with a column width per column', () => {
    const nodes = [
      node('a', { w: 300, h: 90 }),
      node('b'),
      node('c'),
      node('d'),
      node('e'),
    ]
    // Leaves are fitted, so make one wide by its name instead of a saved size.
    nodes[0] = node('a', { label: 'aVeryLongPartNameThatNeedsRoom' })
    const r = layoutForceGrid(nodes, [], FORCE)
    const boxes = ['a', 'b', 'c', 'd', 'e'].map((id) => box(r.nodes[id]))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false)
      }
    }
    // Five siblings: three columns, two rows.
    const xs = new Set(boxes.map((b) => b.x))
    const ys = new Set(boxes.map((b) => b.y))
    expect(xs.size).toBe(3)
    expect(ys.size).toBe(2)
    // The wide part widens only its own column: the column right of it starts
    // after it, while the next row's first cell is at the same x.
    const [a, b, , d] = boxes
    expect(b!.x).toBeGreaterThan(a!.x + a!.w)
    expect(d!.x).toBe(a!.x)
  })

  it('is no larger than favour grid', async () => {
    const nodes = packageRoot()
    const grid = layoutForceGrid(nodes, [], FORCE)
    const favour = await runPlacementPipeline(nodes, [], {
      ...FORCE,
      algorithm: 'favour-grid',
    })
    const area = (patch: Record<string, Partial<VisualizationNode>>) => {
      const top = nodes.filter((n) => !n.parentId).map((n) => box(patch[n.id]))
      const minX = Math.min(...top.map((b) => b.x))
      const minY = Math.min(...top.map((b) => b.y))
      const maxX = Math.max(...top.map((b) => b.x + b.w))
      const maxY = Math.max(...top.map((b) => b.y + b.h))
      return (maxX - minX) * (maxY - minY)
    }
    expect(area(grid.nodes)).toBeLessThanOrEqual(area(favour.nodes))
  })

  it('fits a whitebox frame around its children and keeps its own ports', () => {
    const nodes = [
      node('W', {
        isBoundary: true,
        x: 70,
        y: 80,
        w: 3000,
        h: 2000,
        ports: [port('wp', 'supplyIn', 'bottom')],
      }),
      node('a', { parentId: 'W', x: 1200, y: 900 }),
      node('b', { parentId: 'W', x: 30, y: 1500 }),
    ]
    const r = layoutForceGrid(nodes, [], FORCE)
    expect(r.nodes.W).toMatchObject({ x: 0, y: 0 })
    expect(r.nodes.W!.width!).toBeLessThan(800)
    expect(r.nodes.W!.height!).toBeLessThan(400)
    expect(r.nodes.wp).toMatchObject({ side: 'bottom', offset: 0.5 })
  })

  it('gives the same result when run again', () => {
    const nodes = packageRoot()
    const first = layoutForceGrid(nodes, [] as Edge[], FORCE)
    const again = layoutForceGrid(applyLayoutToFlowNodes(nodes, first.nodes), [], FORCE)
    for (const n of nodes) {
      expect(again.nodes[n.id], n.id).toEqual(first.nodes[n.id])
    }
  })

  it('runs through the placement pipeline', async () => {
    const r = await runPlacementPipeline(packageRoot(), [], FORCE)
    expect(r.nodes.big!.width!).toBeLessThan(480)
  })
})
