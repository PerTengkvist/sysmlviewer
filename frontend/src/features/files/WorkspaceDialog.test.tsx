import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { WorkspaceDialog } from './WorkspaceDialog'

const noop = () => {}

function render(extra: Partial<Parameters<typeof WorkspaceDialog>[0]>) {
  return renderToStaticMarkup(
    createElement(WorkspaceDialog, {
      open: true,
      mode: 'open',
      initialFolder: '/proj/car',
      onClose: noop,
      onCreate: noop,
      onOpenFolder: noop,
      onOpenProjectFile: noop,
      ...extra,
    }),
  )
}

describe('WorkspaceDialog', () => {
  it('prefills the folder path with the open workspace', () => {
    const html = render({})
    expect(html).toMatch(/aria-label="Folder path"[^>]*value="\/proj\/car"/)
  })

  it('renders nothing when closed', () => {
    expect(render({ open: false })).toBe('')
  })

  it('does not prefill the project.json field from the folder', () => {
    const html = render({ initialOpenMode: 'file' })
    expect(html).toContain('aria-label="Project file"')
    expect(html).not.toMatch(/aria-label="Project file"[^>]*value="\/proj\/car"/)
  })
})
