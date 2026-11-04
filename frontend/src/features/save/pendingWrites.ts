/** Layout writes still in flight, so SAVE can wait for them. */
export type PendingWrites = {
  track: <T>(write: Promise<T>) => Promise<T>
  settled: () => Promise<void>
}

export function createPendingWrites(): PendingWrites {
  const inFlight = new Set<Promise<unknown>>()
  return {
    track: (write) => {
      inFlight.add(write)
      const done = () => inFlight.delete(write)
      write.then(done, done)
      return write
    },
    settled: async () => {
      while (inFlight.size) await Promise.allSettled([...inFlight])
    },
  }
}
