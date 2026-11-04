import { describe, expect, it } from 'vitest'

import { createPendingWrites } from './pendingWrites'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function isSettled(promise: Promise<void>): Promise<boolean> {
  let done = false
  void promise.then(() => {
    done = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  return done
}

describe('createPendingWrites', () => {
  it('settles at once when nothing is in flight', async () => {
    await expect(createPendingWrites().settled()).resolves.toBeUndefined()
  })

  it('returns the tracked result', async () => {
    const writes = createPendingWrites()

    await expect(writes.track(Promise.resolve(7))).resolves.toBe(7)
  })

  it('waits for a tracked write', async () => {
    const writes = createPendingWrites()
    const write = deferred<void>()
    void writes.track(write.promise)

    const settled = writes.settled()

    expect(await isSettled(settled)).toBe(false)
    write.resolve()
    expect(await isSettled(settled)).toBe(true)
  })

  it('still settles when a write fails', async () => {
    const writes = createPendingWrites()
    const write = deferred<void>()
    writes.track(write.promise).catch(() => {})

    const settled = writes.settled()
    write.reject(new Error('nope'))

    await expect(settled).resolves.toBeUndefined()
  })

  it('also waits for writes started while waiting', async () => {
    const writes = createPendingWrites()
    const first = deferred<void>()
    const second = deferred<void>()
    void writes.track(first.promise)

    const settled = writes.settled()
    void writes.track(second.promise)
    first.resolve()

    expect(await isSettled(settled)).toBe(false)
    second.resolve()
    expect(await isSettled(settled)).toBe(true)
  })
})
