import { describe, expect, it } from 'vitest'
import { buildFileTree } from './buildFileTree'
import type { SysmlFile } from '../../api'

function sysml(path: string): SysmlFile {
  return {
    id: path,
    name: path.split('/').pop() || path,
    path,
    content: '',
    warnings: [],
  }
}

describe('buildFileTree', () => {
  it('groups nested sysml files and docs folders', () => {
    const tree = buildFileTree(
      [sysml('logical/a.sysml'), sysml('physical/b.sysml')],
      ['logical/docs/A.md', 'physical/docs/B.md'],
    )
    expect(tree.map((n) => n.name)).toEqual(['logical', 'physical'])
    const logical = tree.find((n) => n.name === 'logical')
    expect(logical?.kind).toBe('folder')
    if (logical?.kind !== 'folder') return
    expect(logical.children.map((n) => n.name)).toContain('docs')
    expect(logical.children.map((n) => n.name)).toContain('a.sysml')
  })
})
