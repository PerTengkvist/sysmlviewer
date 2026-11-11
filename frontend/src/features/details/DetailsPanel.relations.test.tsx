import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project } from '../../api'
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
    metadataKeywords: [],
    fileId: 'f',
    ...partial,
  }
}

function project(): Project {
  return {
    id: 'p1',
    name: 'Trace',
    createdAt: '',
    updatedAt: '',
    files: [{ id: 'f', name: 'f', content: '', warnings: [] }],
    semantic: {
      'UC::Start': el({
        id: 'UC::Start',
        kind: 'useCase',
        name: 'StartVehicle',
        children: ['UC::Start::objective_1'],
      }),
      'UC::Start::objective_1': el({
        id: 'UC::Start::objective_1',
        kind: 'dependency',
        name: 'objective_1',
        parentId: 'UC::Start',
        sourceId: 'UC::Start',
        targetId: 'R::PowerModes',
        metadataKeywords: ['objective'],
      }),
      'UC::dep2': el({
        id: 'UC::dep2',
        kind: 'dependency',
        name: 'dep2',
        sourceId: 'UC::Start',
        targetId: 'R::DriveToDest',
        metadataKeywords: ['refine'],
      }),
      'R::PowerModes': el({
        id: 'R::PowerModes',
        kind: 'requirement',
        name: 'PowerModes',
        shortId: 'REQ-PERF-06',
      }),
      'R::DriveToDest': el({
        id: 'R::DriveToDest',
        kind: 'requirement',
        name: 'DriveToDestination',
        shortId: 'US-DRIVE-01',
      }),
    },
    visualization: { nodes: {}, edges: {} },
    views: [],
  }
}

function render(selectedId: string, extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(DetailsPanel, {
      project: project(),
      selectedId,
      onRoutingChange: noop,
      ...extra,
    }),
  )
}

describe('DetailsPanel relations', () => {
  it('shows outgoing relations of a use case with the requirement at the far end', () => {
    const html = render('UC::Start')
    expect(html).toContain('<h3>Relations</h3>')
    expect(html).toContain('«objective»')
    expect(html).toContain('REQ-PERF-06 PowerModes')
    expect(html).toContain('«refine»')
    expect(html).toContain('US-DRIVE-01 DriveToDestination')
    expect(html).not.toContain('>objective_1<')
  })

  it('shows on a requirement which use case points at it', () => {
    const html = render('R::PowerModes')
    expect(html).toContain('«objective»')
    expect(html).toContain('StartVehicle')
    expect(html).toContain('data-direction="in"')
  })

  it('makes the far end clickable when details can be opened', () => {
    const html = render('R::PowerModes', { onOpenRelated: noop })
    expect(html).toMatch(/<button[^>]*data-related-id="UC::Start"/)
  })
})
