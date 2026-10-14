import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import { iconNameForElement } from './iconRef'

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
})
