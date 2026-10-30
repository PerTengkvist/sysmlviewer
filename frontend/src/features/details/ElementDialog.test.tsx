import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  tinyProject,
  tinyProjectWithRequirement,
} from '../../testFixtures/tinyProject'
import { ElementDialog } from './ElementDialog'
import { DEFAULT_ELEMENT_DIALOG_SIZE } from './elementDialogState'

const noop = () => {}

function render(size = DEFAULT_ELEMENT_DIALOG_SIZE) {
  return renderToStaticMarkup(
    createElement(ElementDialog, {
      elementId: 'Pkg::car',
      size,
      onSizeChange: noop,
      onClose: noop,
      detailsProps: {
        project: tinyProject(),
        selectedId: 'Pkg::car',
        onRoutingChange: noop,
      },
    }),
  )
}

describe('ElementDialog', () => {
  it('is a dialog labelled with kind and name', () => {
    const html = render()
    expect(html).toMatch(/role="dialog"[^>]*aria-label="part Car"/)
  })

  it('renders details before docs, each in its own scroll pane', () => {
    const html = render()
    const details = html.indexOf('class="element-dialog-pane is-details"')
    const docs = html.indexOf('class="element-dialog-pane is-docs"')
    expect(details).toBeGreaterThan(-1)
    expect(docs).toBeGreaterThan(details)
    expect(html.match(/element-dialog-pane/g)?.length).toBe(2)
  })

  it('uses the stored size and offers Maximize when not maximized', () => {
    const html = render()
    expect(html).toMatch(/class="element-dialog"[^>]*style="width:960px;height:640px"/)
    expect(html).toContain('aria-label="Maximize"')
  })

  it('uses the maximized class and offers Restore when maximized', () => {
    const html = render({ ...DEFAULT_ELEMENT_DIALOG_SIZE, maximized: true })
    expect(html).toContain('class="element-dialog is-maximized"')
    expect(html).not.toContain('width:960px')
    expect(html).toContain('aria-label="Restore"')
  })

  it('labels a requirement with its shortId and name', () => {
    const html = renderToStaticMarkup(
      createElement(ElementDialog, {
        elementId: 'Pkg::R1',
        size: DEFAULT_ELEMENT_DIALOG_SIZE,
        onSizeChange: noop,
        onClose: noop,
        detailsProps: {
          project: tinyProjectWithRequirement(),
          selectedId: 'Pkg::R1',
          onRoutingChange: noop,
        },
      }),
    )
    expect(html).toMatch(/role="dialog"[^>]*aria-label="requirement R-01 Safety"/)
    expect(html).toContain('<span class="artifact-kind">requirement</span>')
    const details = html.slice(html.indexOf('is-details'), html.indexOf('is-docs'))
    expect(details).toContain('Safety')
    expect(html.match(/element-dialog-pane/g)?.length).toBe(2)
  })

  it('shows the element in the details pane', () => {
    const html = render()
    const details = html.slice(html.indexOf('is-details'), html.indexOf('is-docs'))
    expect(details).toContain('Car')
  })
})
