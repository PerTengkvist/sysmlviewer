import type { Project, RoutingType, SemanticElement } from '../../api'

type Props = {
  project: Project | null
  selectedId: string | null
  editorMode?: boolean
  onRoutingChange: (connectionId: string, routing: RoutingType) => void
  onAutoroute?: (connectionId: string) => void
  onRename?: (artifactId: string, name: string) => void
  onAddPart?: (parentId: string) => void
  onAddPort?: (parentId: string) => void
  onAddAttribute?: (parentId: string) => void
  onDelete?: (artifactId: string) => void
}

function findPartDefByName(
  project: Project,
  typeName: string,
): SemanticElement | undefined {
  return Object.values(project.semantic).find(
    (e) => e.kind === 'part' && e.name === typeName && !e.typeRef,
  )
}

function bucketsFor(project: Project, el: SemanticElement) {
  const ports: SemanticElement[] = []
  const attributes: SemanticElement[] = []
  const subParts: SemanticElement[] = []
  const relations: SemanticElement[] = []
  const portIds = new Set<string>()

  for (const cid of el.children || []) {
    const child = project.semantic[cid]
    if (!child) continue
    if (child.kind === 'port') {
      ports.push(child)
      portIds.add(child.id)
    } else if (child.kind === 'attribute') {
      attributes.push(child)
    } else if (child.kind === 'part') {
      subParts.push(child)
    } else if (child.kind === 'connection') {
      relations.push(child)
    }
  }

  // Part usages only inherit ports in older projects — also show attributes from the type def.
  if (el.kind === 'part' && el.typeRef && attributes.length === 0) {
    const typeDef = findPartDefByName(project, el.typeRef)
    if (typeDef) {
      for (const cid of typeDef.children || []) {
        const child = project.semantic[cid]
        if (child?.kind === 'attribute') attributes.push(child)
      }
    }
  }

  for (const other of Object.values(project.semantic)) {
    if (other.kind !== 'connection') continue
    if (relations.some((r) => r.id === other.id)) continue
    if (
      (other.sourceId && portIds.has(other.sourceId)) ||
      (other.targetId && portIds.has(other.targetId)) ||
      other.parentId === el.id
    ) {
      relations.push(other)
    }
  }

  return { ports, attributes, subParts, relations }
}

function FeatureList({
  title,
  items,
}: {
  title: string
  items: SemanticElement[]
}) {
  if (!items.length) return null
  return (
    <div className="feature-list">
      <h3>{title}</h3>
      {items.map((c) => (
        <div key={c.id} className="feature-card">
          <div className="feature-card-name">{c.name}</div>
          <dl className="detail-list">
            <dt>Type</dt>
            <dd>{c.typeRef || '—'}</dd>
            <dt>Default</dt>
            <dd>{c.defaultValue || '—'}</dd>
          </dl>
        </div>
      ))}
    </div>
  )
}

function SubPartsList({ items }: { items: SemanticElement[] }) {
  if (!items.length) return null
  return (
    <div className="feature-list">
      <h3>Sub-parts</h3>
      {items.map((c) => (
        <div key={c.id} className="feature-card">
          <div className="feature-card-name">{c.name}</div>
          <dl className="detail-list">
            <dt>Type</dt>
            <dd>{c.typeRef || '—'}</dd>
          </dl>
        </div>
      ))}
    </div>
  )
}

function RelationsList({ items }: { items: SemanticElement[] }) {
  if (!items.length) return null
  return (
    <div className="children">
      <h3>Relations</h3>
      <ul>
        {items.map((c) => (
          <li key={c.id} className="mono">
            {c.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function DetailsPanel({
  project,
  selectedId,
  editorMode,
  onRoutingChange,
  onAutoroute,
  onRename,
  onAddPart,
  onAddPort,
  onAddAttribute,
  onDelete,
}: Props) {
  if (!project || !selectedId) {
    return (
      <aside className="sidebar right-sidebar">
        <h2>Details</h2>
        <p className="muted">Select an artifact in the diagram.</p>
      </aside>
    )
  }

  const el: SemanticElement | undefined = project.semantic[selectedId]
  if (!el) {
    return (
      <aside className="sidebar right-sidebar">
        <h2>Details</h2>
        <p className="muted">Unknown artifact.</p>
      </aside>
    )
  }

  const edge = project.visualization.edges[selectedId]
  const node = project.visualization.nodes[selectedId]
  const buckets = bucketsFor(project, el)

  return (
    <aside className="sidebar right-sidebar">
      <h2>Details</h2>
      <dl className="detail-list">
        <dt>Name</dt>
        <dd>
          {el.kind === 'connection' && onRename ? (
            <input
              className="inline-edit"
              defaultValue={el.name}
              key={el.id + el.name}
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== el.name) onRename(el.id, v)
              }}
            />
          ) : (
            el.name
          )}
        </dd>
        <dt>Kind</dt>
        <dd>{el.kind}</dd>
        <dt>Id</dt>
        <dd className="mono">{el.id}</dd>
        {el.typeRef && (
          <>
            <dt>Type</dt>
            <dd>{el.typeRef}</dd>
          </>
        )}
        {(el.kind === 'attribute' || el.kind === 'port') && (
          <>
            <dt>Default</dt>
            <dd className="mono">{el.defaultValue || '—'}</dd>
          </>
        )}
        {el.sourceId && (
          <>
            <dt>Source</dt>
            <dd className="mono">{el.sourceId}</dd>
          </>
        )}
        {el.targetId && (
          <>
            <dt>Target</dt>
            <dd className="mono">{el.targetId}</dd>
          </>
        )}
        {node && (
          <>
            <dt>Position</dt>
            <dd>
              {Math.round(node.x)}, {Math.round(node.y)}
            </dd>
            <dt>Size</dt>
            <dd title="Select the part in the diagram and drag the corner handles to resize">
              {Math.round(node.width)} × {Math.round(node.height)}
            </dd>
            {node.side && (
              <>
                <dt>Port side</dt>
                <dd>
                  {node.side} @ {node.offset?.toFixed(2)}
                </dd>
              </>
            )}
          </>
        )}
      </dl>

      {el.kind === 'connection' && (
        <div className="routing-control">
          <label htmlFor="routing">Routing</label>
          <select
            id="routing"
            value={edge?.routing || 'angular'}
            onChange={(e) =>
              onRoutingChange(selectedId, e.target.value as RoutingType)
            }
          >
            <option value="angular">angular</option>
            <option value="direct">direct</option>
            <option value="spline">spline</option>
          </select>
          {(edge?.routing || 'angular') === 'angular' && (
            <button
              type="button"
              className="autoroute-btn"
              onClick={() => onAutoroute?.(selectedId)}
              title="Clear waypoints and redraw the orthogonal route"
            >
              Autoroute
            </button>
          )}
          {edge?.waypoints?.length ? (
            <p className="muted">
              {edge.waypoints.length} waypoint(s) — Option+drag segments / name
            </p>
          ) : (
            <p className="muted">Option+drag segments or connection name</p>
          )}
        </div>
      )}

      <FeatureList title="Ports" items={buckets.ports} />
      <FeatureList title="Attributes" items={buckets.attributes} />
      <SubPartsList items={buckets.subParts} />
      <RelationsList items={buckets.relations} />

      {editorMode && el.kind === 'part' && (
        <div className="editor-actions">
          <button type="button" onClick={() => onAddPart?.(el.id)}>
            + Part
          </button>
          <button type="button" onClick={() => onAddPort?.(el.id)}>
            + Port
          </button>
          <button type="button" onClick={() => onAddAttribute?.(el.id)}>
            + Attribute
          </button>
          <button type="button" className="danger" onClick={() => onDelete?.(el.id)}>
            Delete part
          </button>
        </div>
      )}
      {editorMode && el.kind === 'port' && (
        <div className="editor-actions">
          <button type="button" className="danger" onClick={() => onDelete?.(el.id)}>
            Delete port
          </button>
        </div>
      )}
    </aside>
  )
}
