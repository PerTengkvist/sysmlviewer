import { describe, expect, it } from 'vitest'
import {
  docPathCandidates,
  docPathForArtifact,
  packagePathFor,
} from './docPath'
import type { SemanticElement } from '../../api'

function el(
  partial: Partial<SemanticElement> & Pick<SemanticElement, 'kind' | 'name'>,
): SemanticElement {
  return {
    id: 'x',
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: null,
    ...partial,
  }
}

/** PhysicalArchitecture { LogicalCounterparts { car } ; VehiclePhysical { infotainmentEcu { entertainmentSw } } } */
const FILE = 'physical_architecture/vehicle_physical.sysml'
const semantic: Record<string, SemanticElement> = {
  PhysicalArchitecture: el({
    id: 'PhysicalArchitecture',
    kind: 'package',
    name: 'PhysicalArchitecture',
    fileId: FILE,
  }),
  'PhysicalArchitecture::LogicalCounterparts': el({
    id: 'PhysicalArchitecture::LogicalCounterparts',
    kind: 'package',
    name: 'LogicalCounterparts',
    parentId: 'PhysicalArchitecture',
    fileId: FILE,
  }),
  'PhysicalArchitecture::LogicalCounterparts::car': el({
    id: 'PhysicalArchitecture::LogicalCounterparts::car',
    kind: 'part',
    name: 'car',
    parentId: 'PhysicalArchitecture::LogicalCounterparts',
    fileId: FILE,
  }),
  'PhysicalArchitecture::VehiclePhysical': el({
    id: 'PhysicalArchitecture::VehiclePhysical',
    kind: 'part',
    name: 'VehiclePhysical',
    parentId: 'PhysicalArchitecture',
    fileId: FILE,
  }),
  'PhysicalArchitecture::VehiclePhysical::infotainmentEcu': el({
    id: 'PhysicalArchitecture::VehiclePhysical::infotainmentEcu',
    kind: 'part',
    name: 'infotainmentEcu',
    parentId: 'PhysicalArchitecture::VehiclePhysical',
    fileId: FILE,
  }),
  'PhysicalArchitecture::VehiclePhysical::infotainmentEcu::entertainmentSw': el({
    id: 'PhysicalArchitecture::VehiclePhysical::infotainmentEcu::entertainmentSw',
    kind: 'part',
    name: 'entertainmentSw',
    parentId: 'PhysicalArchitecture::VehiclePhysical::infotainmentEcu',
    fileId: FILE,
  }),
  'PhysicalArchitecture::PhysicalView': el({
    id: 'PhysicalArchitecture::PhysicalView',
    kind: 'view',
    name: 'PhysicalView',
    parentId: 'PhysicalArchitecture',
    fileId: FILE,
  }),
}
const S = (id: string) => semantic[id]

describe('packagePathFor', () => {
  it('collects package ancestors only, root first', () => {
    expect(
      packagePathFor(
        S('PhysicalArchitecture::VehiclePhysical::infotainmentEcu::entertainmentSw'),
        semantic,
      ),
    ).toEqual(['PhysicalArchitecture'])
    expect(packagePathFor(S('PhysicalArchitecture::LogicalCounterparts::car'), semantic)).toEqual([
      'PhysicalArchitecture',
      'LogicalCounterparts',
    ])
    expect(packagePathFor(S('PhysicalArchitecture'), semantic)).toEqual([])
  })
})

describe('docPathCandidates', () => {
  it('qualified name first, legacy flat name second', () => {
    expect(
      docPathCandidates(
        S('PhysicalArchitecture::VehiclePhysical::infotainmentEcu::entertainmentSw'),
        semantic,
      ),
    ).toEqual([
      'physical_architecture/docs/PhysicalArchitecture.entertainmentSw.md',
      'physical_architecture/docs/entertainmentSw.md',
    ])
    expect(docPathCandidates(S('PhysicalArchitecture::LogicalCounterparts::car'), semantic)).toEqual([
      'physical_architecture/docs/PhysicalArchitecture.LogicalCounterparts.car.md',
      'physical_architecture/docs/car.md',
    ])
  })

  it('sub-package and view follow the same rule; a top package has one candidate', () => {
    expect(docPathCandidates(S('PhysicalArchitecture::LogicalCounterparts'), semantic)).toEqual([
      'physical_architecture/docs/PhysicalArchitecture.LogicalCounterparts.md',
      'physical_architecture/docs/LogicalCounterparts.md',
    ])
    expect(docPathCandidates(S('PhysicalArchitecture::PhysicalView'), semantic)).toEqual([
      'physical_architecture/docs/PhysicalArchitecture.PhysicalView.md',
      'physical_architecture/docs/PhysicalView.md',
    ])
    expect(docPathCandidates(S('PhysicalArchitecture'), semantic)).toEqual([
      'physical_architecture/docs/PhysicalArchitecture.md',
    ])
  })

  it('returns nothing for undocumented kinds, port usages and elements without a file', () => {
    expect(docPathCandidates(el({ kind: 'connection', name: 'c', fileId: FILE }), semantic)).toEqual([])
    expect(
      docPathCandidates(el({ kind: 'port', name: 'p', typeRef: 'T', fileId: FILE }), semantic),
    ).toEqual([])
    expect(docPathCandidates(el({ kind: 'part', name: 'p' }), semantic)).toEqual([])
  })
})

describe('docPathForArtifact', () => {
  const part = S('PhysicalArchitecture::VehiclePhysical::infotainmentEcu::entertainmentSw')

  it('picks the qualified file when it exists', () => {
    expect(
      docPathForArtifact(part, semantic, [
        'physical_architecture/docs/entertainmentSw.md',
        'physical_architecture/docs/PhysicalArchitecture.entertainmentSw.md',
      ]),
    ).toBe('physical_architecture/docs/PhysicalArchitecture.entertainmentSw.md')
  })

  it('falls back to the legacy flat file when only that exists', () => {
    expect(
      docPathForArtifact(part, semantic, ['physical_architecture/docs/entertainmentSw.md']),
    ).toBe('physical_architecture/docs/entertainmentSw.md')
  })

  it('returns the qualified path when nothing matches or no list is known', () => {
    expect(docPathForArtifact(part, semantic, [])).toBe(
      'physical_architecture/docs/PhysicalArchitecture.entertainmentSw.md',
    )
    expect(docPathForArtifact(part, semantic)).toBe(
      'physical_architecture/docs/PhysicalArchitecture.entertainmentSw.md',
    )
  })

  it('without a semantic model it degrades to the legacy flat name', () => {
    expect(docPathForArtifact(part)).toBe('physical_architecture/docs/entertainmentSw.md')
    expect(
      docPathForArtifact(el({ kind: 'part', name: 'ComputeEngine', fileId: 'logical/k8s.sysml' })),
    ).toBe('logical/docs/ComputeEngine.md')
  })

  it('maps docs beside a root-level sysml file to docs/', () => {
    expect(docPathForArtifact(el({ kind: 'part', name: 'P', fileId: 'main.sysml' }))).toBe(
      'docs/P.md',
    )
    expect(docPathForArtifact(null)).toBeNull()
  })
})

describe('docPathForArtifact type-def fallback', () => {
  const TYPE_FILE = 'logical/engine.sysml'
  const USAGE_FILE = 'physical/vehicle.sysml'

  const typeSemantic: Record<string, SemanticElement> = {
    Logical: el({
      id: 'Logical',
      kind: 'package',
      name: 'Logical',
      fileId: TYPE_FILE,
    }),
    'Logical::Engine': el({
      id: 'Logical::Engine',
      kind: 'part',
      name: 'Engine',
      parentId: 'Logical',
      fileId: TYPE_FILE,
    }),
    Physical: el({
      id: 'Physical',
      kind: 'package',
      name: 'Physical',
      fileId: USAGE_FILE,
    }),
    'Physical::engine': el({
      id: 'Physical::engine',
      kind: 'part',
      name: 'engine',
      parentId: 'Physical',
      typeRef: 'Engine',
      fileId: USAGE_FILE,
    }),
    'Physical::qualifiedEngine': el({
      id: 'Physical::qualifiedEngine',
      kind: 'part',
      name: 'qualifiedEngine',
      parentId: 'Physical',
      typeRef: 'Logical::Engine',
      fileId: USAGE_FILE,
    }),
    Base: el({
      id: 'Base',
      kind: 'part',
      name: 'Base',
      fileId: TYPE_FILE,
    }),
    // Specialized def: part def Derived :> Base — has typeRef but is a type, not a usage.
    Derived: el({
      id: 'Derived',
      kind: 'part',
      name: 'Derived',
      typeRef: 'Base',
      fileId: TYPE_FILE,
    }),
    'Derived_specializes_Base': el({
      id: 'Derived_specializes_Base',
      kind: 'specialization',
      name: 'Derived_specializes_Base',
      sourceId: 'Derived',
      targetId: 'Base',
      fileId: TYPE_FILE,
    }),
  }
  const T = (id: string) => typeSemantic[id]

  it('falls back to the type def doc when the usage has none', () => {
    expect(
      docPathForArtifact(T('Physical::engine'), typeSemantic, [
        'logical/docs/Logical.Engine.md',
      ]),
    ).toBe('logical/docs/Logical.Engine.md')
  })

  it('prefers the usage doc when both usage and type have docs', () => {
    expect(
      docPathForArtifact(T('Physical::engine'), typeSemantic, [
        'physical/docs/Physical.engine.md',
        'logical/docs/Logical.Engine.md',
      ]),
    ).toBe('physical/docs/Physical.engine.md')
  })

  it('returns the usage candidate when neither usage nor type has a doc', () => {
    expect(docPathForArtifact(T('Physical::engine'), typeSemantic, ['other/docs/x.md'])).toBe(
      'physical/docs/Physical.engine.md',
    )
  })

  it('leaves a part def without typeRef unchanged when it has no doc', () => {
    expect(
      docPathForArtifact(T('Logical::Engine'), typeSemantic, ['other/docs/x.md']),
    ).toBe('logical/docs/Logical.Engine.md')
  })

  it('does not fall back from a specialized def to its base', () => {
    expect(
      docPathForArtifact(T('Derived'), typeSemantic, ['logical/docs/Base.md']),
    ).toBe('logical/docs/Derived.md')
  })

  it('resolves a qualified typeRef to the type def by simple name', () => {
    expect(
      docPathForArtifact(T('Physical::qualifiedEngine'), typeSemantic, [
        'logical/docs/Logical.Engine.md',
      ]),
    ).toBe('logical/docs/Logical.Engine.md')
  })

  it('uses the type def fileId for the docs directory', () => {
    expect(
      docPathForArtifact(T('Physical::engine'), typeSemantic, [
        'logical/docs/Engine.md',
      ]),
    ).toBe('logical/docs/Engine.md')
  })

  it('does not fall back when no docPaths list is known', () => {
    expect(docPathForArtifact(T('Physical::engine'), typeSemantic)).toBe(
      'physical/docs/Physical.engine.md',
    )
  })
})
