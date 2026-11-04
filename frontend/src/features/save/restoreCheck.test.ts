import { describe, expect, it } from 'vitest'

import { createRestoreCheck } from './restoreCheck'

describe('createRestoreCheck', () => {
  it('runs once per opened diagram', () => {
    const check = createRestoreCheck()

    expect(check.claim(1, false)).toBe(true)
    expect(check.claim(1, false)).toBe(false)
  })

  it('runs again when a diagram is opened again', () => {
    const check = createRestoreCheck()
    check.claim(1, false)

    expect(check.claim(2, false)).toBe(true)
  })

  it('skips a diagram that is being routed automatically', () => {
    const check = createRestoreCheck()

    expect(check.claim(1, true)).toBe(false)
  })
})
