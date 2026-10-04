import { useState } from 'react'
import type {
  ElementStyle,
  ElementStyleMode,
  Project,
  RelationTodoItem,
  RoutingType,
  SemanticElement,
  ViewFilterRow,
  ViewPayload,
} from '../../api'
import { STYLE_DEFAULTS } from '../diagram/elementStyle'
import {
  defaultRelationStyle,
  STRUCTURE_EDGE_KINDS,
} from '../diagram/relationshipStyle'
import type { ViewMode } from '../../settings'
import { isRelationKind } from '../diagram/relationKinds'
import { isEditLocked } from '../diagram/editLock'
import { ViewFilterDialog } from '../diagram/ViewFilterDialog'

type Props = {
  project: Project | null
  /** Merged per-view visualization from the active diagram (nodes/edges overlays). */
  viewVisualization?: ViewPayload['visualization']
  /** Active view payload — used for per-diagram hierarchy override. */
  viewPayload?: ViewPayload | null
  globalHierarchicalLevels?: number
  selectedId: string | null
  relationTodos?: RelationTodoItem[]
  editorMode?: boolean
  viewMode?: ViewMode
  onHierarchyOverrideChange?: (override: number | null) => void
  onViewFiltersChange?: (filters: ViewFilterRow[]) => void
  onRoutingChange: (connectionId: string, routing: RoutingType) => void
  onAutoroute?: (connectionId: string) => void
  onWaypointsChange?: (
    connectionId: string,
    waypoints: { x: number; y: number; locked?: boolean }[],
  ) => void
  onStyleChange?: (artifactId: string, style: ElementStyle, kind: 'node' | 'edge') => void
  onFormatPaint?: () => void
  paintModeActive?: boolean
  onRename?: (artifactId: string, name: string) => void
  onMetadataKeywordsChange?: (
    artifactId: string,
    metadataKeywords: string[],
  ) => void
  onAddPart?: (parentId: string) => void
  onAddPort?: (parentId: string) => void
  onAddAttribute?: (parentId: string) => void
  onDelete?: (artifactId: string) => void
  onRetargetRelation?: (relationId: string, sourceId: string, targetId: string) => void
  onEditLockChange?: (artifactId: string, locked: boolean) => void
  onPositionChange?: (artifactId: string, x: number, y: number) => void
}

function choiceLabel(item: SemanticElement, choices: SemanticElement[]): string {
  const same = choices.filter((c) => c.kind === item.kind && c.name === item.name)
  if (same.length < 2) return `${item.kind} ${item.name}`
  const parent = choices.find((c) => c.id === item.parentId)
  const hint = parent?.name || item.parentId || item.id
  return `${item.kind} ${item.name} (${hint})`
}

function pendingEnds(
  relationId: string,
  sourceId: string,
  targetId: string,
  todos: RelationTodoItem[] | undefined,
): { sourceId: string; targetId: string } {
  const last = [...(todos || [])]
    .reverse()
    .find((todo) => todo.relationId === relationId)
  if (last && (last.action === 'change' || last.action === 'add')) {
    return { sourceId: last.source, targetId: last.target }
  }
  return { sourceId, targetId }
}

function diagramChoices(
  project: Project,
  viewPayload?: ViewPayload | null,
): SemanticElement[] {
  const source = viewPayload?.semantic || project.semantic
  return Object.values(source)
    .filter((el) => !isRelationKind(el.kind))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

function RelationEndpoints({
  unlocked,
  onToggleLock,
  sourceId,
  targetId,
  choices,
  onChange,
  onDelete,
}: {
  unlocked: boolean
  onToggleLock: () => void
  sourceId: string
  targetId: string
  choices: SemanticElement[]
  onChange: (sourceId: string, targetId: string) => void
  onDelete?: () => void
}) {
  const options = [...choices]
  for (const id of [sourceId, targetId]) {
    if (id && !options.some((item) => item.id === id)) {
      options.unshift({
        id,
        kind: 'part',
        name: id,
        parentId: null,
        typeRef: null,
        sourceId: null,
        targetId: null,
        children: [],
        fileId: null,
      })
    }
  }
  return (
    <>
      <dt>Edit</dt>
      <dd className="relation-edit">
        <button
          type="button"
          className={`relation-lock${unlocked ? ' is-open' : ''}`}
          aria-pressed={unlocked}
          aria-label={unlocked ? 'Lock relation details' : 'Unlock relation details'}
          title={unlocked ? 'Lock' : 'Unlock to edit'}
          onClick={onToggleLock}
        >
          {unlocked ? '🔓' : '🔒'}
        </button>
        <label>
          Source
          <select
            value={sourceId}
            disabled={!unlocked}
            onChange={(event) => onChange(event.target.value, targetId)}
          >
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {choiceLabel(item, options)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Target
          <select
            value={targetId}
            disabled={!unlocked}
            onChange={(event) => onChange(sourceId, event.target.value)}
          >
            {options.map((item) => (
              <option key={`t-${item.id}`} value={item.id}>
                {choiceLabel(item, options)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="danger"
          disabled={!unlocked || !onDelete}
          onClick={onDelete}
        >
          Delete
        </button>
      </dd>
    </>
  )
}

function parseUseEdge(id: string | null): { sourceId: string; targetId: string } | null {
  if (!id?.startsWith('use:') || !id.includes('->')) return null
  const body = id.slice('use:'.length)
  const arrow = body.indexOf('->')
  const sourceId = body.slice(0, arrow)
  const targetId = body.slice(arrow + 2)
  if (!sourceId || !targetId) return null
  return { sourceId, targetId }
}

function isRelationDetailKind(kind: string): boolean {
  return isRelationKind(kind) || kind === 'message' || kind === 'transition' || kind === 'succession'
}

function elementUnlocked(
  viz: ViewPayload['visualization'] | undefined,
  id: string | null,
): boolean {
  if (!viz || !id) return true
  return !isEditLocked(viz.nodes[id]) && !isEditLocked(viz.edges[id])
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
          <div className="feature-card-name">
            {c.name}
            {c.multiplicity ? ` [${c.multiplicity}]` : ''}
          </div>
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
          <div className="feature-card-name">
            {c.name}
            {c.multiplicity ? ` [${c.multiplicity}]` : ''}
          </div>
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

function FormatControls({
  style,
  isEdge,
  onChange,
  onPaint,
  paintActive,
}: {
  style: ElementStyle | null | undefined
  isEdge: boolean
  onChange: (next: ElementStyle) => void
  onPaint?: () => void
  paintActive?: boolean
}) {
  const modes: ViewMode[] = ['light', 'dark']

  const update = (mode: ViewMode, patch: Partial<ElementStyleMode>) => {
    const prev = style || {}
    const current = (mode === 'dark' ? prev.dark : prev.light) || {}
    const merged: ElementStyleMode = { ...current, ...patch }
    onChange({
      ...prev,
      [mode]: merged,
    })
  }

  return (
    <div className="format-controls">
      <div className="format-controls-header">
        <h3>Format</h3>
        {onPaint && (
          <button
            type="button"
            className={paintActive ? 'format-paint-btn active' : 'format-paint-btn'}
            onClick={onPaint}
            title="Copy format — click another element to paint"
            aria-pressed={!!paintActive}
          >
            Paint
          </button>
        )}
      </div>
      {modes.map((mode) => {
        const defaults = STYLE_DEFAULTS[mode]
        const current = (mode === 'dark' ? style?.dark : style?.light) || {}
        const thicknessDefault = isEdge ? defaults.edgeThickness : defaults.nodeThickness
        return (
          <div key={mode} className="format-mode">
            <h4>{mode === 'light' ? 'Light' : 'Dark'}</h4>
            <label>
              Background
              <input
                type="color"
                value={current.backgroundColor || defaults.backgroundColor}
                onChange={(e) => update(mode, { backgroundColor: e.target.value })}
              />
            </label>
            <label className="settings-row">
              <span>Header</span>
              <input
                type="checkbox"
                checked={current.backgroundHeader !== false}
                onChange={(e) =>
                  update(mode, { backgroundHeader: e.target.checked })
                }
              />
            </label>
            <label className="settings-row">
              <span>Body</span>
              <input
                type="checkbox"
                checked={current.backgroundBody !== false}
                onChange={(e) =>
                  update(mode, { backgroundBody: e.target.checked })
                }
              />
            </label>
            <label>
              Line
              <input
                type="color"
                value={current.lineColor || defaults.lineColor}
                onChange={(e) => update(mode, { lineColor: e.target.value })}
              />
            </label>
            <label>
              Text
              <input
                type="color"
                value={current.textColor || defaults.textColor}
                onChange={(e) => update(mode, { textColor: e.target.value })}
              />
            </label>
            <label>
              Line thickness
              <input
                type="number"
                min={0.5}
                max={12}
                step={0.5}
                value={current.lineThickness ?? thicknessDefault}
                onChange={(e) =>
                  update(mode, { lineThickness: Number(e.target.value) || thicknessDefault })
                }
              />
            </label>
          </div>
        )
      })}
    </div>
  )
}

function HierarchyLevelsSection({
  viewPayload,
  globalHierarchicalLevels,
  onHierarchyOverrideChange,
}: {
  viewPayload: ViewPayload
  globalHierarchicalLevels: number
  onHierarchyOverrideChange: (override: number | null) => void
}) {
  const mode = viewPayload.diagramMode
  if (mode !== 'whitebox' && mode !== 'structure' && mode !== 'tree') {
    return null
  }
  const override = viewPayload.hierarchicalLevelsOverride
  return (
    <div className="view-hierarchy-control">
      <h3>Diagram levels</h3>
      <p className="muted settings-note" style={{ marginTop: 0 }}>
        Diagram: <strong>{viewPayload.view.name}</strong>
      </p>
      <label className="settings-row">
        <span>Override global levels</span>
        <input
          type="checkbox"
          checked={override != null}
          onChange={(e) => {
            if (e.target.checked) {
              onHierarchyOverrideChange(
                Math.max(
                  1,
                  viewPayload.hierarchicalLevels ?? globalHierarchicalLevels,
                ),
              )
            } else {
              onHierarchyOverrideChange(null)
            }
          }}
        />
      </label>
      <label className="settings-row">
        <span>Hierarchical levels</span>
        <input
          type="number"
          min={1}
          max={8}
          disabled={override == null}
          value={override != null ? override : globalHierarchicalLevels}
          onChange={(e) => {
            const n = Math.max(1, Number(e.target.value) || 1)
            onHierarchyOverrideChange(n)
          }}
        />
      </label>
      <p className="muted settings-note">
        {override != null
          ? `This diagram uses ${override} levels.`
          : `Using global setting (${globalHierarchicalLevels}).`}
      </p>
    </div>
  )
}

export function DetailsPanel({
  project,
  viewVisualization,
  viewPayload,
  globalHierarchicalLevels = 2,
  selectedId,
  relationTodos = [],
  editorMode,
  viewMode: _viewMode,
  onHierarchyOverrideChange,
  onViewFiltersChange,
  onRoutingChange,
  onAutoroute,
  onWaypointsChange,
  onStyleChange,
  onFormatPaint,
  paintModeActive,
  onRename,
  onMetadataKeywordsChange,
  onAddPart,
  onAddPort,
  onAddAttribute,
  onDelete,
  onRetargetRelation,
  onEditLockChange,
  onPositionChange,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false)
  const unlocked = elementUnlocked(viewVisualization, selectedId)
  const toggleEditLock = () => {
    if (!selectedId || !onEditLockChange) return
    onEditLockChange(selectedId, unlocked)
  }

  const hierarchyBlock =
    viewPayload && onHierarchyOverrideChange ? (
      <HierarchyLevelsSection
        viewPayload={viewPayload}
        globalHierarchicalLevels={globalHierarchicalLevels}
        onHierarchyOverrideChange={onHierarchyOverrideChange}
      />
    ) : null

  if (!project || !selectedId) {
    return (
      <div className="details-panel">
        <h2>Details</h2>
        {hierarchyBlock}
        {!hierarchyBlock && (
          <p className="muted">Select an artifact in the diagram.</p>
        )}
      </div>
    )
  }

  const el: SemanticElement | undefined = project.semantic[selectedId]

  // Arcadia composition/aggregation edges are viz-only (viz::…).
  if (!el && selectedId.startsWith('viz::')) {
    const edge =
      viewVisualization?.edges[selectedId] ??
      project.visualization.edges[selectedId]
    const isAgg = selectedId.startsWith('viz::aggregation::')
    const kindLabel = isAgg ? 'aggregation' : 'composition'
    const rest = selectedId.replace(/^viz::(aggregation|composition)::/, '')
    const sep = rest.lastIndexOf('::')
    const sourceId = sep >= 0 ? rest.slice(0, sep) : rest
    const targetId = sep >= 0 ? rest.slice(sep + 2) : ''
    return (
      <div className="details-panel">
        <h2>Details</h2>
        {hierarchyBlock}
        <dl className="detail-list">
          <dt>Kind</dt>
          <dd>{kindLabel} (Arcadia)</dd>
          <dt>Id</dt>
          <dd className="mono">{selectedId}</dd>
          {sourceId && (
            <>
              <dt>Whole</dt>
              <dd className="mono">{sourceId}</dd>
            </>
          )}
          {targetId && (
            <>
              <dt>Part</dt>
              <dd className="mono">{targetId}</dd>
            </>
          )}
          <dt>Edit</dt>
          <dd>
            <button
              type="button"
              className={`relation-lock${unlocked ? ' is-open' : ''}`}
              aria-pressed={unlocked}
              aria-label={
                unlocked ? 'Lock relation details' : 'Unlock relation details'
              }
              onClick={toggleEditLock}
            >
              {unlocked ? '🔓' : '🔒'}
            </button>
          </dd>
        </dl>
        <div className="routing-control">
          <label htmlFor="routing">Routing</label>
          <select
            id="routing"
            value={edge?.routing || 'direct'}
            disabled={!unlocked}
            onChange={(e) =>
              onRoutingChange(selectedId, e.target.value as RoutingType)
            }
          >
            <option value="angular">angular</option>
            <option value="direct">direct</option>
            <option value="spline">spline</option>
          </select>
          {(edge?.routing || 'direct') === 'angular' && (
            <button
              type="button"
              className="autoroute-btn"
              onClick={() => onAutoroute?.(selectedId)}
              disabled={!unlocked}
              title="Clear waypoints and redraw the orthogonal route"
            >
              Autoroute
            </button>
          )}
          <p className="muted">Option+drag ends along part boundary</p>
        </div>
      </div>
    )
  }

  if (!el) {
    const useEdge = parseUseEdge(selectedId)
    if (useEdge) {
      const ends = pendingEnds(
        selectedId,
        useEdge.sourceId,
        useEdge.targetId,
        relationTodos,
      )
      return (
        <div className="details-panel">
          <h2>Details</h2>
          {hierarchyBlock}
          <dl className="detail-list">
            <dt>Kind</dt>
            <dd>use</dd>
            <dt>Id</dt>
            <dd className="mono">{selectedId}</dd>
            <dt>Source</dt>
            <dd className="mono">{ends.sourceId}</dd>
            <dt>Target</dt>
            <dd className="mono">{ends.targetId}</dd>
            <RelationEndpoints
              unlocked={unlocked}
              onToggleLock={toggleEditLock}
              sourceId={ends.sourceId}
              targetId={ends.targetId}
              choices={diagramChoices(project, viewPayload)}
              onChange={(sourceId, targetId) =>
                onRetargetRelation?.(selectedId, sourceId, targetId)
              }
              onDelete={onDelete ? () => onDelete(selectedId) : undefined}
            />
          </dl>
        </div>
      )
    }
    return (
      <div className="details-panel">
        <h2>Details</h2>
        {hierarchyBlock}
        <p className="muted">Unknown artifact.</p>
      </div>
    )
  }

  const edge =
    viewVisualization?.edges[selectedId] ?? project.visualization.edges[selectedId]
  const node =
    viewVisualization?.nodes[selectedId] ?? project.visualization.nodes[selectedId]
  const buckets = bucketsFor(project, el)
  const isEdgeKind =
    el.kind === 'connection' ||
    el.kind === 'message' ||
    el.kind === 'transition' ||
    el.kind === 'succession'
  const relationEnds = isRelationDetailKind(el.kind)
    ? pendingEnds(selectedId, el.sourceId || '', el.targetId || '', relationTodos)
    : null
  const formatKind: 'node' | 'edge' = isEdgeKind ? 'edge' : 'node'
  const formatStyle = isEdgeKind ? edge?.style : node?.style
  const canFormat =
    el.kind === 'part' ||
    el.kind === 'package' ||
    el.kind === 'port' ||
    el.kind === 'connection' ||
    el.kind === 'lifeline' ||
    el.kind === 'state' ||
    el.kind === 'action' ||
    el.kind === 'message' ||
    el.kind === 'transition' ||
    el.kind === 'succession'

  return (
    <div className="details-panel">
      <h2>Details</h2>
      {hierarchyBlock}
      <dl className="detail-list">
        <dt>Name</dt>
        <dd>
          {el.kind === 'connection' && onRename ? (
            <input
              className="inline-edit"
              defaultValue={el.name}
              key={el.id + el.name}
              disabled={!unlocked}
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
        {!relationEnds && (
          <>
            <dt>Edit</dt>
            <dd>
              <button
                type="button"
                className={`relation-lock${unlocked ? ' is-open' : ''}`}
                aria-pressed={unlocked}
                aria-label={unlocked ? 'Lock details' : 'Unlock to edit'}
                title={unlocked ? 'Lock' : 'Unlock to edit'}
                onClick={toggleEditLock}
              >
                {unlocked ? '🔓' : '🔒'}
              </button>
            </dd>
          </>
        )}
        {el.kind === 'dependency' && (
          <>
            <dt>Stereotype</dt>
            <dd>
              {onMetadataKeywordsChange ? (
                <input
                  className="inline-edit"
                  defaultValue={(el.metadataKeywords || []).join(', ')}
                  key={el.id + (el.metadataKeywords || []).join(',')}
                  disabled={!unlocked}
                  aria-label="Stereotype"
                  placeholder="e.g. Energy"
                  onBlur={(e) => {
                    const next = e.target.value
                      .split(/[,;]+/)
                      .map((s) =>
                        s
                          .trim()
                          .replace(/^[«<]+/, '')
                          .replace(/[»>]+$/, '')
                          .trim(),
                      )
                      .filter(Boolean)
                    const prev = el.metadataKeywords || []
                    if (
                      next.length !== prev.length ||
                      next.some((kw, i) => kw !== prev[i])
                    ) {
                      onMetadataKeywordsChange(el.id, next)
                    }
                  }}
                />
              ) : (
                (el.metadataKeywords || []).join(', ') || '—'
              )}
            </dd>
          </>
        )}
        {el.typeRef && (
          <>
            <dt>Type</dt>
            <dd>{el.typeRef}</dd>
          </>
        )}
        {el.exposeRef && (
          <>
            <dt>Expose</dt>
            <dd className="mono">{el.exposeRef}</dd>
          </>
        )}
        {el.kind === 'view' && onViewFiltersChange && viewPayload && (
          <>
            <dt>View filter</dt>
            <dd>
              <button
                type="button"
                onClick={() => setFilterOpen(true)}
                aria-label="view-filter"
              >
                view-filter
              </button>
              <ViewFilterDialog
                open={filterOpen}
                filters={viewPayload.viewFilters || []}
                semantic={viewPayload.semantic}
                onChange={onViewFiltersChange}
                onClose={() => setFilterOpen(false)}
              />
            </dd>
          </>
        )}
        {(el.kind === 'attribute' || el.kind === 'port') && (
          <>
            <dt>Default</dt>
            <dd className="mono">{el.defaultValue || '—'}</dd>
          </>
        )}
        {(relationEnds?.sourceId || el.sourceId) && (
          <>
            <dt>Source</dt>
            <dd className="mono">{relationEnds?.sourceId || el.sourceId}</dd>
          </>
        )}
        {(relationEnds?.targetId || el.targetId) && (
          <>
            <dt>Target</dt>
            <dd className="mono">{relationEnds?.targetId || el.targetId}</dd>
          </>
        )}
        {relationEnds && (
          <RelationEndpoints
            unlocked={unlocked}
            onToggleLock={toggleEditLock}
            sourceId={relationEnds.sourceId}
            targetId={relationEnds.targetId}
            choices={diagramChoices(project, viewPayload)}
            onChange={(sourceId, targetId) =>
              onRetargetRelation?.(selectedId, sourceId, targetId)
            }
            onDelete={onDelete ? () => onDelete(selectedId) : undefined}
          />
        )}
        {node && (
          <>
            <dt>Position</dt>
            <dd>
              {el.kind === 'part' && onPositionChange ? (
                <span className="position-inputs">
                  <input
                    type="number"
                    className="inline-edit"
                    defaultValue={Math.round(node.x)}
                    key={`${el.id}-x-${node.x}`}
                    disabled={!unlocked}
                    aria-label="X position"
                    onBlur={(e) => {
                      const x = Number(e.target.value)
                      const y = node.y
                      if (!Number.isFinite(x) || !Number.isFinite(y)) return
                      if (Math.round(x) !== Math.round(node.x)) {
                        onPositionChange(el.id, x, y)
                      }
                    }}
                  />
                  <input
                    type="number"
                    className="inline-edit"
                    defaultValue={Math.round(node.y)}
                    key={`${el.id}-y-${node.y}`}
                    disabled={!unlocked}
                    aria-label="Y position"
                    onBlur={(e) => {
                      const y = Number(e.target.value)
                      const x = node.x
                      if (!Number.isFinite(x) || !Number.isFinite(y)) return
                      if (Math.round(y) !== Math.round(node.y)) {
                        onPositionChange(el.id, x, y)
                      }
                    }}
                  />
                </span>
              ) : (
                <>
                  {Math.round(node.x)}, {Math.round(node.y)}
                </>
              )}
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

      {STRUCTURE_EDGE_KINDS.includes(el.kind) && (
        <div className="routing-control">
          <label htmlFor="routing">Routing</label>
          <select
            id="routing"
            value={
              edge?.routing || defaultRelationStyle(el.kind).routing
            }
            disabled={!unlocked}
            onChange={(e) =>
              onRoutingChange(selectedId, e.target.value as RoutingType)
            }
          >
            <option value="angular">angular</option>
            <option value="direct">direct</option>
            <option value="spline">spline</option>
          </select>
          {(edge?.routing || defaultRelationStyle(el.kind).routing) ===
            'angular' && (
            <button
              type="button"
              className="autoroute-btn"
              onClick={() => onAutoroute?.(selectedId)}
              disabled={!unlocked}
              title="Clear waypoints and redraw the orthogonal route"
            >
              Autoroute
            </button>
          )}
          {edge?.waypoints?.length ? (
            <div className="waypoint-locks">
              <p className="muted">Connection points</p>
              <ul className="waypoint-lock-list">
                {edge.waypoints.map((wp, idx) => (
                  <li key={`${idx}-${wp.x}-${wp.y}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!wp.locked}
                        disabled={!onWaypointsChange || !unlocked}
                        onChange={(e) => {
                          if (!onWaypointsChange || !selectedId) return
                          const next = edge.waypoints.map((w, i) =>
                            i === idx
                              ? { ...w, locked: e.target.checked }
                              : { ...w },
                          )
                          onWaypointsChange(selectedId, next)
                        }}
                      />
                      <span>
                        #{idx + 1} ({Math.round(wp.x)}, {Math.round(wp.y)})
                        {wp.locked ? ' locked' : ''}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="muted">
                Locked points stay put on Redraw: Connections
              </p>
            </div>
          ) : (
            <p className="muted">Option+drag segments or connection name</p>
          )}
        </div>
      )}

      {canFormat && onStyleChange && (
        <fieldset
          disabled={!unlocked}
          className="plain-fieldset"
        >
          <FormatControls
            style={formatStyle}
            isEdge={isEdgeKind}
            onChange={(next) => onStyleChange(selectedId, next, formatKind)}
            onPaint={onFormatPaint}
            paintActive={paintModeActive}
          />
        </fieldset>
      )}

      <FeatureList title="Ports" items={buckets.ports} />
      <FeatureList title="Attributes" items={buckets.attributes} />
      <SubPartsList items={buckets.subParts} />
      <RelationsList items={buckets.relations} />

      {editorMode && el.kind === 'part' && (
        <div className="editor-actions">
          <button type="button" disabled={!unlocked} onClick={() => onAddPart?.(el.id)}>
            + Part
          </button>
          <button type="button" disabled={!unlocked} onClick={() => onAddPort?.(el.id)}>
            + Port
          </button>
          <button type="button" disabled={!unlocked} onClick={() => onAddAttribute?.(el.id)}>
            + Attribute
          </button>
          <button
            type="button"
            className="danger"
            disabled={!unlocked}
            onClick={() => onDelete?.(el.id)}
          >
            Delete part
          </button>
        </div>
      )}
      {editorMode && el.kind === 'port' && (
        <div className="editor-actions">
          <button
            type="button"
            className="danger"
            disabled={!unlocked}
            onClick={() => onDelete?.(el.id)}
          >
            Delete port
          </button>
        </div>
      )}
    </div>
  )
}
