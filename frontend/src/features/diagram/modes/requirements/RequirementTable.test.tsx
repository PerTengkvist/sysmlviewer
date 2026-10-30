import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RequirementRow } from './buildRequirementRows'
import { RequirementTable } from './RequirementTable'

function row(partial: Partial<RequirementRow> & Pick<RequirementRow, 'id'>): RequirementRow {
  return {
    shortId: partial.id,
    name: partial.id,
    stereotype: 'requirement',
    text: '',
    derivedFrom: [],
    satisfiedBy: [],
    fileId: 'f',
    depth: 0,
    repeated: false,
    ...partial,
  }
}

const noop = () => {}

function render(rows: RequirementRow[], selectedIds: string[] = []) {
  return renderToStaticMarkup(
    createElement(RequirementTable, { rows, selectedIds, onSelect: noop }),
  )
}

describe('RequirementTable', () => {
  it('renders one row per requirement, tagged with its artifact id', () => {
    const html = render([row({ id: 'P::R1' }), row({ id: 'P::R2' })])
    expect(html.match(/<tr data-artifact-id=/g)?.length).toBe(2)
    expect(html).toContain('data-artifact-id="P::R1"')
    expect(html).toContain('data-artifact-id="P::R2"')
  })

  it('marks only the selected rows', () => {
    const html = render([row({ id: 'P::R1' }), row({ id: 'P::R2' })], ['P::R2'])
    expect(html.match(/class="selected"/g)?.length).toBe(1)
    expect(html).toMatch(/data-artifact-id="P::R2"[^>]*class="selected"/)
  })

  it('indents nested rows and marks repeated ones', () => {
    const html = render([row({ id: 'P::R1', name: 'Safety', depth: 1, repeated: true })])
    expect(html).toContain('padding-left:24px')
    expect(html).toContain('↺ Safety')
  })
})
