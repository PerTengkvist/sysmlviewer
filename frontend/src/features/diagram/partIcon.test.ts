import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  isAllowedPartIcon,
  readPartIconName,
  resolvePartIcon,
  stripIconQuotes,
} from './partIcon'

function el(
  id: string,
  extra: Partial<SemanticElement> & Pick<SemanticElement, 'kind' | 'name'>,
): SemanticElement {
  return {
    id,
    parentId: null,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f1',
    ...extra,
  }
}

describe('stripIconQuotes', () => {
  it('strips double and single quotes', () => {
    expect(stripIconQuotes('"cpu"')).toBe('cpu')
    expect(stripIconQuotes("'cpu'")).toBe('cpu')
    expect(stripIconQuotes('cpu')).toBe('cpu')
  })
})

describe('isAllowedPartIcon / resolvePartIcon', () => {
  it('allows known Lucide keys and rejects garbage', () => {
    expect(isAllowedPartIcon('battery')).toBe(true)
    expect(isAllowedPartIcon('circuit-board')).toBe(true)
    expect(isAllowedPartIcon('not-a-real-icon')).toBe(false)
  })

  it('resolvePartIcon returns a component for allowlisted names', () => {
    expect(resolvePartIcon('battery')).not.toBeNull()
    expect(resolvePartIcon('"cpu"')).not.toBeNull()
    expect(resolvePartIcon('not-a-real-icon')).toBeNull()
    expect(resolvePartIcon(null)).toBeNull()
  })
})

describe('readPartIconName', () => {
  it('returns battery for attribute _icon = "battery"', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::ecu': el('P::ecu', {
        kind: 'part',
        name: 'ecu',
        children: ['P::ecu::_icon'],
      }),
      'P::ecu::_icon': el('P::ecu::_icon', {
        kind: 'attribute',
        name: '_icon',
        defaultValue: '"battery"',
        parentId: 'P::ecu',
      }),
    }
    expect(readPartIconName(semantic, 'P::ecu')).toBe('battery')
  })

  it('strips quotes from unquoted and quoted values', () => {
    const quoted: Record<string, SemanticElement> = {
      'P::a': el('P::a', { kind: 'part', name: 'a', children: ['P::a::_icon'] }),
      'P::a::_icon': el('P::a::_icon', {
        kind: 'attribute',
        name: '_icon',
        defaultValue: '"cpu"',
        parentId: 'P::a',
      }),
    }
    const bare: Record<string, SemanticElement> = {
      'P::b': el('P::b', { kind: 'part', name: 'b', children: ['P::b::_icon'] }),
      'P::b::_icon': el('P::b::_icon', {
        kind: 'attribute',
        name: '_icon',
        defaultValue: 'cpu',
        parentId: 'P::b',
      }),
    }
    expect(readPartIconName(quoted, 'P::a')).toBe('cpu')
    expect(readPartIconName(bare, 'P::b')).toBe('cpu')
  })

  it('returns null when missing or empty', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::ecu': el('P::ecu', { kind: 'part', name: 'ecu' }),
      'P::empty': el('P::empty', {
        kind: 'part',
        name: 'empty',
        children: ['P::empty::_icon'],
      }),
      'P::empty::_icon': el('P::empty::_icon', {
        kind: 'attribute',
        name: '_icon',
        defaultValue: '""',
        parentId: 'P::empty',
      }),
    }
    expect(readPartIconName(semantic, 'P::ecu')).toBeNull()
    expect(readPartIconName(semantic, 'P::empty')).toBeNull()
    expect(readPartIconName(semantic, 'missing')).toBeNull()
  })

  it('inherits _icon from type definition when usage has none', () => {
    const semantic: Record<string, SemanticElement> = {
      BatteryEcu: el('BatteryEcu', {
        kind: 'part',
        name: 'BatteryEcu',
        children: ['BatteryEcu::_icon'],
      }),
      'BatteryEcu::_icon': el('BatteryEcu::_icon', {
        kind: 'attribute',
        name: '_icon',
        defaultValue: '"battery"',
        parentId: 'BatteryEcu',
      }),
      'P::ecu': el('P::ecu', {
        kind: 'part',
        name: 'ecu',
        typeRef: 'BatteryEcu',
      }),
    }
    expect(readPartIconName(semantic, 'P::ecu')).toBe('battery')
  })
})
