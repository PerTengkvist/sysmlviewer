/**
 * Saves a per-view choice (the matrix rows / columns) without racing. One request per key
 * at a time: a choice made while one is in flight replaces any earlier waiting one, so the
 * last choice always wins on the server, in the order it was made. When a save fails,
 * `onFail` gets the last choice the server confirmed (`initial` before any), so the caller
 * can roll the display back and show the error.
 */
export function createChoiceSaver<T>(
  send: (key: string, choice: T) => Promise<unknown>,
  onFail: (key: string, confirmed: T, error: unknown) => void,
) {
  type State = { busy: Promise<void> | null; waiting: { choice: T } | null; confirmed: T }
  const states = new Map<string, State>()

  async function drain(key: string, state: State, first: T): Promise<void> {
    let next: { choice: T } | null = { choice: first }
    while (next) {
      state.waiting = null
      try {
        await send(key, next.choice)
        state.confirmed = next.choice
      } catch (error) {
        state.waiting = null
        onFail(key, state.confirmed, error)
        break
      }
      next = state.waiting
    }
    state.busy = null
  }

  return {
    /** `initial` is what the view shows, which is what the server holds while nothing is in flight. */
    save(key: string, choice: T, initial: T): Promise<void> {
      let state = states.get(key)
      if (!state) {
        state = { busy: null, waiting: null, confirmed: initial }
        states.set(key, state)
      }
      if (state.busy) {
        state.waiting = { choice }
        return state.busy
      }
      // Idle: what the view shows is what the server holds, also after a reload.
      state.confirmed = initial
      state.busy = drain(key, state, choice)
      return state.busy
    },
  }
}
