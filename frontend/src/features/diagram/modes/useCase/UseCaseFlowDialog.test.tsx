import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { UseCaseFlowDialog } from './UseCaseFlowDialog'

const semantic: Record<string, SemanticElement> = {
  'UC::Brake': {
    id: 'UC::Brake',
    kind: 'useCase',
    name: 'Brake',
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
  },
}

describe('UseCaseFlowDialog', () => {
  it('has a dependency tree button in its heading', () => {
    const html = renderToStaticMarkup(
      <UseCaseFlowDialog
        useCaseId="UC::Brake"
        semantic={semantic}
        onClose={() => {}}
        onOpenDependencyTree={() => {}}
      />,
    )
    const header = html.match(/<header[^>]*>(.*?)<\/header>/)
    expect(header?.[1]).toMatch(
      /<button[^>]*title="dependency tree"[^>]*aria-label="dependency tree"/,
    )
  })
})
