import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LayoutScope, SemanticElement } from '../../api'
import { LayoutWizardDialog } from './LayoutWizardDialog'
import type { LayoutArtefact } from './layoutWizard'

const noop = () => {}

const art = (id: string, parentId: string | null, kind = 'part'): LayoutArtefact => ({
  id,
  name: id,
  kind,
  parentId,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
})

const artefacts = [art('P', null, 'package'), art('A', 'P'), art('X', null), art('x1', 'X')]

const semantic = Object.fromEntries(
  artefacts.map((a) => [a.id, { id: a.id, name: a.name, kind: a.kind } as SemanticElement]),
)

const rule = (id: string) => ({
  id,
  kind: 'part',
  namePattern: '*',
  placement: 'below',
  peerKind: 'part',
  peerNamePattern: '*',
})

const scopes: LayoutScope[] = [
  {
    id: 'd',
    target: { kind: 'diagram' },
    enabled: true,
    layering: {
      enabled: true,
      direction: 'left-right',
      layers: [
        { id: 'l1', name: 'In' },
        { id: 'l2', name: 'Out' },
      ],
    },
    rules: [rule('r1'), rule('r2')],
  },
  {
    id: 'x',
    target: { kind: 'element', id: 'X' },
    enabled: false,
    layering: { enabled: false, direction: 'top-down', layers: [] },
    rules: [rule('r3')],
  },
]

function render(list: LayoutScope[]) {
  return renderToStaticMarkup(
    createElement(LayoutWizardDialog, {
      open: true,
      scopes: list,
      semantic,
      artefacts,
      boundaryId: null,
      onChangeScopes: noop,
      onApplyPositions: noop,
      onClose: noop,
    }),
  )
}

const tag = (html: string, testId: string) =>
  html.match(new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? ''

describe('LayoutWizardDialog scope tabs', () => {
  it('has a tab with a close button per scope, and a + button', () => {
    const html = render(scopes)
    expect(html).toContain('role="tablist"')
    expect(tag(html, 'lw-scope-tab-d')).toContain('aria-selected="true"')
    expect(tag(html, 'lw-scope-tab-x')).toContain('aria-selected="false"')
    expect(html).toMatch(/data-testid="lw-scope-tab-d"[^>]*>[^<]*Whole diagram/)
    expect(html).toMatch(/data-testid="lw-scope-tab-x"[^>]*>[^<]*Part X/)
    expect(tag(html, 'lw-scope-close-d')).toBeTruthy()
    expect(tag(html, 'lw-scope-close-x')).toBeTruthy()
    expect(tag(html, 'lw-scope-add')).toBeTruthy()
  })

  it("shows the active scope's enable, layers and own rules", () => {
    const html = render(scopes)
    expect(tag(html, 'lw-scope-enabled')).toContain('checked')
    expect(tag(html, 'lw-layered-enabled')).toContain('checked')
    expect(html).toContain('data-testid="lw-direction"')
    expect(html).toContain('data-testid="lw-layer-name-1"')
    expect(html.match(/data-testid="lw-row"/g)).toHaveLength(2)
  })

  it('a disabled scope is shown off but stays editable', () => {
    const html = render([scopes[1]])
    expect(tag(html, 'lw-scope-enabled')).not.toContain('checked')
    expect(html.match(/data-testid="lw-row"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-label="Name pattern"(?![^>]*disabled)/)
  })

  it('with no scopes it says so and offers +', () => {
    const html = render([])
    expect(html).toContain('No scopes yet')
    expect(tag(html, 'lw-scope-add')).toBeTruthy()
    expect(html).not.toContain('data-testid="lw-row"')
  })
})
