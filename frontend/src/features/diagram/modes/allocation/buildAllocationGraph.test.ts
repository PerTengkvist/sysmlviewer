import { describe, expect, it } from 'vitest'
import type { ViewPayload } from '../../../api'
import { buildAllocationGraph } from './buildAllocationGraph'

describe('buildAllocationGraph', () => {
  it('provides menuItems on part nodes', () => {
    const view: ViewPayload = {
      view: { id: 'v', name: 'Alloc', rootArtifactId: 'Site', typeRef: 'AllocationView' },
      diagramMode: 'allocation',
      hierarchicalLevels: 2,
      semantic: {
        Site: {
          id: 'Site',
          kind: 'part',
          name: 'Site',
          parentId: null,
          typeRef: null,
          sourceId: null,
          targetId: null,
          children: ['logical', 'blade'],
          fileId: null,
        },
        logical: {
          id: 'logical',
          kind: 'part',
          name: 'logical',
          parentId: 'Site',
          typeRef: 'DataCenter',
          sourceId: null,
          targetId: null,
          children: ['orch'],
          fileId: null,
        },
        orch: {
          id: 'orch',
          kind: 'part',
          name: 'orchestrator',
          parentId: 'logical',
          typeRef: 'Orchestrator',
          sourceId: null,
          targetId: null,
          children: ['orchSap'],
          fileId: null,
        },
        orchSap: {
          id: 'orchSap',
          kind: 'port',
          name: 'orchestrator_sap',
          parentId: 'orch',
          typeRef: 'orchestrator_sai',
          sourceId: null,
          targetId: null,
          children: [],
          fileId: null,
        },
        blade: {
          id: 'blade',
          kind: 'part',
          name: 'bladeControl',
          parentId: 'Site',
          typeRef: 'ServerBlade',
          sourceId: null,
          targetId: null,
          children: ['bladeEth'],
          fileId: null,
        },
        bladeEth: {
          id: 'bladeEth',
          kind: 'port',
          name: 'eth',
          parentId: 'blade',
          typeRef: 'EthernetPort',
          sourceId: null,
          targetId: null,
          children: [],
          fileId: null,
        },
        alloc1: {
          id: 'alloc1',
          kind: 'connection',
          name: 'allocOrchApi',
          parentId: 'Site',
          typeRef: null,
          sourceId: 'orchSap',
          targetId: 'bladeEth',
          children: [],
          fileId: null,
        },
      },
      visualization: { nodes: {}, edges: {} },
      subdiagrams: [],
      menus: { orch: [{ viewId: 'orchView', name: 'OrchView' }] },
    }

    const { nodes, edges } = buildAllocationGraph({ view, viewMode: 'light' })
    expect(nodes.length).toBeGreaterThan(0)
    for (const node of nodes) {
      expect(Array.isArray(node.data?.menuItems)).toBe(true)
    }
    expect(edges.some((e) => e.id === 'alloc1')).toBe(true)
  })
})
