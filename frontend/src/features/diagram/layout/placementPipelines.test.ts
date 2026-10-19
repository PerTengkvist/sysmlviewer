import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTO_LAYOUT_DIRECTIVES,
  type AutoLayoutDirectives,
} from './autoLayoutOptions'
import {
  PIPELINE_IDS,
  resolvePlacementPipeline,
  type PlacementPipelineId,
} from './placementPipelines'

describe('resolvePlacementPipeline', () => {
  it('maps simple + stress to connection-aware', () => {
    const d: AutoLayoutDirectives = {
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'simple',
      algorithm: 'stress',
    }
    const r = resolvePlacementPipeline(d)
    expect(r.id).toBe('connection-aware')
    expect(r.elkAlgorithm).toBe('stress')
    expect(r.steps).toContain('nest-layout')
    expect(r.steps.indexOf('nest-layout')).toBeLessThan(
      r.steps.indexOf('primary-layout'),
    )
    expect(r.steps).toContain('nest-fit')
    expect(r.steps).toContain('non-overlap')
  })

  it('maps simple + layered to flow-layered', () => {
    const d: AutoLayoutDirectives = {
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'simple',
      algorithm: 'layered',
    }
    const r = resolvePlacementPipeline(d)
    expect(r.id).toBe('flow-layered')
    expect(r.elkAlgorithm).toBe('layered')
  })

  it('honours advanced pipeline for each preset id', () => {
    for (const id of PIPELINE_IDS) {
      const d: AutoLayoutDirectives = {
        ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
        mode: 'advanced',
        pipeline: id,
      }
      const r = resolvePlacementPipeline(d)
      expect(r.id).toBe(id)
    }
  })

  it('uses advanced pipeline even when algorithm would map differently', () => {
    const d: AutoLayoutDirectives = {
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'advanced',
      algorithm: 'layered',
      pipeline: 'organic-force',
    }
    const r = resolvePlacementPipeline(d)
    expect(r.id).toBe('organic-force')
    expect(r.elkAlgorithm).toBe('force')
  })

  it('includes flow-nudge when ports are inputsLeftOutputsRight', () => {
    const r = resolvePlacementPipeline({
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'advanced',
      pipeline: 'connection-aware',
      portPlacement: 'inputsLeftOutputsRight',
    })
    expect(r.steps).toContain('flow-nudge')
  })

  it('omits flow-nudge for optimized ports on compact-pack', () => {
    const r = resolvePlacementPipeline({
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'advanced',
      pipeline: 'compact-pack',
      portPlacement: 'optimized',
    })
    expect(r.elkAlgorithm).toBe('rectpacking')
    expect(r.steps).not.toContain('flow-nudge')
    expect(r.steps).toContain('non-overlap')
  })

  it('defaults missing mode/pipeline like simple connection-aware', () => {
    const r = resolvePlacementPipeline({
      portPlacement: 'inputsLeftOutputsRight',
      algorithm: 'stress',
      spacing: 'normal',
      aspectRatio: 1,
    })
    expect(r.id).toBe('connection-aware')
  })

  it('exposes all pipeline ids including composition variants', () => {
    expect(PIPELINE_IDS).toEqual([
      'connection-aware',
      'compact-pack',
      'flow-layered',
      'organic-force',
      'custom',
      'clustered',
      'favour-grid',
    ] satisfies PlacementPipelineId[])
  })

  it('maps simple composition algorithms and skips primary-layout / flow-nudge', () => {
    for (const algorithm of ['clustered', 'favour-grid'] as const) {
      const r = resolvePlacementPipeline({
        ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
        mode: 'simple',
        algorithm,
        portPlacement: 'inputsLeftOutputsRight',
      })
      expect(r.id).toBe(algorithm)
      expect(r.steps).toContain('nest-layout')
      expect(r.steps).not.toContain('primary-layout')
      expect(r.steps).not.toContain('flow-nudge')
      expect(r.steps).toContain('fit-boundary')
    }
  })

  it('resolves custom with clamped weights and flow-nudge for IO ports', () => {
    const r = resolvePlacementPipeline({
      ...DEFAULT_AUTO_LAYOUT_DIRECTIVES,
      mode: 'advanced',
      pipeline: 'custom',
      portPlacement: 'inputsLeftOutputsRight',
      customWeights: {
        leaf: {
          connectionAwareness: 2,
          flowDirection: -1,
          compactness: 0.5,
          portClarity: 0.5,
          bendMinimization: 0.5,
        },
        mid: DEFAULT_AUTO_LAYOUT_DIRECTIVES.customWeights!.mid,
        root: DEFAULT_AUTO_LAYOUT_DIRECTIVES.customWeights!.root,
      },
    })
    expect(r.id).toBe('custom')
    expect(r.elkAlgorithm).toBe('stress')
    expect(r.customWeights?.leaf.connectionAwareness).toBe(1)
    expect(r.customWeights?.leaf.flowDirection).toBe(0)
    expect(r.steps).toContain('flow-nudge')
    expect(r.steps).toContain('nest-layout')
  })
})
