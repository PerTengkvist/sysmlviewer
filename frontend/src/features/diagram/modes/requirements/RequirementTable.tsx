import type { RequirementRow } from './buildRequirementRows'

type Props = {
  rows: readonly RequirementRow[]
  selectedIds: readonly string[]
  onSelect: (artifactId: string, opts: { shift: boolean }) => void
  /** Double-click on a row (not wired in print mode). */
  onRowDoubleClick?: (artifactId: string) => void
}

/** The `requirementTable` diagram mode: a flat or hierarchical table of requirements. */
export function RequirementTable({ rows, selectedIds, onSelect, onRowDoubleClick }: Props) {
  return (
    <div className="requirement-table-wrap">
      <table className="requirement-table">
        <thead>
          <tr>
            <th>Id</th>
            <th>Name</th>
            <th>Type</th>
            <th>Text</th>
            <th>Derived from</th>
            <th>Satisfied by</th>
            <th>File</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.id}:${row.depth}:${row.repeated}`}
              data-artifact-id={row.id}
              className={selectedIds.includes(row.id) ? 'selected' : undefined}
              onClick={(e) => onSelect(row.id, { shift: e.shiftKey })}
              onDoubleClick={
                onRowDoubleClick ? () => onRowDoubleClick(row.id) : undefined
              }
            >
              <td className="mono">{row.shortId}</td>
              <td style={{ paddingLeft: 8 + row.depth * 16 }}>
                {row.repeated ? '↺ ' : ''}
                {row.name}
              </td>
              <td>«{row.stereotype}»</td>
              <td>{row.text}</td>
              <td className="mono">{row.derivedFrom.join(', ')}</td>
              <td className="mono">{row.satisfiedBy.join(', ')}</td>
              <td className="mono">{row.fileId}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
