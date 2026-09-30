import type { RelationTodoItem } from '../../api'

type Props = {
  open: boolean
  items: RelationTodoItem[]
  onClose: () => void
  onDelete: (id: number) => void
}

export function RelationTodosDialog({
  open,
  items,
  onClose,
  onDelete,
}: Props) {
  if (!open) return null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-wide"
        role="dialog"
        aria-label="Relation TODOs"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Relation TODOs ({items.length})</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <p className="muted settings-note">
            Pending relation edits are stored in{" "}
            <code>.update_relations_todos.json</code>. Remove entries after you
            apply them to SysML sources.
          </p>
          <table className="requirement-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>Action</th>
                <th>Type</th>
                <th>Source</th>
                <th>Target</th>
                <th>File</th>
                <th>Row</th>
                <th>New def</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.id}</td>
                  <td>{it.action}</td>
                  <td>{it.type}</td>
                  <td className="mono">{it.source}</td>
                  <td className="mono">{it.target}</td>
                  <td className="mono">{it.filepath}</td>
                  <td>{it.rownumber}</td>
                  <td className="mono">{it.new_def}</td>
                  <td>
                    <button type="button" onClick={() => onDelete(it.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
