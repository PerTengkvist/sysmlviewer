import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project, Realization, SemanticElement } from '../../api'
import { DetailsPanel } from './DetailsPanel'
import { RealizationSections } from './RealizationSections'
import { elementRealization } from './realizationLinks'

const noop = () => {}

function el(
  partial: Partial<SemanticElement> & Pick<SemanticElement, 'id' | 'kind' | 'name'>,
): SemanticElement {
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

const semantic: Record<string, SemanticElement> = Object.fromEntries(
  [
    el({ id: 'UC::Start', kind: 'useCase', name: 'Start', shortId: 'UCA', isDefinition: true }),
    el({ id: 'UC::Start::checkKey', kind: 'action', name: 'checkKey', parentId: 'UC::Start' }),
    el({ id: 'UC::Start::ask', kind: 'action', name: 'ask', parentId: 'UC::Start' }),
    el({ id: 'F::Sec', kind: 'part', name: 'Security', isDefinition: true }),
    el({ id: 'F::Sec::auth', kind: 'part', name: 'auth', parentId: 'F::Sec' }),
  ].map((e) => [e.id, e]),
)

const realization: Realization = {
  links: [],
  actorSteps: {},
  systemSteps: { 'UC::Start': ['UC::Start::checkKey', 'UC::Start::ask'] },
  stepRealizers: {},
  coarseRealizers: {},
  realizerNodes: {},
  nodeParts: {},
  useCases: {
    'UC::Start': {
      functions: { 'F::Sec': 'step' },
      nodes: { 'F::Sec::auth': 'step' },
      parts: {},
      viaInclude: [],
      declared: [],
      origin: {},
      nodeFunctions: { 'F::Sec::auth': ['F::Sec'] },
    },
  },
  inScope: ['UC::Start'],
  findings: [],
}

function project(): Project {
  return {
    id: 'p1',
    name: 'R',
    createdAt: '',
    updatedAt: '',
    files: [{ id: 'f', name: 'f', content: '', warnings: [] }],
    semantic,
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
      realization,
      ...extra,
    }),
  )
}

describe('Details: realization', () => {
  it('shows Realized by on a use case, with precision and typed labels', () => {
    const html = render('UC::Start')
    expect(html).toContain('<h3>Realized by</h3>')
    expect(html).toContain('data-related-id="F::Sec"')
    expect(html).toContain('data-related-id="F::Sec::auth"')
    expect(html).toContain('<span class="relation-element-type">part def</span> Security')
    expect(html).toContain('data-precision="step"')
  })

  it('makes the entries clickable', () => {
    const html = render('UC::Start', { onOpenRelated: noop })
    expect(html).toMatch(/<button[^>]*data-related-id="F::Sec::auth"[^>]*>/)
  })

  it('shows Realizes on a function node', () => {
    const html = render('F::Sec::auth')
    expect(html).toContain('<h3>Realizes</h3>')
    expect(html).toContain('data-use-case-id="UC::Start"')
    expect(html).toContain('use case def</span> UCA Start')
  })

  it('shows Not realized on an unrealized system step', () => {
    expect(render('UC::Start::ask')).toContain('Not realized')
  })

  it('shows nothing without a realization or without content', () => {
    expect(render('UC::Start', { realization: null })).not.toContain('Realized by')
    expect(render('F::Sec')).toContain('<h3>Realizes</h3>')
    const bare = renderToStaticMarkup(
      createElement(RealizationSections, {
        info: elementRealization(realization, semantic, 'nope'),
        semantic,
      }),
    )
    expect(bare).toBe('')
  })

  it('shows a finding as a warning row', () => {
    const withFinding: Realization = {
      ...realization,
      findings: [{ code: 'untraced-function-step', elementId: 'UC::Start::ask', message: 'no realizer' }],
    }
    const html = render('UC::Start::ask', { realization: withFinding })
    expect(html).toContain('class="realization-finding"')
    expect(html).toContain('no realizer')
  })
})
