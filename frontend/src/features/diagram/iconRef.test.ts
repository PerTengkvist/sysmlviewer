import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import { iconNameForElement, iconUrl } from './iconRef'

function el(
  partial: Partial<SemanticElement> & Pick<SemanticElement, 'id' | 'kind' | 'name'>,
): SemanticElement {
  return {
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    ...partial,
  }
}

describe('iconNameForElement', () => {
  it('reads _icon = user', () => {
    const actor = el({ id: 'P::Driver', kind: 'actor', name: 'Driver' })
    const attr = el({
      id: 'P::Driver::_icon',
      kind: 'attribute',
      name: '_icon',
      parentId: 'P::Driver',
      defaultValue: 'user',
    })
    expect(
      iconNameForElement(actor, {
        [actor.id]: actor,
        [attr.id]: attr,
      }),
    ).toBe('user')
  })

  it('returns null when attribute is missing', () => {
    const actor = el({ id: 'P::Driver', kind: 'actor', name: 'Driver' })
    expect(iconNameForElement(actor, { [actor.id]: actor })).toBeNull()
  })

  it('returns null for an unknown icon name', () => {
    const actor = el({ id: 'P::Driver', kind: 'actor', name: 'Driver' })
    const attr = el({
      id: 'P::Driver::_icon',
      kind: 'attribute',
      name: '_icon',
      parentId: 'P::Driver',
      defaultValue: 'not-a-real-icon',
    })
    expect(
      iconNameForElement(actor, {
        [actor.id]: actor,
        [attr.id]: attr,
      }),
    ).toBeNull()
  })

  it('accepts iconmind/ paths without carbon allowlist', () => {
    const actor = el({ id: 'P::Driver', kind: 'actor', name: 'Driver' })
    const attr = el({
      id: 'P::Driver::_icon',
      kind: 'attribute',
      name: '_icon',
      parentId: 'P::Driver',
      defaultValue: '"iconmind/agent"',
    })
    expect(
      iconNameForElement(actor, {
        [actor.id]: actor,
        [attr.id]: attr,
      }),
    ).toBe('iconmind/agent')
  })
})

describe('iconUrl', () => {
  it('builds default and library-prefixed URLs', () => {
    expect(iconUrl('user')).toBe('/api/icons/user.svg')
    expect(iconUrl('iconmind/agent')).toBe('/api/icons/iconmind/agent.svg')
  })
})
