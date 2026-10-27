import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkspaceLabel } from './WorkspaceLabel'

describe('WorkspaceLabel', () => {
  it('renders name and the tail of the root with the full path as title', () => {
    const root = '/Users/per/Coding/In2ition/sysmlviewer/examples/car'
    const html = renderToStaticMarkup(
      createElement(WorkspaceLabel, { name: 'Car', root, maxChars: 20 }),
    )
    expect(html).toContain('class="workspace-name"')
    expect(html).toContain('>Car<')
    expect(html).toContain('class="workspace-path"')
    expect(html).toContain(`title="${root}"`)
    expect(html).toContain('…/examples/car')
    expect(html).not.toContain('/Users/per/Coding/In2ition/sysmlviewer/examples/car<')
  })

  it('renders only the name when there is no root', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceLabel, { name: 'Car', root: null }),
    )
    expect(html).toContain('>Car<')
    expect(html).not.toContain('workspace-path')
  })

  it('falls back to "No project" without a name', () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceLabel, { name: null, root: null }),
    )
    expect(html).toContain('No project')
  })
})
