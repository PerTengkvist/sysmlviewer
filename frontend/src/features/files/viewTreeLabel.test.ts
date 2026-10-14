import { describe, expect, it } from 'vitest'
import { viewTreeNameParts } from './viewTreeLabel'

describe('viewTreeNameParts', () => {
  it('breaks ManeuvrabilityController at the capital', () => {
    expect(viewTreeNameParts('ManeuvrabilityController')).toEqual([
      'Maneuvrability',
      'Controller',
    ])
  })

  it('breaks brakePedal at the capital', () => {
    expect(viewTreeNameParts('brakePedal')).toEqual(['brake', 'Pedal'])
  })

  it('keeps a single word intact', () => {
    expect(viewTreeNameParts('Driver')).toEqual(['Driver'])
  })

  it('keeps names with spaces whole', () => {
    expect(viewTreeNameParts('Vehicle Use Case')).toEqual(['Vehicle Use Case'])
  })
})
