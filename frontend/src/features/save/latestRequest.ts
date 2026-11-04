/** Tells a slow response whether a newer request has replaced it. */
export function createLatestRequest() {
  let latest = 0
  return {
    begin: () => {
      latest += 1
      const token = latest
      return () => token === latest
    },
  }
}
