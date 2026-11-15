import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { tinyProject } from '../../testFixtures/tinyProject'
import { DependencyTreeDialog } from './DependencyTreeDialog'

describe('DependencyTreeDialog', () => {
  it('is a dialog named after the element, loading its tree', () => {
    const html = renderToStaticMarkup(
      <DependencyTreeDialog
        projectId="p1"
        elementId="Pkg::car"
        semantic={tinyProject().semantic}
        onClose={() => {}}
        onOpenElement={() => {}}
      />,
    )
    expect(html).toContain('class="element-dialog-backdrop"')
    expect(html).toMatch(/role="dialog"[^>]*aria-label="Dependency tree Car"/)
    expect(html).toContain('aria-label="Maximize"')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('Loading…')
  })
})
