import { describe, expect, it } from 'vitest'
import { buildUseCaseGraph } from './buildUseCaseGraph'
import type { SemanticElement, ViewPayload } from '../../../../api'

const el = (id: string, kind: string, parentId: string | null): SemanticElement =>
  ({
    id,
    kind,
    name: id.split('::').pop() || id,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
  }) as SemanticElement

describe('use case view with `expose UseCases::*;`', () => {
  it('draws the use cases even though the package itself is not sent', () => {
    const view = {
      view: {
        id: 'UseCases::V',
        name: 'V',
        rootArtifactId: 'UseCases',
        parentViewId: null,
        typeRef: 'UseCaseView',
      },
      diagramMode: 'useCase',
      exposeRootIds: ['UseCases'],
      exposeKinds: { UseCases: 'members' },
      exposeControlsDepth: true,
      semantic: {
        'UseCases::Login': el('UseCases::Login', 'useCase', 'UseCases'),
        'UseCases::Drive': el('UseCases::Drive', 'useCase', 'UseCases'),
      },
      visualization: { nodes: {}, edges: {} },
      subdiagrams: [],
      menus: {},
    } as ViewPayload
    const { nodes } = buildUseCaseGraph(view, 'light')
    const useCases = nodes.filter((n) => n.type === 'useCase').map((n) => n.id)
    expect(useCases.sort()).toEqual(['UseCases::Drive', 'UseCases::Login'])
  })
})
