import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  parsePartIconRef,
  readPartIconBodyName,
  readPartIconName,
  resolveLucideIcon,
  resolvePartIcon,
  stripIconQuotes,
  toPascalCaseIcon,
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

describe('stripIconQuotes / toPascalCaseIcon', () => {
  it('strips quotes and maps kebab to PascalCase', () => {
    expect(stripIconQuotes('"cpu"')).toBe('cpu')
    expect(toPascalCaseIcon('circuit-board')).toBe('CircuitBoard')
    expect(toPascalCaseIcon('cloud')).toBe('Cloud')
  })
})

describe('parsePartIconRef', () => {
  it('treats bare names as Lucide', () => {
    expect(parsePartIconRef('cloud')).toEqual({ kind: 'lucide', name: 'cloud' })
    expect(parsePartIconRef('"battery"')).toEqual({
      kind: 'lucide',
      name: 'battery',
    })
  })

  it('parses iconmind/ and carbon/ as SVG libraries', () => {
    expect(parsePartIconRef('iconmind/agent')).toEqual({
      kind: 'svg',
      library: 'iconmind',
      name: 'agent',
      path: 'iconmind/agent',
    })
    expect(parsePartIconRef('carbon/user')).toEqual({
      kind: 'svg',
      library: 'carbon',
      name: 'user',
      path: 'carbon/user',
    })
  })

  it('treats lucide/ prefix as explicit Lucide', () => {
    expect(parsePartIconRef('lucide/cloud')).toEqual({
      kind: 'lucide',
      name: 'cloud',
    })
  })
})

describe('resolveLucideIcon / resolvePartIcon', () => {
  it('resolves any Lucide icon including cloud', () => {
    expect(resolveLucideIcon('cloud')).not.toBeNull()
    expect(resolveLucideIcon('battery')).not.toBeNull()
    expect(resolveLucideIcon('circuit-board')).not.toBeNull()
    expect(resolvePartIcon('cloud')).not.toBeNull()
    expect(resolvePartIcon('not-a-real-icon')).toBeNull()
    expect(resolvePartIcon('iconmind/agent')).toBeNull()
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

  it('preserves iconmind/ paths', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::a': el('P::a', { kind: 'part', name: 'a', children: ['P::a::_icon'] }),
      'P::a::_icon': el('P::a::_icon', {
        kind: 'attribute',
        name: '_icon',
        defaultValue: '"iconmind/agent"',
        parentId: 'P::a',
      }),
    }
    expect(readPartIconName(semantic, 'P::a')).toBe('iconmind/agent')
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

describe('readPartIconBodyName', () => {
  it('reads _icon_body including iconmind paths', () => {
    const semantic: Record<string, SemanticElement> = {
      'P::box': el('P::box', {
        kind: 'part',
        name: 'box',
        children: ['P::box::_icon_body'],
      }),
      'P::box::_icon_body': el('P::box::_icon_body', {
        kind: 'attribute',
        name: '_icon_body',
        defaultValue: '"cloud"',
        parentId: 'P::box',
      }),
    }
    expect(readPartIconBodyName(semantic, 'P::box')).toBe('cloud')

    const mind: Record<string, SemanticElement> = {
      'P::a': el('P::a', { kind: 'part', name: 'a', children: ['P::a::_icon_body'] }),
      'P::a::_icon_body': el('P::a::_icon_body', {
        kind: 'attribute',
        name: '_icon_body',
        defaultValue: '"iconmind/agent"',
        parentId: 'P::a',
      }),
    }
    expect(readPartIconBodyName(semantic, 'P::missing')).toBeNull()
    expect(readPartIconBodyName(mind, 'P::a')).toBe('iconmind/agent')
  })
})
