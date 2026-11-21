import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project } from '../../api'
import { DetailsPanel } from './DetailsPanel'

const noop = () => {}

type El = Project['semantic'][string]

function el(partial: Partial<El> & Pick<El, 'id' | 'kind' | 'name'>): El {
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
  const list = [
    el({ id: 'LA', kind: 'package', name: 'LA' }),
    el({ id: 'LA::KeyFob', kind: 'part', name: 'KeyFob', parentId: 'LA', isDefinition: true }),
    el({ id: 'LA::Car', kind: 'part', name: 'Car', parentId: 'LA', isDefinition: true }),
    el({ id: 'LA::Car::keyFob', kind: 'part', name: 'keyFob', parentId: 'LA::Car' }),
    el({ id: 'LA::PartA', kind: 'part', name: 'PartA', parentId: 'LA' }),
    el({ id: 'LA::PartA::sent', kind: 'eventOccurrence', name: 'sent', parentId: 'LA::PartA' }),
    el({ id: 'LA::partA', kind: 'part', name: 'partA', parentId: 'LA', typeRef: 'PartA' }),
    el({ id: 'D', kind: 'package', name: 'D' }),
    el({
      id: 'D::S',
      kind: 'occurrence',
      name: 'S',
      parentId: 'D',
      children: ['D::S::keyFob', 'D::S::a', 'D::S::m1'],
    }),
    el({
      id: 'D::S::keyFob',
      kind: 'part',
      name: 'keyFob',
      parentId: 'D::S',
      typeRef: 'KeyFob',
      typeTargetId: 'LA::KeyFob',
      isReference: true,
    }),
    el({
      id: 'D::S::keyFob_subsets_car_keyFob',
      kind: 'subsetting',
      name: 'keyFob_subsets_car_keyFob',
      parentId: 'D::S',
      sourceId: 'D::S::keyFob',
      targetId: 'LA::Car::keyFob',
    }),
    el({ id: 'D::S::a', kind: 'part', name: 'a', parentId: 'D::S' }),
    el({
      id: 'D::S::a_redefines_partA',
      kind: 'redefinition',
      name: 'a_redefines_partA',
      parentId: 'D::S',
      sourceId: 'D::S::a',
      targetId: 'LA::partA',
    }),
    el({
      id: 'D::S::m1',
      kind: 'message',
      name: 'm1',
      parentId: 'D::S',
      sourceId: 'D::S::a',
      targetId: 'D::S::keyFob',
      sourceEventId: 'LA::PartA::sent',
      targetEventId: null,
    }),
    el({ id: 'D::I', kind: 'interaction', name: 'I', parentId: 'D' }),
    el({
      id: 'D::I::msg1',
      kind: 'message',
      name: 'ping',
      parentId: 'D::I',
      sourceId: 'D::I::A',
      targetId: 'D::I::B',
    }),
  ]
  return {
    id: 'p1',
    name: 'T',
    createdAt: '',
    updatedAt: '',
    files: [{ id: 'f', name: 'f', content: '', warnings: [] }],
    semantic: Object.fromEntries(list.map((e) => [e.id, e])),
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

describe('DetailsPanel for sequence parts and messages in an occurrence', () => {
  it("shows the lifeline's type and subsetted feature as links", () => {
    const html = render('D::S::keyFob', { onOpenRelated: noop })
    expect(html).toMatch(/<dt>Type<\/dt><dd><button[^>]*data-related-id="LA::KeyFob"[^>]*>KeyFob</)
    expect(html).toMatch(
      /<dt>Subsets<\/dt><dd><button[^>]*data-related-id="LA::Car::keyFob"[^>]*>keyFob \(Car\)</,
    )
    // shown once: the Relations list does not repeat it
    expect(html.match(/data-related-id="LA::Car::keyFob"/g)).toHaveLength(1)
  })

  it('shows the redefined feature as a link', () => {
    const html = render('D::S::a', { onOpenRelated: noop })
    expect(html).toMatch(
      /<dt>Redefines<\/dt><dd><button[^>]*data-related-id="LA::partA"[^>]*>partA \(LA\)</,
    )
  })

  it('shows ref or composite', () => {
    expect(render('D::S::keyFob')).toContain('<dt>Reference</dt><dd>yes</dd>')
    expect(render('D::S::a')).toContain('<dt>Reference</dt><dd>no</dd>')
  })

  it('without a handler the targets are plain text', () => {
    const html = render('D::S::keyFob')
    expect(html).not.toContain('data-related-id="LA::KeyFob"')
    expect(html).toContain('keyFob (Car)')
  })

  it('shows source and target events of an occurrence message', () => {
    const html = render('D::S::m1')
    expect(html).toContain('<dt>From</dt><dd class="mono">a.sent</dd>')
    expect(html).toContain('<dt>To</dt><dd class="mono">keyFob</dd>')
  })

  it('does not show From and To for a legacy message', () => {
    const html = render('D::I::msg1')
    expect(html).not.toContain('<dt>From</dt>')
    expect(html).not.toContain('<dt>Reference</dt>')
  })

  it('shows no Type row for a subsetting relation', () => {
    const p = project()
    p.semantic['D::S::keyFob_subsets_car_keyFob'].typeRef = 'car.keyFob'
    const html = renderToStaticMarkup(
      createElement(DetailsPanel, {
        project: p,
        selectedId: 'D::S::keyFob_subsets_car_keyFob',
        onRoutingChange: noop,
      }),
    )
    expect(html).not.toContain('<dt>Type</dt>')
  })

  it('does not add lifeline rows to parts outside an occurrence', () => {
    const html = render('LA::Car::keyFob')
    expect(html).not.toContain('<dt>Reference</dt>')
  })
})
