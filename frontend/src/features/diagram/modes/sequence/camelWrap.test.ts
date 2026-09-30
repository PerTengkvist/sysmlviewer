import { describe, expect, it } from 'vitest'
import { camelCaseSegments, lifelineHeaderHeight } from './camelWrap'

describe('camelCaseSegments', () => {
  it('keeps a single word intact', () => {
    expect(camelCaseSegments('Driver')).toEqual(['Driver'])
  })

  it('breaks before an internal capital', () => {
    expect(camelCaseSegments('ManeuvrabilityController')).toEqual([
      'Maneuvrability',
      'Controller',
    ])
    expect(camelCaseSegments('brakePedal')).toEqual(['brake', 'Pedal'])
  })

  it('keeps an acronym together and breaks before the next word', () => {
    expect(camelCaseSegments('XMLParser')).toEqual(['XML', 'Parser'])
  })
})

describe('lifelineHeaderHeight', () => {
  it('stays at the single-line minimum for a short name', () => {
    expect(lifelineHeaderHeight('Driver', 120)).toBe(48)
  })

  it('grows when a camelCase name needs a second line', () => {
    expect(lifelineHeaderHeight('ManeuvrabilityController', 120)).toBeGreaterThan(48)
  })
})
