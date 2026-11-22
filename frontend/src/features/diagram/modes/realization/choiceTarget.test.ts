import { describe, expect, it } from 'vitest'
import type { ViewPayload } from '../../../../api'
import { choiceTarget } from './choiceTarget'

const payload = (id: string, extra: Partial<ViewPayload> = {}) =>
  ({ view: { id, name: id, rootArtifactId: 'r' }, ...extra }) as unknown as ViewPayload

describe('choiceTarget', () => {
  it('saves to the view the payload belongs to, whichever view is already "active" while it loads', () => {
    // The app has switched to view B, but the diagram on screen (and its choice) is still A.
    const shown = payload('A', { useCaseRealizationLayout: { lanes: 'logical' } })
    expect(choiceTarget(shown, 'useCaseRealizationLayout')).toEqual({
      viewId: 'A',
      initial: { lanes: 'logical' },
    })
  })

  it('has what the view showed as the initial choice, null when it had none', () => {
    expect(choiceTarget(payload('A'), 'realizationMatrix')).toEqual({ viewId: 'A', initial: null })
    expect(choiceTarget(payload('A', { realizationMatrix: { rows: 'steps' } }), 'realizationMatrix')?.initial).toEqual({
      rows: 'steps',
    })
  })

  it('has no target while no view is loaded', () => {
    expect(choiceTarget(null, 'realizationMatrix')).toBeNull()
  })
})
