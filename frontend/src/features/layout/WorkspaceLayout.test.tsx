import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RightSidebar } from '../details/RightSidebar'
import { WorkspaceLayout } from './WorkspaceLayout'

const noop = () => {}

function render(rightCollapsed: boolean) {
  return renderToStaticMarkup(
    createElement(WorkspaceLayout, {
      layout: { horizontalPanelSizes: [18, 64, 18] },
      onLayoutChange: noop,
      rightCollapsed,
      onToggleRight: noop,
      left: 'L',
      center: 'C',
      right: 'R',
    }),
  )
}

describe('WorkspaceLayout right panel', () => {
  it('renders the right panel without a strip when expanded', () => {
    const html = render(false)
    expect(html).toContain('id="right"')
    expect(html).not.toContain('panel-collapsed-strip')
  })

  it('renders a show-strip when collapsed', () => {
    const html = render(true)
    expect(html).toContain('panel-collapsed-strip')
    expect(html).toContain('aria-label="Show details panel"')
  })
})

describe('RightSidebar toolbar', () => {
  it('has a hide button', () => {
    const html = renderToStaticMarkup(
      createElement(RightSidebar, {
        layout: { rightPanelSizes: [50, 50] },
        onLayoutChange: noop,
        onToggle: noop,
        project: null,
        selectedId: null,
        onRoutingChange: noop,
      }),
    )
    expect(html).toContain('aria-label="Hide details panel"')
  })
})
