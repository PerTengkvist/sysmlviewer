import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { PartNodeData } from '../PartNode'
import type { VisualizationNode } from '../../../api'
import {
  AUTO_LAYOUT_CANVAS_MAX,
  flowViewportBounds,
  normalizeAutoLayoutCanvas,
  pointInFlowBounds,
} from './layoutNormalize'

function part(
  id: string,
  opts: {
    x?: number
    y?: number
    w?: number
    h?: number
    isBoundary?: boolean
    parentId?: string
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
      ports: [],
      menuItems: [],
      isBoundary: opts.isBoundary,
    } satisfies PartNodeData,
  }
}

describe('normalizeAutoLayoutCanvas', () => {
  it('pins a boundary that sat at y≈30000 back to the origin', () => {
    const nodes = [
      part('Car', { isBoundary: true, x: 120, y: 30100, w: 800, h: 600 }),
      part('a', { parentId: 'Car', x: 40, y: 40 }),
    ]
    const patch: Record<string, Partial<VisualizationNode>> = {
      Car: {
        artifactId: 'Car',
        x: 120,
        y: 30100,
        width: 800,
        height: 600,
      },
      a: { artifactId: 'a', x: 40, y: 40, width: 160, height: 100 },
    }
    const result = normalizeAutoLayoutCanvas(patch, nodes)
    expect(result.shifted).toBe(true)
    expect(patch.Car!.x).toBe(0)
    expect(patch.Car!.y).toBe(0)
    expect(result.withinCanvas).toBe(true)
    expect(AUTO_LAYOUT_CANVAS_MAX).toBe(3000)
  })

  it('shifts root peers so the bbox starts at the origin', () => {
    const nodes = [
      part('a', { x: 500, y: 30500, w: 100, h: 80 }),
      part('b', { x: 700, y: 30600, w: 100, h: 80 }),
    ]
    const patch: Record<string, Partial<VisualizationNode>> = {
      a: { artifactId: 'a', x: 500, y: 30500, width: 100, height: 80 },
      b: { artifactId: 'b', x: 700, y: 30600, width: 100, height: 80 },
    }
    const result = normalizeAutoLayoutCanvas(patch, nodes)
    expect(result.shifted).toBe(true)
    expect(patch.a!.x).toBe(0)
    expect(patch.a!.y).toBe(0)
    expect(patch.b!.x).toBe(200)
    expect(patch.b!.y).toBe(100)
  })
})

describe('flowViewportBounds', () => {
  it('converts viewport + screen size to flow space', () => {
    const b = flowViewportBounds({ x: 0, y: 0, zoom: 1 }, 800, 600)
    expect(b).toEqual({ minX: 0, minY: 0, maxX: 800, maxY: 600 })
    expect(pointInFlowBounds({ x: 10, y: 10 }, b)).toBe(true)
    expect(pointInFlowBounds({ x: 900, y: 10 }, b)).toBe(false)
  })
})

describe('normalizeAutoLayoutCanvas with several top-level containers', () => {
  it('moves every top-level node by the same amount, not just a flagged one', () => {
    // buildStructureGraph flags every container; only a frame around all
    // nodes may be pinned alone.
    const nodes = [
      part('C1', { isBoundary: true, x: 500, y: 400, w: 300, h: 200 }),
      part('c1', { parentId: 'C1', x: 20, y: 50 }),
      part('C2', { isBoundary: true, x: 900, y: 400, w: 300, h: 200 }),
    ]
    const patch: Record<string, Partial<VisualizationNode>> = {
      C1: { artifactId: 'C1', x: 500, y: 400, width: 300, height: 200 },
      c1: { artifactId: 'c1', x: 20, y: 50 },
      C2: { artifactId: 'C2', x: 900, y: 400, width: 300, height: 200 },
    }
    normalizeAutoLayoutCanvas(patch, nodes)
    expect(patch.C1).toMatchObject({ x: 0, y: 0 })
    expect(patch.C2).toMatchObject({ x: 400, y: 0 })
    // Children stay relative to their container.
    expect(patch.c1).toMatchObject({ x: 20, y: 50 })
  })
})
