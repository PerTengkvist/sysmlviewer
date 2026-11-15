import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { DependencyTree, DependencyTreeNode } from '../../api'
import { DependencyTreeView } from './DependencyTreeView'

function node(
  partial: Partial<DependencyTreeNode> & Pick<DependencyTreeNode, 'id' | 'name' | 'kind'>,
): DependencyTreeNode {
  return {
    shortId: null,
    relationId: null,
    label: null,
    alternatives: 0,
    repeated: false,
    truncated: false,
    children: [],
    ...partial,
  }
}

const tree: DependencyTree = {
  root: { id: 'R::Stop', name: 'Stop', kind: 'requirement', shortId: 'R-2' },
  up: [
    node({ id: 'R::Top', name: 'Top', kind: 'requirement', label: 'refine' }),
    node({
      id: 'R::Safety',
      name: 'Safety',
      kind: 'requirement',
      shortId: 'R-1',
      label: 'refine',
      relationId: 'R::dep1',
      alternatives: 2,
    }),
  ],
  down: node({
    id: 'R::Stop',
    name: 'Stop',
    kind: 'requirement',
    shortId: 'R-2',
    children: [
      node({
        id: 'A::brakes',
        name: 'brakes',
        kind: 'part',
        label: 'satisfy',
        relationId: 'R::satisfy_1',
        children: [
          node({
            id: 'A::pedal',
            name: 'pedal',
            kind: 'part',
            label: 'connection',
            children: [
              node({
                id: 'A::brakes',
                name: 'brakes',
                kind: 'part',
                label: 'connection',
                repeated: true,
              }),
            ],
          }),
        ],
      }),
      node({ id: 'U::Brake', name: 'Brake', kind: 'useCase', label: 'objective' }),
    ],
  }),
  truncated: false,
}

const render = () =>
  renderToStaticMarkup(<DependencyTreeView tree={tree} onOpenElement={() => {}} />)

describe('DependencyTreeView', () => {
  it('shows the up chain above the root, the most abstract first', () => {
    const html = render()
    const top = html.indexOf('data-related-id="R::Top"')
    const safety = html.indexOf('data-related-id="R::Safety"')
    const root = html.indexOf('dependency-tree-root')
    expect(top).toBeGreaterThan(-1)
    expect(safety).toBeGreaterThan(top)
    expect(root).toBeGreaterThan(safety)
    expect(html).toContain('R-1 Safety')
  })

  it('marks the root', () => {
    const html = render()
    expect(html).toMatch(/class="[^"]*dependency-tree-root[^"]*is-root[^"]*"[^>]*aria-current="true"/)
    expect(html).toContain('R-2 Stop')
  })

  it('renders the down tree as nested lists with a label and a link per branch', () => {
    const html = render()
    expect(html).toContain('«satisfy»')
    expect(html).toContain('«objective»')
    expect(html).toMatch(/<button[^>]*class="link-button"[^>]*data-related-id="A::brakes"/)
    expect(html).toMatch(/<button[^>]*class="link-button"[^>]*data-related-id="U::Brake"/)
    // pedal is nested inside brakes' list.
    const brakes = html.indexOf('data-related-id="A::brakes"')
    const pedal = html.indexOf('data-related-id="A::pedal"')
    const between = html.slice(brakes, pedal)
    expect(between).toContain('<ul')
  })

  it('shows alternatives as +N', () => {
    const html = render()
    expect(html).toMatch(/class="dependency-tree-alternatives"[^>]*>\+2</)
  })

  it('marks a repeated node and gives it no children', () => {
    const html = render()
    const repeated = html.match(/<li[^>]*class="[^"]*is-repeated[^"]*"[^>]*>(.*?)<\/li>/)
    expect(repeated).not.toBeNull()
    expect(repeated![1]).toContain('data-related-id="A::brakes"')
    expect(repeated![1]).not.toContain('<ul')
    expect(html).toContain('dependency-tree-repeated')
  })

  it('offers a collapse toggle on a branch with children', () => {
    const html = render()
    expect(html).toMatch(/<button[^>]*class="dependency-tree-toggle"[^>]*aria-expanded="true"/)
    expect(html).toContain('▾')
  })
})
