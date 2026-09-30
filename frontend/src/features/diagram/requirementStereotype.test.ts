import { describe, expect, it } from 'vitest'
import {
  requirementStereotype,
  requirementTypeAttr,
} from './requirementStereotype'

describe('requirementStereotype', () => {
  it('defaults to requirement when Type is missing', () => {
    expect(requirementStereotype({})).toBe('requirement')
    expect(requirementStereotype({ typeAttr: undefined })).toBe('requirement')
    expect(requirementStereotype({ typeAttr: null })).toBe('requirement')
    expect(requirementStereotype({ typeAttr: '' })).toBe('requirement')
  })

  it('maps UserStory to user story', () => {
    expect(requirementStereotype({ typeAttr: 'UserStory' })).toBe('user story')
    expect(requirementStereotype({ typeAttr: '"UserStory"' })).toBe('user story')
    expect(requirementStereotype({ typeAttr: "'UserStory'" })).toBe('user story')
  })

  it('lowercases other Type values', () => {
    expect(requirementStereotype({ typeAttr: 'Functional' })).toBe('functional')
    expect(requirementStereotype({ typeAttr: '"Safety"' })).toBe('safety')
  })
})

describe('requirementTypeAttr', () => {
  it('reads Type attribute defaultValue from children', () => {
    const typeAttr = requirementTypeAttr(
      { children: ['P::R::Type', 'P::R::other'] },
      {
        'P::R::Type': {
          name: 'Type',
          kind: 'attribute',
          defaultValue: '"UserStory"',
        },
        'P::R::other': {
          name: 'other',
          kind: 'attribute',
          defaultValue: '"x"',
        },
      },
    )
    expect(typeAttr).toBe('"UserStory"')
    expect(requirementStereotype({ typeAttr })).toBe('user story')
  })

  it('returns undefined when Type attribute is absent', () => {
    expect(
      requirementTypeAttr({ children: ['P::R::other'] }, {
        'P::R::other': { name: 'other', kind: 'attribute', defaultValue: '1' },
      }),
    ).toBeUndefined()
  })
})
