import { describe, expect, it } from 'vitest'
import { labelMap, tailNames, type LabelNode } from './labels'

/** The same cases as backend/tests/test_failure_labels.py. */
const node = (id: string, name: string, shortId?: string): LabelNode => ({ id, name, shortId })

describe('labels (port of failure/labels.py)', () => {
  it('keeps the tag and adds the suffix for a tagged collision', () => {
    const labels = labelMap(
      [
        node('Uc::A::Brake', 'Brake', 'UC1'),
        node('Uc::B::Brake', 'Brake', 'UC1'),
        node('Uc::A::Park', 'Park', 'UC2'),
      ],
      'label',
    )
    expect(labels.get('Uc::A::Brake')).toBe('UC1 A::Brake')
    expect(labels.get('Uc::B::Brake')).toBe('UC1 B::Brake')
    expect(labels.get('Uc::A::Park')).toBe('UC2 Park')
  })

  it('uses the plain label of an untagged element, and the tag otherwise', () => {
    const labels = labelMap([node('Uc::Start', 'Start', 'UCA'), node('Uc::Lock', 'Lock')], 'label')
    expect([...labels.values()]).toEqual(['UCA Start', 'Lock'])
  })

  it('grows the suffix until it is unique', () => {
    const labels = labelMap(
      [node('X::a::F', 'F'), node('Y::a::F', 'F'), node('Y::b::F', 'F')],
      'name',
    )
    expect(labels.get('X::a::F')).toBe('X::a::F')
    expect(labels.get('Y::a::F')).toBe('Y::a::F')
    expect(labels.get('Y::b::F')).toBe('b::F')
  })

  it('keeps unique names plain', () => {
    const labels = labelMap([node('A::F', 'F'), node('B::G', 'G')], 'name')
    expect([...labels.values()]).toEqual(['F', 'G'])
  })

  it('makes mixed-depth names unique and minimal', () => {
    const labels = labelMap(
      [node('F', 'F'), node('A::F', 'F'), node('B::A::F', 'F')],
      'name',
    )
    expect([...labels.values()]).toEqual(['F', 'A::F', 'B::A::F'])
  })

  it('qualifies a name shared across layers', () => {
    const labels = labelMap([node('Funcs::Brake', 'Brake'), node('Log::Brake', 'Brake')], 'name')
    expect(labels.get('Funcs::Brake')).toBe('Funcs::Brake')
    expect(labels.get('Log::Brake')).toBe('Log::Brake')
  })

  it('keeps tail labels unique across the whole list', () => {
    const labels = labelMap(
      [node('Phys1::V::x', 'x'), node('Phys2::V::x', 'x'), node('Root::Phys1::V::x', 'x')],
      'tail',
    )
    expect(new Set(labels.values()).size).toBe(3)
    expect(labels.get('Phys2::V::x')).toBe('Phys2::V::x')
  })

  it('gives tail names for coverage lists', () => {
    expect(
      Object.fromEntries(tailNames(['Phys1::V::pack', 'Phys2::V::pack', 'Phys1::V::solo'])),
    ).toEqual({
      'Phys1::V::pack': 'Phys1::V::pack',
      'Phys2::V::pack': 'Phys2::V::pack',
      'Phys1::V::solo': 'V::solo',
    })
  })
})
