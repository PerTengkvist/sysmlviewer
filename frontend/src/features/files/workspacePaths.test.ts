import { describe, expect, it } from 'vitest'
import { normalizeFolderPath, normalizeRelSysmlPath } from './workspacePaths'

describe('normalizeFolderPath', () => {
  it('rejects empty', () => {
    expect(normalizeFolderPath('')).toBeNull()
    expect(normalizeFolderPath('   ')).toBeNull()
  })

  it('trims and strips trailing slash', () => {
    expect(normalizeFolderPath(' /Users/me/proj/ ')).toBe('/Users/me/proj')
    expect(normalizeFolderPath('/Users/me/proj')).toBe('/Users/me/proj')
  })
})

describe('normalizeRelSysmlPath', () => {
  it('rejects empty and parent refs', () => {
    expect(normalizeRelSysmlPath('')).toBeNull()
    expect(normalizeRelSysmlPath('../x.sysml')).toBeNull()
    expect(normalizeRelSysmlPath('/abs.sysml')).toBeNull()
  })

  it('accepts relative paths', () => {
    expect(normalizeRelSysmlPath('vehicle.sysml')).toBe('vehicle.sysml')
    expect(normalizeRelSysmlPath('lib/main.sysml')).toBe('lib/main.sysml')
  })
})
