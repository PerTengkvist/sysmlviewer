import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { tinyProject } from '../../testFixtures/tinyProject'
import { LeftSidebar } from './LeftSidebar'

const noop = () => {}

function render(extra: Partial<Parameters<typeof LeftSidebar>[0]>) {
  return renderToStaticMarkup(
    createElement(LeftSidebar, {
      project: tinyProject(),
      docPaths: [],
      activeTab: 'views',
      onTabChange: noop,
      activeViewId: null,
      selectedArtifactId: null,
      onSelectView: noop,
      onSelectArtifact: noop,
      onAddFilePath: noop,
      onRefreshFile: noop,
      onShowText: noop,
      onShowMarkdown: noop,
      ...extra,
    }),
  )
}

function section(html: string, cls: string): string {
  const start = html.indexOf(`class="${cls}`)
  expect(start, `missing .${cls}`).toBeGreaterThan(-1)
  return html.slice(start)
}

describe('LeftSidebar header/body split', () => {
  it('keeps tabs and model toolbar in the header, tree in the body', () => {
    const html = render({ activeTab: 'views' })
    const header = html.slice(html.indexOf('class="sidebar-header"'), html.indexOf('class="sidebar-body'))
    expect(header).toContain('>Model<')
    expect(header).toContain('>Files<')
    expect(header).toContain('>Collapse<')
    expect(header).toContain('>Filter<')
    const body = section(html, 'sidebar-body')
    expect(body).toContain('class="view-tree"')
    expect(body).not.toContain('model-tree-toolbar')
  })

  it('keeps the add-file zone in the header and the file tree in the body', () => {
    const html = render({ activeTab: 'files' })
    const header = html.slice(html.indexOf('class="sidebar-header"'), html.indexOf('class="sidebar-body'))
    expect(header).toContain('upload-zone')
    const body = section(html, 'sidebar-body')
    expect(body).toContain('file-tree')
    expect(body).toContain('Right-click a SysML file')
  })

  it('disables Collapse and Filter without a project', () => {
    const html = render({ activeTab: 'views', project: null })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Collapse</)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Filter</)
  })
})
