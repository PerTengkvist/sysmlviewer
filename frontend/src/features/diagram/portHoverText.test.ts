import { describe, expect, it } from 'vitest'
import { formatSubportsAnnotation, portHoverText } from './portHoverText'

describe('portHoverText', () => {
  it('formats a leaf port as name:type', () => {
    expect(portHoverText('sP1', 'sP1')).toBe('sP1:sP1')
  })

  it('formats a composite with nested subports', () => {
    expect(
      portHoverText('sPort', 'sPort', [
        { name: 'sP1', typeRef: 'sP1' },
        { name: 'sP2', typeRef: 'sP2' },
      ]),
    ).toBe(`sPort:sPort {
  sP1:sP1;
  sP2:sP2;
}`)
  })

  it('uses — when typeRef is missing', () => {
    expect(portHoverText('p', null)).toBe('p:—')
    expect(portHoverText('p', undefined, [{ name: 'n', typeRef: null }])).toBe(
      `p:— {
  n:—;
}`,
    )
  })
})

describe('formatSubportsAnnotation', () => {
  it('formats nested names', () => {
    expect(formatSubportsAnnotation(['sP1', 'sP2'])).toBe('subports:{sP1, sP2}')
  })

  it('returns null for an empty list', () => {
    expect(formatSubportsAnnotation([])).toBeNull()
  })
})
