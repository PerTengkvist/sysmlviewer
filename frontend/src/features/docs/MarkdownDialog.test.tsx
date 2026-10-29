import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownDialog } from './MarkdownDialog'
import { DEFAULT_MARKDOWN_DIALOG_SIZE } from './markdownDialogState'

vi.mock('../../api', () => ({
  api: {
    fetchDocumentation: () =>
      Promise.resolve({ content: '# Hello\n\n[next](other.md)' }),
  },
}))

const noop = () => {}

describe('MarkdownDialog', () => {
  it('is a dialog labelled with the markdown file name', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownDialog, {
        projectId: 'p1',
        docPath: 'physical_architecture/docs/datacenter_parts.GpuUnit.md',
        size: DEFAULT_MARKDOWN_DIALOG_SIZE,
        onSizeChange: noop,
        onClose: noop,
        onNavigate: noop,
      }),
    )
    expect(html).toMatch(
      /role="dialog"[^>]*aria-label="datacenter_parts.GpuUnit.md"/,
    )
    expect(html).toContain('Loading')
  })
})
