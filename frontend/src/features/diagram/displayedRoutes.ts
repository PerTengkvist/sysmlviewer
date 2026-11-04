import { createContext } from 'react'

import type { Pt } from './edgeRouting'

/**
 * Routes as currently drawn, per connection. A connection re-attaches its
 * route locally while a part moves, so edge data alone can lag behind the
 * screen, and SAVE must store what the user sees.
 */
export type DisplayedRoutes = Map<string, Pt[]>

export const DisplayedRoutesContext = createContext<DisplayedRoutes | null>(null)
