import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project, ViewPayload } from '../../api'
import { DetailsPanel } from './DetailsPanel'

const noop = () => {}

function el(
  partial: Partial<Project['semantic'][string]> &
    Pick<Project['semantic'][string], 'id' | 'kind' | 'name'>,
): Project['semantic'][string] {
  return {
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    ...partial,
  }
}

function projectWithInclude(): Project {
  return {
    id: 'p1',
    name: 'UC',
    createdAt: '',
    updatedAt: '',
    files: [{ id: 'f', name: 'f', content: '', warnings: [] }],
    semantic: {
      P: el({ id: 'P', kind: 'package', name: 'P', children: ['P::Login', 'P::Auth', 'P::inc1'] }),
      'P::Login': el({ id: 'P::Login', kind: 'useCase', name: 'Login', parentId: 'P' }),
      'P::Auth': el({ id: 'P::Auth', kind: 'useCase', name: 'Auth', parentId: 'P' }),
      'P::inc1': el({
        id: 'P::inc1',
        kind: 'include',
        name: 'inc1',
        parentId: 'P::Login',
        sourceId: 'P::Login',
        targetId: 'P::Auth',
      }),
    },
    visualization: {
      nodes: {},
      edges: {
        'P::inc1': {
          artifactId: 'P::inc1',
          routing: 'direct',
          waypoints: [],
        },
      },
    },
    views: [],
  }
}

function useCaseView(project: Project): ViewPayload {
  return {
    view: {
      id: 'P::V',
      name: 'UC',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'UseCaseView',
    },
    diagramMode: 'useCase',
    semantic: project.semantic,
    visualization: project.visualization,
    subdiagrams: [],
    menus: {},
  }
}

function structureView(project: Project): ViewPayload {
  return {
    ...useCaseView(project),
    diagramMode: 'structure',
  }
}

function render(
  extra: Partial<Parameters<typeof DetailsPanel>[0]> & {
    selectedId: string
    project: Project
    viewPayload: ViewPayload
  },
) {
  return renderToStaticMarkup(
    createElement(DetailsPanel, {
      onRoutingChange: noop,
      onAutoroute: noop,
      viewVisualization: extra.viewPayload.visualization,
      ...extra,
    }),
  )
}

describe('DetailsPanel relation Redraw (use case)', () => {
  it('shows Redraw for an include with direct routing on a use-case view', () => {
    const project = projectWithInclude()
    const html = render({
      project,
      selectedId: 'P::inc1',
      viewPayload: useCaseView(project),
    })
    expect(html).toContain('>Redraw<')
    expect(html).toContain('title="Redraw only this relation"')
  })

  it('does not show Redraw for the same include on a structure view', () => {
    const project = projectWithInclude()
    const html = render({
      project,
      selectedId: 'P::inc1',
      viewPayload: structureView(project),
    })
    expect(html).not.toContain('>Redraw<')
    expect(html).not.toContain('title="Redraw only this relation"')
  })

  it('shows Redraw for a synthetic use: association on a use-case view', () => {
    const project = projectWithInclude()
    const html = render({
      project,
      selectedId: 'use:P::a->P::Login',
      viewPayload: useCaseView(project),
    })
    expect(html).toContain('>use<')
    expect(html).toContain('>Redraw<')
    expect(html).toContain('title="Redraw only this relation"')
  })
})
