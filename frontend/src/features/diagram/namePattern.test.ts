import { describe, expect, it } from 'vitest'
import { matchName } from './namePattern'

describe('matchName', () => {
  it('matches every name when pattern is *', () => {
    expect(matchName('*', 'Engine')).toBe(true)
    expect(matchName('*', '')).toBe(true)
    expect(matchName('*', 'anything')).toBe(true)
  })

  it('exact name does not match a longer string', () => {
    expect(matchName('Engine', 'Engine')).toBe(true)
    expect(matchName('Engine', 'EngineBlock')).toBe(false)
  })

  it('prefix glob Eng* matches Engine and EngineBlock, not MyEngine', () => {
    expect(matchName('Eng*', 'Engine')).toBe(true)
    expect(matchName('Eng*', 'EngineBlock')).toBe(true)
    expect(matchName('Eng*', 'MyEngine')).toBe(false)
  })

  it('contains glob *Motor* matches RearMotor and Motor', () => {
    expect(matchName('*Motor*', 'RearMotor')).toBe(true)
    expect(matchName('*Motor*', 'Motor')).toBe(true)
    expect(matchName('*Motor*', 'Mot')).toBe(false)
  })

  it('suffix glob *Block matches EngineBlock', () => {
    expect(matchName('*Block', 'EngineBlock')).toBe(true)
    expect(matchName('*Block', 'Block')).toBe(true)
    expect(matchName('*Block', 'Engine')).toBe(false)
  })

  it('treats regex metacharacters as literal', () => {
    expect(matchName('a.b', 'a.b')).toBe(true)
    expect(matchName('a.b', 'axb')).toBe(false)
    expect(matchName('a+', 'a+')).toBe(true)
    expect(matchName('a+', 'aa')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(matchName('Engine', 'engine')).toBe(false)
    expect(matchName('Eng*', 'engine')).toBe(false)
  })
})
