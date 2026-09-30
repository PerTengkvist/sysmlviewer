import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../../../api'
import { buildRequirementRows } from './buildRequirementRows'

function req(
  id: string,
  name: string,
  opts: Partial<SemanticElement> = {},
): SemanticElement {
  return {
    id,
    kind: 'requirement',
    name,
    parentId: opts.parentId ?? null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: opts.children || [],
    fileId: 'f',
    shortId: opts.shortId ?? null,
    documentation: opts.documentation ?? null,
  }
}

describe('buildRequirementRows', () => {
  const semantic: Record<string, SemanticElement> = {
    'P::R1': req('P::R1', 'Top', {
      shortId: 'R-01',
      children: ['P::R1::R2', 'P::R1::Type'],
      documentation: 'Top text',
    }),
    'P::R1::R2': req('P::R1::R2', 'Child', {
      parentId: 'P::R1',
      shortId: 'R-02',
    }),
    'P::R1::Type': {
      id: 'P::R1::Type',
      kind: 'attribute',
      name: 'Type',
      parentId: 'P::R1',
      typeRef: null,
      sourceId: null,
      targetId: null,
      children: [],
      fileId: 'f',
      defaultValue: '"UserStory"',
    },
    'P::sat1': {
      id: 'P::sat1',
      kind: 'satisfy',
      name: 'sat1',
      parentId: 'P',
      typeRef: null,
      sourceId: 'P::Box',
      targetId: 'P::R1',
      children: [],
      fileId: 'f',
    },
  }

  it('flat sorts by short id at depth 0', () => {
    const rows = buildRequirementRows(semantic, 'flat')
    expect(rows.map((r) => r.shortId)).toEqual(['R-01', 'R-02'])
    expect(rows.every((r) => r.depth === 0)).toBe(true)
    expect(rows[0].stereotype).toBe('user story')
    expect(rows[0].satisfiedBy).toEqual(['P::Box'])
  })

  it('hierarchical indents children', () => {
    const rows = buildRequirementRows(semantic, 'hierarchical')
    expect(rows[0].id).toBe('P::R1')
    expect(rows[0].depth).toBe(0)
    expect(rows[1].id).toBe('P::R1::R2')
    expect(rows[1].depth).toBe(1)
  })

  it('breaks cycles', () => {
    const cyclic: Record<string, SemanticElement> = {
      'P::A': req('P::A', 'A', { shortId: 'A' }),
      'P::B': req('P::B', 'B', { shortId: 'B' }),
      'P::d1': {
        id: 'P::d1',
        kind: 'dependency',
        name: 'd1',
        parentId: 'P',
        typeRef: null,
        sourceId: 'P::A',
        targetId: 'P::B',
        children: [],
        fileId: 'f',
        metadataKeywords: ['derive'],
      },
      'P::d2': {
        id: 'P::d2',
        kind: 'dependency',
        name: 'd2',
        parentId: 'P',
        typeRef: null,
        sourceId: 'P::B',
        targetId: 'P::A',
        children: [],
        fileId: 'f',
        metadataKeywords: ['derive'],
      },
    }
    const rows = buildRequirementRows(cyclic, 'hierarchical')
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows.length).toBeLessThanOrEqual(4)
  })
})
