import { describe, expect, it } from 'vitest'
import type { SemanticElement } from '../../api'
import {
  DEFAULT_REQUIREMENT_DISPLAY,
  attributeValue,
  normalizeRequirementDisplay,
  resolveRequirementBody,
  resolveRequirementDocPanel,
  resolveRequirementHeader,
  type RequirementDisplaySettings,
} from './requirementDisplay'

function req(
  id: string,
  opts: {
    name?: string
    shortId?: string | null
    documentation?: string | null
    children?: string[]
  } = {},
): SemanticElement {
  return {
    id,
    kind: 'requirement',
    name: opts.name ?? 'Safety',
    parentId: 'P',
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: opts.children ?? [],
    fileId: 'f',
    shortId: opts.shortId ?? 'R-01',
    documentation: opts.documentation ?? null,
  }
}

function attr(
  id: string,
  name: string,
  defaultValue: string,
  parentId: string,
): SemanticElement {
  return {
    id,
    kind: 'attribute',
    name,
    parentId,
    typeRef: null,
    sourceId: null,
    targetId: null,
    children: [],
    fileId: 'f',
    defaultValue,
  }
}

describe('attributeValue', () => {
  it('reads and strips quotes from attribute default', () => {
    const el = req('P::R', { children: ['P::R::summary'] })
    const semantic = {
      'P::R': el,
      'P::R::summary': attr('P::R::summary', 'summary', '"Hello"', 'P::R'),
    }
    expect(attributeValue(el, semantic, 'summary')).toBe('Hello')
  })

  it('returns empty when attribute missing', () => {
    const el = req('P::R')
    expect(attributeValue(el, { 'P::R': el }, 'summary')).toBe('')
  })
})

describe('resolveRequirementBody', () => {
  it('default settings use doc, not description attribute', () => {
    const el = req('P::R', {
      documentation: 'Be safe',
      children: ['P::R::description'],
    })
    const semantic = {
      'P::R': el,
      'P::R::description': attr(
        'P::R::description',
        'description',
        '"From attr"',
        'P::R',
      ),
    }
    expect(resolveRequirementBody(el, semantic)).toBe('Be safe')
  })

  it('body attribute summary with no doc shows summary', () => {
    const el = req('P::R', {
      documentation: null,
      children: ['P::R::summary'],
    })
    const semantic = {
      'P::R': el,
      'P::R::summary': attr('P::R::summary', 'summary', '"Short"', 'P::R'),
    }
    const settings: RequirementDisplaySettings = {
      ...DEFAULT_REQUIREMENT_DISPLAY,
      body: { kind: 'attribute', name: 'summary' },
    }
    expect(resolveRequirementBody(el, semantic, settings)).toBe('Short')
  })

  it('body attribute missing yields empty string', () => {
    const el = req('P::R', { documentation: null })
    const settings: RequirementDisplaySettings = {
      ...DEFAULT_REQUIREMENT_DISPLAY,
      body: { kind: 'attribute', name: 'summary' },
    }
    expect(resolveRequirementBody(el, { 'P::R': el }, settings)).toBe('')
  })
})

describe('resolveRequirementHeader', () => {
  it('defaults to shortId and name', () => {
    const el = req('P::R', { shortId: 'R-01', name: 'Safety' })
    expect(resolveRequirementHeader(el, { 'P::R': el })).toBe('R-01 Safety')
  })

  it('header slots name + none shows only name', () => {
    const el = req('P::R', { shortId: 'R-01', name: 'Safety' })
    const settings: RequirementDisplaySettings = {
      ...DEFAULT_REQUIREMENT_DISPLAY,
      headerSlots: [{ kind: 'sysml', field: 'name' }, { kind: 'none' }],
    }
    expect(resolveRequirementHeader(el, { 'P::R': el }, settings)).toBe(
      'Safety',
    )
  })

  it('header attribute Code + shortId joins non-empty', () => {
    const el = req('P::R', {
      shortId: 'R-01',
      name: 'Safety',
      children: ['P::R::Code'],
    })
    const semantic = {
      'P::R': el,
      'P::R::Code': attr('P::R::Code', 'Code', '"C-9"', 'P::R'),
    }
    const settings: RequirementDisplaySettings = {
      ...DEFAULT_REQUIREMENT_DISPLAY,
      headerSlots: [
        { kind: 'attribute', name: 'Code' },
        { kind: 'sysml', field: 'shortId' },
      ],
    }
    expect(resolveRequirementHeader(el, semantic, settings)).toBe('C-9 R-01')
  })
})

describe('resolveRequirementDocPanel', () => {
  it('returns null when md file exists', () => {
    const el = req('P::R', { children: ['P::R::description'] })
    const semantic = {
      'P::R': el,
      'P::R::description': attr(
        'P::R::description',
        'description',
        '"Fallback"',
        'P::R',
      ),
    }
    expect(resolveRequirementDocPanel(el, semantic, undefined, true)).toBeNull()
  })

  it('defaults to description attribute when no md', () => {
    const el = req('P::R', { children: ['P::R::description'] })
    const semantic = {
      'P::R': el,
      'P::R::description': attr(
        'P::R::description',
        'description',
        '"Fallback"',
        'P::R',
      ),
    }
    expect(resolveRequirementDocPanel(el, semantic, undefined, false)).toBe(
      'Fallback',
    )
  })

  it('returns null when documentationPanelAttribute is null', () => {
    const el = req('P::R', { children: ['P::R::description'] })
    const semantic = {
      'P::R': el,
      'P::R::description': attr(
        'P::R::description',
        'description',
        '"Fallback"',
        'P::R',
      ),
    }
    const settings: RequirementDisplaySettings = {
      ...DEFAULT_REQUIREMENT_DISPLAY,
      documentationPanelAttribute: null,
    }
    expect(resolveRequirementDocPanel(el, semantic, settings, false)).toBeNull()
  })
})

describe('normalizeRequirementDisplay', () => {
  it('fills defaults for empty input', () => {
    expect(normalizeRequirementDisplay(undefined)).toEqual(
      DEFAULT_REQUIREMENT_DISPLAY,
    )
  })

  it('keeps null documentationPanelAttribute', () => {
    const n = normalizeRequirementDisplay({
      documentationPanelAttribute: null,
    })
    expect(n.documentationPanelAttribute).toBeNull()
  })
})
