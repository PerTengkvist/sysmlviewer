import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project } from '../../api'
import { tinyProject } from '../../testFixtures/tinyProject'
import { DetailsPanel } from './DetailsPanel'

const noop = () => {}

function withSatisfy(): Project {
  const p = tinyProject()
  p.semantic['Pkg::satisfy_1'] = {
    id: 'Pkg::satisfy_1',
    kind: 'satisfy',
    name: 'satisfy_1',
    parentId: 'Pkg',
    typeRef: null,
    sourceId: 'Pkg::car',
    targetId: 'Pkg::R1',
    children: [],
    fileId: 'main.sysml',
  }
  return p
}

function render(selectedId: string, onOpenDependencyTree?: (id: string) => void) {
  return renderToStaticMarkup(
    createElement(DetailsPanel, {
      project: withSatisfy(),
      selectedId,
      onRoutingChange: noop,
      onOpenDependencyTree,
    }),
  )
}

const BUTTON = /<button[^>]*title="dependency tree"[^>]*aria-label="dependency tree"/

describe('DetailsPanel dependency tree button', () => {
  it('is in the Details heading for an element', () => {
    const html = render('Pkg::car', noop)
    expect(html).toMatch(BUTTON)
    const heading = html.match(/<h2[^>]*>(.*?)<\/h2>/)
    expect(heading?.[1]).toContain('Details')
    expect(heading?.[1]).toContain('aria-label="dependency tree"')
  })

  it('is not offered for a relation', () => {
    expect(render('Pkg::satisfy_1', noop)).not.toMatch(BUTTON)
  })

  it('is not offered without a handler', () => {
    expect(render('Pkg::car')).not.toMatch(BUTTON)
  })
})
