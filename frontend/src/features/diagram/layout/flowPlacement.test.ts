import { describe, expect, it } from 'vitest'
import {
  absoluteRectsOverlap,
  enforceFlowLeftToRight,
  fitNestedChildrenInParents,
  separateAbsoluteOverlaps,
  separateOverlappingParts,
} from './flowPlacement'

describe('enforceFlowLeftToRight', () => {
  it('pushes the consumer part to the right of its provider', () => {
    const patch = {
      wiper: { artifactId: 'wiper', x: 200, y: 100, width: 140, height: 80 },
      glass: { artifactId: 'glass', x: 40, y: 40, width: 140, height: 80 },
    }
    enforceFlowLeftToRight(
      patch,
      [{ sourcePart: 'wiper', targetPart: 'glass' }],
      ['wiper', 'glass'],
      48,
    )
    expect(patch.glass.x!).toBeGreaterThanOrEqual(
      patch.wiper.x! + patch.wiper.width! + 48,
    )
  })

  it('places a vertically stacked source/target side by side', () => {
    const patch = {
      brake: { artifactId: 'brake', x: 40, y: 40, width: 140, height: 80 },
      wheel: { artifactId: 'wheel', x: 40, y: 160, width: 140, height: 80 },
    }
    enforceFlowLeftToRight(
      patch,
      [{ sourcePart: 'brake', targetPart: 'wheel' }],
      ['brake', 'wheel'],
      48,
    )
    expect(patch.wheel.x!).toBeGreaterThanOrEqual(
      patch.brake.x! + patch.brake.width! + 48,
    )
  })
})

describe('separateOverlappingParts', () => {
  it('separates two parts that share the same box', () => {
    const patch = {
      a: { artifactId: 'a', x: 0, y: 0, width: 100, height: 60 },
      b: { artifactId: 'b', x: 10, y: 10, width: 100, height: 60 },
    }
    separateOverlappingParts(patch, ['a', 'b'], 20)
    expect(
      patch.a.y! + patch.a.height! + 20 <= patch.b.y! ||
        patch.b.y! + patch.b.height! + 20 <= patch.a.y! ||
        patch.a.x! + patch.a.width! + 20 <= patch.b.x! ||
        patch.b.x! + patch.b.width! + 20 <= patch.a.x!,
    ).toBe(true)
  })
})

describe('fitNestedChildrenInParents', () => {
  it('grows an undersized parent so nested children fit with padding', () => {
    const patch = {
      ecu: { artifactId: 'ecu', x: 40, y: 40, width: 120, height: 80 },
      sw: { artifactId: 'sw', x: 200, y: 10, width: 140, height: 72 },
    }
    const parentOf = new Map([['sw', 'ecu']])
    fitNestedChildrenInParents(patch, parentOf, 24)
    expect(patch.sw.x!).toBeGreaterThanOrEqual(24)
    expect(patch.sw.y!).toBeGreaterThanOrEqual(24)
    expect(patch.ecu.width!).toBeGreaterThanOrEqual(
      patch.sw.x! + patch.sw.width! + 24,
    )
    expect(patch.ecu.height!).toBeGreaterThanOrEqual(
      patch.sw.y! + patch.sw.height! + 24,
    )
  })
})

describe('separateAbsoluteOverlaps', () => {
  it('separates a nested child that overlaps a peer of its parent', () => {
    // Parent ecu at (0,0); nested sw at relative (10,10) → abs (10,10).
    // Peer mech at (20,20) overlaps the nested sw in absolute space.
    const patch = {
      root: { artifactId: 'root', x: 0, y: 0, width: 800, height: 600 },
      ecu: { artifactId: 'ecu', x: 0, y: 0, width: 200, height: 160 },
      sw: { artifactId: 'sw', x: 10, y: 10, width: 140, height: 72 },
      mech: { artifactId: 'mech', x: 20, y: 20, width: 140, height: 72 },
    }
    const parentOf = new Map<string, string | undefined>([
      ['ecu', 'root'],
      ['sw', 'ecu'],
      ['mech', 'root'],
    ])
    separateAbsoluteOverlaps(
      patch,
      ['ecu', 'sw', 'mech'],
      parentOf,
      16,
    )
    expect(
      absoluteRectsOverlap(patch, 'sw', 'mech', parentOf, 16),
    ).toBe(false)
  })

  it('does not treat parent/child containment as an overlap to fix', () => {
    const patch = {
      ecu: { artifactId: 'ecu', x: 0, y: 0, width: 300, height: 200 },
      sw: { artifactId: 'sw', x: 40, y: 40, width: 140, height: 72 },
    }
    const parentOf = new Map([['sw', 'ecu']])
    separateAbsoluteOverlaps(patch, ['ecu', 'sw'], parentOf, 16)
    expect(patch.sw.x).toBe(40)
    expect(patch.sw.y).toBe(40)
    expect(patch.ecu.x).toBe(0)
  })
})
