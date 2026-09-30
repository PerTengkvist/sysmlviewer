import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { Project, SemanticElement, SysmlFile } from '../../api'
import { isRelationKind } from '../diagram/relationKinds'
import { buildFileTree, type FileTreeNode } from './buildFileTree'
import {
  applyFolderTreeOrder,
  buildFolderTree,
  defaultChildOrder,
  folderContentsGroupKey,
  folderSiblingGroupKey,
  loadViewTreeOrder,
  orderSiblingIds,
  packageGroupKey,
  reorderWithin,
  saveViewTreeOrder,
  UNGROUPED_GROUP_KEY,
  type ViewTreeOrder,
} from './viewTreeOrder'

export type LeftTab = 'views' | 'files'

type Props = {
  project: Project | null
  docPaths: string[]
  activeTab: LeftTab
  onTabChange: (tab: LeftTab) => void
  activeViewId: string | null
  selectedArtifactId: string | null
  onSelectView: (viewId: string) => void
  onSelectArtifact: (artifactId: string) => void
  onAddFilePath: () => void
  onRefreshFile: (fileId: string) => void
  onDeleteFile?: (fileId: string) => void
  onShowText: (fileId: string) => void
  onShowMarkdown: (docPath: string) => void
}

function ViewTree({
  projectId,
  semantic,
  selectedId,
  activeViewId,
  onSelectArtifact,
  onSelectView,
}: {
  projectId: string | null
  semantic: Record<string, SemanticElement>
  selectedId: string | null
  activeViewId: string | null
  onSelectArtifact: (artifactId: string) => void
  onSelectView: (viewId: string) => void
}) {
  const semanticKey = Object.keys(semantic).sort().join('|')

  const { byId, roots, folderTree } = useMemo(() => {
    const elements = Object.values(semantic)
    const map = Object.fromEntries(elements.map((e) => [e.id, e]))
    const rootList = elements
      .filter((e) => !isRelationKind(e.kind))
      .filter((e) => !e.parentId || !map[e.parentId] || isRelationKind(map[e.parentId].kind))
      .sort((a, b) => a.id.localeCompare(b.id))
    return { byId: map, roots: rootList, folderTree: buildFolderTree(rootList) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticKey])

  const [order, setOrder] = useState<ViewTreeOrder>(() => loadViewTreeOrder(projectId || ''))
  const dragRef = useRef<{ groupKey: string; id: string } | null>(null)
  const [dragging, setDragging] = useState<{ groupKey: string; id: string } | null>(null)
  const [drop, setDrop] = useState<{
    groupKey: string
    id: string
    position: 'before' | 'after'
  } | null>(null)

  useEffect(() => {
    setOrder(loadViewTreeOrder(projectId || ''))
    dragRef.current = null
    setDragging(null)
    setDrop(null)
  }, [projectId])

  const orderedFolders = useMemo(
    () => applyFolderTreeOrder(folderTree.folders, order.groups),
    [folderTree.folders, order.groups],
  )
  const ungroupedIds = useMemo(
    () => orderSiblingIds(folderTree.ungroupedIds, order.groups[UNGROUPED_GROUP_KEY]),
    [folderTree.ungroupedIds, order.groups],
  )

  const commitReorder = (
    groupKey: string,
    ids: string[],
    draggedId: string,
    targetId: string,
    position: 'before' | 'after',
  ) => {
    const nextIds = reorderWithin(ids, draggedId, targetId, position)
    if (!nextIds || !projectId) return
    setOrder((prev) => {
      const next = { groups: { ...prev.groups, [groupKey]: nextIds } }
      saveViewTreeOrder(projectId, next)
      return next
    })
  }

  const rowReorder = (groupKey: string, id: string, ids: string[]) => ({
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      const current = dragRef.current
      if (!current) return
      event.stopPropagation()
      if (current.groupKey !== groupKey || current.id === id) {
        setDrop((prev) => (prev ? null : prev))
        return
      }
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      setDrop((prev) =>
        prev && prev.groupKey === groupKey && prev.id === id && prev.position === position
          ? prev
          : { groupKey, id, position },
      )
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const raw = event.dataTransfer.getData('text/plain')
      const splitAt = raw.indexOf('\n')
      const fromTransfer =
        splitAt > 0
          ? { groupKey: raw.slice(0, splitAt), id: raw.slice(splitAt + 1) }
          : null
      const current = fromTransfer || dragRef.current
      dragRef.current = null
      setDragging(null)
      setDrop(null)
      if (!current || current.groupKey !== groupKey) return
      const rect = event.currentTarget.getBoundingClientRect()
      const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
      commitReorder(groupKey, ids, current.id, id, position)
    },
  })

  const grip = (groupKey: string, id: string, enabled: boolean) => {
    if (!enabled) return <span className="tree-grip spacer" aria-hidden />
    return (
      <button
        type="button"
        className="tree-grip"
        draggable
        title="Drag to reorder"
        aria-label="Drag to reorder"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.setData('text/plain', `${groupKey}\n${id}`)
          event.dataTransfer.effectAllowed = 'move'
          dragRef.current = { groupKey, id }
          setDragging({ groupKey, id })
        }}
        onDragEnd={() => {
          dragRef.current = null
          setDragging(null)
          setDrop(null)
        }}
      >
        ⋮⋮
      </button>
    )
  }

  const defaultFolderCollapsed = useMemo(() => new Set<string>(), [])

  const [folderCollapsed, setFolderCollapsed] = useState<Set<string>>(defaultFolderCollapsed)

  useEffect(() => {
    setFolderCollapsed(new Set(defaultFolderCollapsed))
  }, [defaultFolderCollapsed])

  const defaultCollapsed = useMemo(() => {
    const collapsed = new Set<string>()
    const walk = (id: string, depth: number) => {
      const el = byId[id]
      if (!el) return
      const kids = defaultChildOrder(el.children || [], byId)
      if (depth >= 1 && kids.length) collapsed.add(id)
      for (const cid of kids) walk(cid, depth + 1)
    }
    for (const r of roots) walk(r.id, 0)
    return collapsed
  }, [byId, roots])

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(defaultCollapsed)

  useEffect(() => {
    setCollapsedIds(new Set(defaultCollapsed))
  }, [defaultCollapsed])

  const toggleFolder = (folderKey: string) => {
    setFolderCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(folderKey)) next.delete(folderKey)
      else next.add(folderKey)
      return next
    })
  }

  const toggle = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const render = (
    el: SemanticElement,
    depth: number,
    groupKey: string | null,
    siblingIds: string[],
  ): ReactNode => {
    const defaultIds = defaultChildOrder(el.children || [], byId)
    const childGroup = el.kind === 'package' ? packageGroupKey(el.id) : null
    const childIds = childGroup
      ? orderSiblingIds(defaultIds, order.groups[childGroup])
      : defaultIds
    const hasChildren = childIds.length > 0
    const collapsed = collapsedIds.has(el.id)
    const active =
      selectedId === el.id ||
      activeViewId === el.id ||
      activeViewId === `artifact::${el.id}`
    const isView = el.kind === 'view'
    const canReorder = Boolean(groupKey) && siblingIds.length > 1
    const isDragging = dragging?.groupKey === groupKey && dragging.id === el.id
    const dropHere = drop?.groupKey === groupKey && drop.id === el.id
    return (
      <div key={el.id} className="tree-item" style={{ paddingLeft: depth * 12 }}>
        <div
          className={`tree-row${isView ? ' is-view' : ' is-other'}${active ? ' active' : ''}${
            isDragging ? ' is-dragging' : ''
          }${dropHere ? ` drop-${drop.position}` : ''}`}
          {...(groupKey ? rowReorder(groupKey, el.id, siblingIds) : {})}
        >
          {grip(groupKey || '', el.id, canReorder)}
          {hasChildren ? (
            <button
              type="button"
              className="tree-expand-btn"
              aria-label={collapsed ? 'Expand' : 'Collapse'}
              aria-expanded={!collapsed}
              onClick={(e) => {
                e.stopPropagation()
                toggle(el.id)
              }}
            >
              {collapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="tree-expand-btn spacer" aria-hidden />
          )}
          <button
            type="button"
            className="tree-label"
            onClick={() => {
              if (el.kind === 'view') onSelectView(el.id)
              else onSelectArtifact(el.id)
            }}
            title={el.id}
          >
            <span className="artifact-kind">{el.kind}</span> {el.name}
            {isView && el.typeRef ? (
              <span className="view-type-ref">«{el.typeRef}»</span>
            ) : null}
          </button>
        </div>
        {hasChildren && !collapsed
          ? childIds.map((cid) =>
              byId[cid] ? render(byId[cid], depth + 1, childGroup, childIds) : null,
            )
          : null}
      </div>
    )
  }

  if (!roots.length) {
    return <p className="muted">No definitions yet.</p>
  }

  const renderFolder = (
    folder: { name: string; path: string; folders: typeof orderedFolders; elementIds: string[] },
    depth: number,
    parentPath: string,
    siblingPaths: string[],
  ): ReactNode => {
    const folderKey = `folder::${folder.path}`
    const collapsed = folderCollapsed.has(folderKey)
    const groupKey = folderSiblingGroupKey(parentPath)
    const canReorder = siblingPaths.length > 1
    const isDragging = dragging?.groupKey === groupKey && dragging.id === folder.path
    const dropHere = drop?.groupKey === groupKey && drop.id === folder.path
    const contentsKey = folderContentsGroupKey(folder.path)
    return (
      <div key={folderKey} className="tree-item" style={{ paddingLeft: depth * 12 }}>
        <div
          className={`tree-row is-folder${isDragging ? ' is-dragging' : ''}${
            dropHere ? ` drop-${drop.position}` : ''
          }`}
          {...rowReorder(groupKey, folder.path, siblingPaths)}
        >
          {grip(groupKey, folder.path, canReorder)}
          <button
            type="button"
            className="tree-expand-btn"
            aria-expanded={!collapsed}
            onClick={() => toggleFolder(folderKey)}
          >
            {collapsed ? '▸' : '▾'}
          </button>
          <span className="tree-label folder-label">{folder.name}/</span>
        </div>
        {!collapsed ? (
          <>
            {folder.folders.map((child) =>
              renderFolder(
                child,
                depth + 1,
                folder.path,
                folder.folders.map((item) => item.path),
              ),
            )}
            {folder.elementIds.map((id) =>
              byId[id]
                ? render(byId[id], depth + 1, contentsKey, folder.elementIds)
                : null,
            )}
          </>
        ) : null}
      </div>
    )
  }

  const rootFolderPaths = orderedFolders.map((folder) => folder.path)

  return (
    <div className="view-tree">
      {orderedFolders.map((folder) => renderFolder(folder, 0, '', rootFolderPaths))}
      {ungroupedIds.map((id) =>
        byId[id] ? render(byId[id], 0, UNGROUPED_GROUP_KEY, ungroupedIds) : null,
      )}
    </div>
  )
}

function FileTree({
  nodes,
  depth,
  onShowText,
  onShowMarkdown,
  onRefreshFile,
  onContextMenu,
}: {
  nodes: FileTreeNode[]
  depth: number
  onShowText: (fileId: string) => void
  onShowMarkdown: (path: string) => void
  onRefreshFile: (fileId: string) => void
  onContextMenu: (file: SysmlFile, x: number, y: number) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <>
      {nodes.map((node) => {
        if (node.kind === 'folder') {
          const isCollapsed = collapsed.has(node.path)
          return (
            <div key={node.path} className="tree-item" style={{ paddingLeft: depth * 12 }}>
              <div className="tree-row is-folder">
                <button
                  type="button"
                  className="tree-expand-btn"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(node.path)}
                >
                  {isCollapsed ? '▸' : '▾'}
                </button>
                <span className="tree-label folder-label">{node.name}/</span>
              </div>
              {!isCollapsed ? (
                <FileTree
                  nodes={node.children}
                  depth={depth + 1}
                  onShowText={onShowText}
                  onShowMarkdown={onShowMarkdown}
                  onRefreshFile={onRefreshFile}
                  onContextMenu={onContextMenu}
                />
              ) : null}
            </div>
          )
        }
        if (node.kind === 'markdown') {
          return (
            <div key={node.path} className="tree-item" style={{ paddingLeft: depth * 12 }}>
              <div className="tree-row is-doc">
                <span className="tree-expand-btn spacer" aria-hidden />
                <button
                  type="button"
                  className="tree-label"
                  onClick={() => onShowMarkdown(node.path)}
                  title={node.path}
                >
                  <span className="artifact-kind">md</span> {node.name}
                </button>
              </div>
            </div>
          )
        }
        const file = node.file
        return (
          <div
            key={node.path}
            className="tree-item file-tree-item"
            style={{ paddingLeft: depth * 12 }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onContextMenu(file, e.clientX, e.clientY)
            }}
          >
            <div className="tree-row is-file">
              <span className="tree-expand-btn spacer" aria-hidden />
              <button
                type="button"
                className="tree-label"
                onClick={() => onShowText(file.id)}
                title={file.path || file.name}
              >
                <span className="artifact-kind">sysml</span> {node.name}
              </button>
              {file.warnings.length > 0 ? (
                <span className="file-warnings-inline" title={file.warnings.join('\n')}>
                  {file.warnings.length}
                </span>
              ) : null}
              <button
                type="button"
                className="file-refresh-inline"
                onClick={() => onRefreshFile(file.id)}
                title="Refresh from disk"
              >
                ↻
              </button>
            </div>
          </div>
        )
      })}
    </>
  )
}

export function LeftSidebar({
  project,
  docPaths,
  activeTab,
  onTabChange,
  activeViewId,
  selectedArtifactId,
  onSelectView,
  onSelectArtifact,
  onAddFilePath,
  onRefreshFile,
  onDeleteFile,
  onShowText,
  onShowMarkdown,
}: Props) {
  const [menu, setMenu] = useState<{
    fileId: string
    x: number
    y: number
  } | null>(null)

  const fileTree = useMemo(
    () => buildFileTree(project?.files || [], docPaths),
    [project?.files, docPaths],
  )

  return (
    <aside className="sidebar left-sidebar" onClick={() => setMenu(null)}>
      <div className="tab-bar">
        <button
          type="button"
          className={activeTab === 'views' ? 'active' : ''}
          onClick={() => onTabChange('views')}
        >
          Views
        </button>
        <button
          type="button"
          className={activeTab === 'files' ? 'active' : ''}
          onClick={() => onTabChange('files')}
        >
          Files
        </button>
      </div>

      {activeTab === 'views' && (
        <div className="sidebar-body">
          <ViewTree
            projectId={project?.id ?? null}
            semantic={project?.semantic || {}}
            selectedId={selectedArtifactId}
            activeViewId={activeViewId}
            onSelectArtifact={onSelectArtifact}
            onSelectView={onSelectView}
          />
        </div>
      )}

      {activeTab === 'files' && (
        <div className="sidebar-body files-panel">
          <button type="button" className="upload-zone" onClick={() => onAddFilePath()}>
            <span>Add SysML file by relative path…</span>
          </button>
          <div className="file-tree view-tree">
            {fileTree.length ? (
              <FileTree
                nodes={fileTree}
                depth={0}
                onShowText={onShowText}
                onShowMarkdown={onShowMarkdown}
                onRefreshFile={onRefreshFile}
                onContextMenu={(file, x, y) => setMenu({ fileId: file.id, x, y })}
              />
            ) : (
              <p className="muted">No files yet.</p>
            )}
          </div>
          <p className="muted hint">Right-click a SysML file for Refresh / View as text</p>
        </div>
      )}

      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              onRefreshFile(menu.fileId)
              setMenu(null)
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              onShowText(menu.fileId)
              setMenu(null)
            }}
          >
            View as text
          </button>
          {onDeleteFile && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (window.confirm('Remove this SysML file from the project?')) {
                  onDeleteFile(menu.fileId)
                }
                setMenu(null)
              }}
            >
              Delete file
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
