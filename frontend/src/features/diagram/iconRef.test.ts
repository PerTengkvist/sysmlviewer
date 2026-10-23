import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  iconNameForElement,
  iconUrl,
  iconmindCdnUrl,
  TOOLBAR_ICONS,
} from './iconRef'

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

  it('appends style query for variants', () => {
    expect(iconUrl('iconmind/lock', { style: 'outline-thin' })).toBe(
      '/api/icons/iconmind/lock.svg?style=outline-thin',
    )
    expect(iconUrl('iconmind/flip-h', { style: 'duotone-regular' })).toBe(
      '/api/icons/iconmind/flip-h.svg?style=duotone-regular',
    )
  })
})

describe('iconmindCdnUrl / TOOLBAR_ICONS', () => {
  it('builds CDN paths with category and variant', () => {
    expect(iconmindCdnUrl(TOOLBAR_ICONS.lockAll)).toContain(
      '/icons/security/lock/outline-thin.svg',
    )
    expect(iconmindCdnUrl(TOOLBAR_ICONS.layoutRules)).toContain(
      '/icons/interface/layout-dashboard/outline-thin.svg',
    )
    expect(iconmindCdnUrl(TOOLBAR_ICONS.flipH)).toContain(
      '/icons/interface/flip-h/duotone-regular.svg',
    )
  })
})
