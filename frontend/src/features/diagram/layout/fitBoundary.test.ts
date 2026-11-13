import { describe, expect, it } from 'vitest'
import type { VisualizationNode } from '../../../api'
import { fitBoundaryAroundChildren } from './elkStructureLayout'

describe('fitBoundaryAroundChildren', () => {
  it('fits the frame to its direct children only', () => {
    const nodePatch: Record<string, Partial<VisualizationNode>> = {
      W: { artifactId: 'W', x: 0, y: 0, width: 3000, height: 2000 },
      a: { artifactId: 'a', x: 100, y: 120 },
      K: { artifactId: 'K', x: 400, y: 120 },
      k1: { artifactId: 'k1', x: 20, y: 50 },
      far: { artifactId: 'far', x: 2400, y: 0 },
    }
    const sizes = new Map([
      ['W', { width: 3000, height: 2000 }],
      ['a', { width: 160, height: 90 }],
      ['K', { width: 300, height: 200 }],
      ['k1', { width: 160, height: 90 }],
      ['far', { width: 160, height: 90 }],
    ])
    const positions = new Map(
      Object.entries(nodePatch).map(([id, p]) => [id, { x: p.x!, y: p.y! }]),
    )
    const parentOf = new Map<string, string | undefined>([
      ['W', undefined],
      ['a', 'W'],
      ['K', 'W'],
      ['k1', 'K'],
      ['far', undefined],
    ])
    fitBoundaryAroundChildren('W', undefined, nodePatch, sizes, positions, parentOf)

    // Direct children move so the left/top one sits at the padding.
    const dx = nodePatch.a!.x! - 100
    const dy = nodePatch.a!.y! - 120
    expect(nodePatch.K).toMatchObject({ x: 400 + dx, y: 120 + dy })
    // A grandchild is relative to its own parent and does not move.
    expect(nodePatch.k1).toMatchObject({ x: 20, y: 50 })
    // A node outside the frame neither moves nor widens it.
    expect(nodePatch.far).toMatchObject({ x: 2400, y: 0 })
    const right = 400 + dx + 300
    expect(nodePatch.W!.width!).toBeLessThan(right + 100)
    expect(nodePatch.W!.width!).toBeGreaterThanOrEqual(right)
  })
})
