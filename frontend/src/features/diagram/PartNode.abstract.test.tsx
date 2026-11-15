import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { PartNode, partStereotypeKeyword, type PartNodeData } from './PartNode'

function render(data: Partial<PartNodeData>): string {
  const props = {
    id: 'n1',
    data: {
      label: 'FunctionNode',
      artifactId: 'P::FunctionNode',
      kind: 'part',
      typeRef: null,
      ports: [],
      menuItems: [],
      viewMode: 'light',
      ...data,
    },
    selected: false,
  } as unknown as NodeProps
  return renderToStaticMarkup(
    createElement(ReactFlowProvider, null, createElement(PartNode, props)),
  )
}

describe('PartNode abstract definition', () => {
  it('keyword is «abstract part def» for an abstract definition, «abstract part» for a usage', () => {
    expect(
      partStereotypeKeyword({ kind: 'part', isAbstract: true, isDefinition: true }),
    ).toBe('abstract part def')
    expect(partStereotypeKeyword({ kind: 'part', isAbstract: true })).toBe('abstract part')
  })

  it('keeps «part» for concrete parts, definition or not', () => {
    expect(partStereotypeKeyword({ kind: 'part' })).toBe('part')
    expect(partStereotypeKeyword({ kind: 'part', isDefinition: true })).toBe('part')
    expect(partStereotypeKeyword({ kind: 'package' })).toBe('package')
    expect(
      partStereotypeKeyword({ kind: 'part', isDefinition: true, metadataKeywords: ['FUN'] }),
    ).toBe('FUN')
  })

  it('renders the name in italics with the abstract keyword', () => {
    const html = render({ isAbstract: true, isDefinition: true })
    expect(html).toContain('«abstract part def»')
    expect(html).toMatch(/class="part-node-title is-abstract"[^>]*>FunctionNode/)
  })

  it('an abstract usage shows «abstract part»', () => {
    const html = render({ isAbstract: true })
    expect(html).toContain('«abstract part»')
    expect(html).not.toContain('part def')
  })

  it('a concrete part is not italic', () => {
    const html = render({})
    expect(html).toContain('«part»')
    expect(html).not.toContain('is-abstract')
  })
})
