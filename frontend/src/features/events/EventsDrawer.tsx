import type { EventDetail } from '../../api'
import type { EventRow } from './eventsState'

type Props = {
  rows: EventRow[]
  onClose: () => void
  onCompare: () => void
  canCompare?: boolean
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000)
  return String(value)
}

function formatTime(ts: string): string {
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? ts : date.toLocaleTimeString()
}

function DetailsTable({ details }: { details: EventDetail[] }) {
  return (
    <table className="events-details">
      <thead>
        <tr>
          <th scope="col">Element</th>
          <th scope="col">Name</th>
          <th scope="col">Field</th>
          <th scope="col">Diagram</th>
          <th scope="col">Saved</th>
          <th scope="col">Checked against</th>
        </tr>
      </thead>
      <tbody>
        {details.map((detail, index) => (
          <tr key={`${detail.id}-${detail.field}-${detail.source}-${index}`}>
            <td>{detail.element}</td>
            <td title={detail.id}>{detail.name}</td>
            <td>{detail.field}</td>
            <td>{formatValue(detail.canvas)}</td>
            <td>{formatValue(detail.saved)}</td>
            <td>{detail.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function EventsDrawer({ rows, onClose, onCompare, canCompare = true }: Props) {
  return (
    <section className="events-drawer no-print" aria-label="Event log">
      <header className="events-drawer-header">
        <h2>Events</h2>
        <div className="events-drawer-actions">
          <button
            type="button"
            disabled={!canCompare}
            onClick={onCompare}
            title="Compare the diagram with its saved view file"
          >
            Compare now
          </button>
          <button type="button" aria-label="Close events" onClick={onClose}>
            ×
          </button>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="events-empty">No events yet</p>
      ) : (
        <ol className="events-list">
          {rows.map((row) => (
            <li key={row.key} className={`events-row events-row-${row.level}`}>
              <div className="events-row-line">
                <time dateTime={row.ts}>{formatTime(row.ts)}</time>
                <span className="events-level">{row.level}</span>
                <span className="events-message">{row.message}</span>
                {row.localOnly && (
                  <span className="events-local">Not in backend log</span>
                )}
              </div>
              {row.details.length > 0 && <DetailsTable details={row.details} />}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
