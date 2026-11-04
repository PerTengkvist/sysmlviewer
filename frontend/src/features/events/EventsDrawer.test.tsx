import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { EventRow } from './eventsState'
import { EventsDrawer } from './EventsDrawer'

function row(overrides: Partial<EventRow> = {}): EventRow {
  return {
    key: 'seq-1',
    ts: '2026-11-04T10:15:30+00:00',
    level: 'info',
    code: 'save.successful',
    message: 'Save successful: View.json',
    details: [],
    localOnly: false,
    ...overrides,
  }
}

function render(rows: EventRow[], extra: Partial<Parameters<typeof EventsDrawer>[0]> = {}) {
  return renderToStaticMarkup(
    <EventsDrawer rows={rows} onClose={vi.fn()} onCompare={vi.fn()} {...extra} />,
  )
}

describe('EventsDrawer', () => {
  it('is labelled for assistive technology', () => {
    expect(render([])).toContain('aria-label="Event log"')
  })

  it('shows an empty state', () => {
    expect(render([])).toContain('No events yet')
  })

  it('shows level and message exactly as logged', () => {
    const html = render([row({ level: 'error', message: 'Positions differ' })])

    expect(html).toContain('events-row-error')
    expect(html).toContain('error')
    expect(html).toContain('Positions differ')
  })

  it('lists each element that does not match', () => {
    const html = render([
      row({
        details: [
          {
            element: 'port',
            id: 'Pkg::a::p',
            name: 'p',
            field: 'side',
            canvas: 'left',
            saved: 'right',
            source: 'disk',
          },
        ],
      }),
    ])

    expect(html).toContain('port')
    expect(html).toContain('p')
    expect(html).toContain('side')
    expect(html).toContain('left')
    expect(html).toContain('right')
    expect(html).toContain('disk')
  })

  it('shows a missing saved value as a dash', () => {
    const html = render([
      row({
        details: [
          {
            element: 'part',
            id: 'Pkg::a',
            name: 'a',
            field: 'entry',
            canvas: 'present',
            saved: null,
            source: 'served',
          },
        ],
      }),
    ])

    expect(html).toContain('<td>—</td>')
  })

  it('marks events that never reached the backend log', () => {
    expect(render([row({ localOnly: true })])).toContain('Not in backend log')
  })

  it('disables Compare now when no diagram is open', () => {
    expect(render([], { canCompare: false })).toMatch(/<button[^>]*disabled[^>]*>Compare now/)
  })
})
