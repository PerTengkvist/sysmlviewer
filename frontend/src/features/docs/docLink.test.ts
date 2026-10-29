import { describe, expect, it } from 'vitest'
import { isInternalDocHref, resolveDocLink } from './docLink'

describe('isInternalDocHref', () => {
  it('accepts relative markdown paths', () => {
    expect(isInternalDocHref('datacenter_racks.GpuRack.md')).toBe(true)
    expect(isInternalDocHref('../other/docs/x.md')).toBe(true)
    expect(isInternalDocHref('physical_architecture/docs/foo.md')).toBe(true)
  })

  it('rejects external, fragment, and empty hrefs', () => {
    expect(isInternalDocHref('https://example.com/a.md')).toBe(false)
    expect(isInternalDocHref('http://example.com/a.md')).toBe(false)
    expect(isInternalDocHref('mailto:a@b.com')).toBe(false)
    expect(isInternalDocHref('#section')).toBe(false)
    expect(isInternalDocHref('')).toBe(false)
    expect(isInternalDocHref(undefined)).toBe(false)
    expect(isInternalDocHref('readme.txt')).toBe(false)
  })
})

describe('resolveDocLink', () => {
  const current = 'physical_architecture/docs/datacenter_parts.GpuUnit.md'

  it('resolves a same-folder link against the current doc directory', () => {
    expect(resolveDocLink(current, 'datacenter_racks.GpuRack.md')).toBe(
      'physical_architecture/docs/datacenter_racks.GpuRack.md',
    )
  })

  it('resolves ../ relative to the current doc directory', () => {
    expect(resolveDocLink(current, '../../logical_architecture/docs/x.md')).toBe(
      'logical_architecture/docs/x.md',
    )
    expect(resolveDocLink(current, '../sibling.md')).toBe(
      'physical_architecture/sibling.md',
    )
  })

  it('keeps a project-relative path that already includes folders', () => {
    expect(resolveDocLink(current, 'other/docs/y.md')).toBe(
      'physical_architecture/docs/other/docs/y.md',
    )
  })

  it('returns null for external or non-md hrefs', () => {
    expect(resolveDocLink(current, 'https://example.com/a.md')).toBeNull()
    expect(resolveDocLink(current, '#anchor')).toBeNull()
    expect(resolveDocLink(current, 'notes.txt')).toBeNull()
  })

  it('normalizes . and collapses redundant segments', () => {
    expect(resolveDocLink(current, './datacenter_racks.GpuRack.md')).toBe(
      'physical_architecture/docs/datacenter_racks.GpuRack.md',
    )
    expect(resolveDocLink(current, 'sub/../datacenter_racks.GpuRack.md')).toBe(
      'physical_architecture/docs/datacenter_racks.GpuRack.md',
    )
  })

  it('returns null when .. escapes above the project root', () => {
    expect(resolveDocLink('docs/a.md', '../../outside.md')).toBeNull()
  })
})
