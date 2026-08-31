import { describe, expect, it } from 'vitest'
import { docPathForArtifact } from './docPath'
import type { SemanticElement } from '../../api'

function el(partial: Partial<SemanticElement> & Pick<SemanticElement, 'kind' | 'name'>): SemanticElement {
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

describe('docPathForArtifact', () => {
  it('maps nested sysml file to docs sibling folder', () => {
    expect(
      docPathForArtifact(
        el({
          kind: 'part',
          name: 'ComputeEngine',
          fileId: 'logical/kubernetes_cluster.sysml',
        }),
      ),
    ).toBe('logical/docs/ComputeEngine.md')
  })

  it('skips port usages with typeRef', () => {
    expect(
      docPathForArtifact(
        el({
          kind: 'port',
          name: 'compute_sap',
          typeRef: 'compute_sai',
          fileId: 'logical/kubernetes_cluster.sysml',
        }),
      ),
    ).toBeNull()
  })

  it('includes port defs and views', () => {
    expect(
      docPathForArtifact(
        el({
          kind: 'port',
          name: 'orchestrator_sai',
          fileId: 'logical/logical_ports.sysml',
        }),
      ),
    ).toBe('logical/docs/orchestrator_sai.md')
    expect(
      docPathForArtifact(
        el({
          kind: 'view',
          name: 'AllocationView',
          fileId: 'physical/data_center_physical.sysml',
        }),
      ),
    ).toBe('physical/docs/AllocationView.md')
  })
})
