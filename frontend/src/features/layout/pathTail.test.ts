import { describe, expect, it } from 'vitest'
import { pathTail } from './pathTail'

describe('pathTail', () => {
  it('returns short paths unchanged', () => {
    expect(pathTail('/a/b', 40)).toBe('/a/b')
  })

  it('drops whole leading segments and prefixes an ellipsis', () => {
    const out = pathTail('/Users/per/Coding/In2ition/sysmlviewer', 24)
    expect(out).toBe('…/In2ition/sysmlviewer')
    expect(out.length).toBeLessThanOrEqual(24)
  })

  it('truncates the last segment from the left when it alone is too long', () => {
    expect(pathTail('/x/averyveryverylongprojectname', 10)).toBe('…ojectname')
  })

  it('uses the separator that occurs last in the string', () => {
    expect(pathTail('C:\\proj\\deep\\dir', 12)).toBe('…\\deep\\dir')
  })

  it('ignores a trailing separator', () => {
    expect(pathTail('/a/b/c/', 5)).toBe('…/b/c')
    expect(pathTail('/a/b/c/', 6)).toBe('/a/b/c')
  })
})
