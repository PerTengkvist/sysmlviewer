import { describe, expect, it } from 'vitest'

import { createLatestRequest } from './latestRequest'

describe('createLatestRequest', () => {
  it('treats the only request as current', () => {
    const isCurrent = createLatestRequest().begin()

    expect(isCurrent()).toBe(true)
  })

  it('marks an earlier request as outdated', () => {
    const latest = createLatestRequest()
    const first = latest.begin()
    const second = latest.begin()

    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })
})
