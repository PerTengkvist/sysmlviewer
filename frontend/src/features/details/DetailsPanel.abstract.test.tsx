import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Project } from '../../api'
import { DetailsPanel } from './DetailsPanel'

function project(isAbstract: boolean): Project {
  return {
    id: 'p1',
    name: 'P',
    createdAt: '',
    updatedAt: '',
    files: [{ id: 'f', name: 'f', content: '', warnings: [] }],
    semantic: {
      'P::FunctionNode': {
        id: 'P::FunctionNode',
        kind: 'part',
        name: 'FunctionNode',
        parentId: null,
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        metadataKeywords: [],
        fileId: 'f',
        ...(isAbstract ? { isAbstract: true } : {}),
      },
    },
    visualization: { nodes: {}, edges: {} },
    views: [],
  }
}

function render(isAbstract: boolean): string {
  return renderToStaticMarkup(
    createElement(DetailsPanel, {
      project: project(isAbstract),
      selectedId: 'P::FunctionNode',
      onRoutingChange: () => {},
    }),
  )
}

describe('DetailsPanel abstract', () => {
  it('shows Abstract: yes for an abstract definition', () => {
    expect(render(true)).toMatch(/<dt>Abstract<\/dt><dd>yes<\/dd>/)
  })

  it('has no Abstract row for a concrete element', () => {
    expect(render(false)).not.toContain('<dt>Abstract</dt>')
  })
})
