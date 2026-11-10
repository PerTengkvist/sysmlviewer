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

describe('LeftSidebar view definitions', () => {
  it('shows a view def that is not a diagram as an element, and its usage as a diagram', () => {
    const base = tinyProject()
    const element = (id: string, extra: Record<string, unknown>) => ({
      id,
      kind: 'view',
      name: id.split('::').pop(),
      parentId: null,
      typeRef: 'GeneralView',
      sourceId: null,
      targetId: null,
      children: [],
      ...extra,
    })
    const project = {
      ...base,
      semantic: {
        CarViewDef: element('CarViewDef', { isDefinition: true }),
        carView: element('carView', { typeRef: 'CarViewDef' }),
      },
      views: [
        { id: 'carView', name: 'carView', rootArtifactId: 'carView', parentViewId: null, typeRef: 'GeneralView' },
      ],
    } as unknown as Parameters<typeof LeftSidebar>[0]['project']

    const html = render({ project })

    expect(html).toMatch(/data-artifact-id="carView" class="tree-row is-view/)
    expect(html).toMatch(/data-artifact-id="CarViewDef" class="tree-row is-other/)
    expect(html).toContain('>view def<')
  })
})
