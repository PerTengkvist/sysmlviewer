import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HierarchyLevelsSection } from './DetailsPanel'
import type { ViewPayload } from '../../api'

function render(extra: Partial<ViewPayload>) {
  const viewPayload = {
    view: {
      id: 'P::V',
      name: 'V',
      rootArtifactId: 'P',
      parentViewId: null,
      typeRef: 'GeneralView',
    },
    diagramMode: 'structure',
    hierarchicalLevels: 2,
    hierarchicalLevelsOverride: null,
    semantic: {},
    visualization: { nodes: {}, edges: {} },
    subdiagrams: [],
    menus: {},
    ...extra,
  } as ViewPayload
  return renderToStaticMarkup(
    createElement(HierarchyLevelsSection, {
      viewPayload,
      globalHierarchicalLevels: 2,
      onHierarchyOverrideChange: () => {},
    }),
  )
}

const inputs = (html: string): string[] => html.match(/<input[^>]*>/g) ?? []

describe('Diagram levels for a wildcard expose', () => {
  it('says the expose sets the depth and turns the level inputs off', () => {
    const html = render({ exposeControlsDepth: true, exposeKinds: { P: 'members' } })
    expect(html).toContain("Depth is set by this view&#x27;s expose (::* / ::**)")
    const all = inputs(html)
    expect(all.length).toBeGreaterThan(0)
    for (const input of all) expect(input).toContain('disabled')
  })

  it('keeps the inputs usable for a plain expose', () => {
    const html = render({ exposeControlsDepth: false })
    expect(html).not.toContain('Depth is set by')
    const checkbox = inputs(html).find((i) => i.includes('type="checkbox"'))!
    expect(checkbox).not.toContain('disabled')
  })
})
