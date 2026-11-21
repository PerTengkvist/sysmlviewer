import { describe, expect, it } from 'vitest'
import { createChoiceSaver } from './choiceSaver'

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createChoiceSaver', () => {
  it('sends only the latest choice made while a save is in flight, and in order', async () => {
    const sent: string[] = []
    const gates: ReturnType<typeof deferred>[] = []
    const saver = createChoiceSaver<string>(
      (_key, choice) => {
        sent.push(choice)
        const g = deferred()
        gates.push(g)
        return g.promise
      },
      () => {},
    )
    const done = saver.save('v', 'a', 'start')
    void saver.save('v', 'b', 'start')
    void saver.save('v', 'c', 'start')
    expect(sent).toEqual(['a']) // never two requests at once
    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(sent).toEqual(['a', 'c']) // b was overtaken
    gates[1].resolve()
    await done
    expect(sent).toEqual(['a', 'c'])
  })

  it('keeps the views apart', async () => {
    const sent: string[] = []
    const saver = createChoiceSaver<string>(async (key, choice) => void sent.push(`${key}:${choice}`), () => {})
    await Promise.all([saver.save('v1', 'a', ''), saver.save('v2', 'b', '')])
    expect(sent).toEqual(['v1:a', 'v2:b'])
  })

  it('rolls back to the last saved choice when a save fails, and drops what waited', async () => {
    const failures: [string, string | undefined, string][] = []
    let n = 0
    const gates: ReturnType<typeof deferred>[] = []
    const saver = createChoiceSaver<string>(
      () => {
        n++
        const g = deferred()
        gates.push(g)
        return g.promise
      },
      (key, confirmed, error) => failures.push([key, confirmed, String(error)]),
    )
    const first = saver.save('v', 'a', 'start')
    void saver.save('v', 'b', 'start')
    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(n).toBe(2)
    gates[1].reject(new Error('boom'))
    await first
    expect(failures).toEqual([['v', 'a', 'Error: boom']]) // 'a' was confirmed, 'b' failed
  })

  it('starts the next save after a failure from the choice then confirmed', async () => {
    const sent: string[] = []
    let fail = true
    const saver = createChoiceSaver<string>(
      async (_k, choice) => {
        sent.push(choice)
        if (fail) throw new Error('x')
      },
      () => {},
    )
    await saver.save('v', 'a', 'start')
    fail = false
    await saver.save('v', 'b', 'start')
    expect(sent).toEqual(['a', 'b'])
  })

  it('rolls back to what the server holds after the view was loaded again', async () => {
    const failures: (string | undefined)[] = []
    let fail = false
    const saver = createChoiceSaver<string>(
      async () => {
        if (fail) throw new Error('x')
      },
      (_k, confirmed) => failures.push(confirmed),
    )
    await saver.save('v', 'a', 'start') // saved: 'a'
    // The view is loaded again; the server holds 'z' by now (another window saved it).
    fail = true
    await saver.save('v', 'b', 'z')
    expect(failures).toEqual(['z'])
  })

  describe('for the lanes of a realization view', () => {
    type Lanes = { lanes?: string; order?: Record<string, string[]> } | null

    it('lets the last of several quick lane choices win, also a reset to null', async () => {
      const sent: Lanes[] = []
      const gate = deferred()
      const saver = createChoiceSaver<Lanes>(
        (_key, choice) => {
          sent.push(choice)
          return sent.length === 1 ? gate.promise : Promise.resolve()
        },
        () => {},
      )
      void saver.save('v', { lanes: 'logical' }, null)
      void saver.save('v', { lanes: 'blackbox' }, null)
      void saver.save('v', { lanes: 'blackbox', order: { blackbox: ['b', 'a'] } }, null)
      const last = saver.save('v', null, null)
      gate.resolve()
      await last
      expect(sent).toEqual([{ lanes: 'logical' }, null])
    })

    it('rolls back to the last saved layout, or to what the view showed (null) when none was', async () => {
      const failures: Lanes[] = []
      const saver = createChoiceSaver<Lanes>(
        () => Promise.reject(new Error('no')),
        (_key, confirmed) => failures.push(confirmed),
      )
      await saver.save('v', { lanes: 'logical' }, null)
      expect(failures).toEqual([null])
    })
  })
})
