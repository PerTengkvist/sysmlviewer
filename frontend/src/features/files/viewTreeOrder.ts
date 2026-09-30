import { isRelationKind } from '../diagram/relationKinds'

/** Sibling lists in the Views tree. Keys never mix folders or packages. */
export type ViewTreeOrder = {
  groups: Record<string, string[]>
}

export type FolderNode = {
  name: string
  path: string
  folders: FolderNode[]
  elementIds: string[]
}

const STORAGE_PREFIX = 'sysmlviewer.viewTreeOrder.'

export function emptyViewTreeOrder(): ViewTreeOrder {
  return { groups: {} }
}

/** Directory of a SysML file id, or null when the file sits at the project root. */
export function directoryPath(fileId: string | null | undefined): string | null {
  if (!fileId || !fileId.includes('/')) return null
  const dir = fileId.slice(0, fileId.lastIndexOf('/'))
  return dir || null
}

/** Child folders of a directory. Root uses an empty parent path. */
export function folderSiblingGroupKey(parentPath: string): string {
  return `folders:${parentPath}`
}

/** Elements whose file lives directly in this directory. */
export function folderContentsGroupKey(folderPath: string): string {
  return `folder:${folderPath}`
}

/** Direct children of one package. */
export function packageGroupKey(packageId: string): string {
  return `package:${packageId}`
}

export const UNGROUPED_GROUP_KEY = 'ungrouped'

export function defaultChildOrder(
  childIds: string[],
  byId: Record<string, { kind: string } | undefined>,
): string[] {
  return childIds
    .filter((cid) => byId[cid] && !isRelationKind(byId[cid]!.kind))
    .sort((a, b) => {
      const ka = byId[a]!.kind === 'view' ? 0 : 1
      const kb = byId[b]!.kind === 'view' ? 0 : 1
      if (ka !== kb) return ka - kb
      return a.localeCompare(b)
    })
}

/**
 * Group root elements by directory. Nested paths become nested folders.
 * Elements stay in the folder of their own file; nothing is reparented.
 */
export function buildFolderTree(
  roots: { id: string; fileId: string | null | undefined }[],
): { folders: FolderNode[]; ungroupedIds: string[] } {
  const ungroupedIds: string[] = []
  const elementsByDir = new Map<string, string[]>()
  const dirSet = new Set<string>()

  for (const root of roots) {
    const dir = directoryPath(root.fileId)
    if (!dir) {
      ungroupedIds.push(root.id)
      continue
    }
    const parts = dir.split('/')
    for (let i = 1; i <= parts.length; i += 1) {
      dirSet.add(parts.slice(0, i).join('/'))
    }
    const list = elementsByDir.get(dir) || []
    list.push(root.id)
    elementsByDir.set(dir, list)
  }

  const nodes = new Map<string, FolderNode>()
  const sortedDirs = [...dirSet].sort((a, b) => a.localeCompare(b))
  for (const path of sortedDirs) {
    nodes.set(path, {
      name: path.split('/').pop() || path,
      path,
      folders: [],
      elementIds: elementsByDir.get(path) || [],
    })
  }

  const top: FolderNode[] = []
  for (const path of sortedDirs) {
    const node = nodes.get(path)!
    const slash = path.lastIndexOf('/')
    const parentPath = slash >= 0 ? path.slice(0, slash) : null
    if (parentPath && nodes.has(parentPath)) nodes.get(parentPath)!.folders.push(node)
    else top.push(node)
  }

  const sortFolders = (list: FolderNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name))
    for (const folder of list) sortFolders(folder.folders)
  }
  sortFolders(top)
  return { folders: top, ungroupedIds }
}

/** Saved ids win; unknown ids are dropped; new ids keep their default order at the end. */
export function orderSiblingIds(defaultIds: string[], saved: string[] | undefined): string[] {
  if (!saved?.length) return defaultIds
  const present = new Set(defaultIds)
  const kept = saved.filter((id) => present.has(id))
  const keptSet = new Set(kept)
  const rest = defaultIds.filter((id) => !keptSet.has(id))
  return [...kept, ...rest]
}

export function applyFolderTreeOrder(
  folders: FolderNode[],
  groups: Record<string, string[]>,
  parentPath = '',
): FolderNode[] {
  const orderedPaths = orderSiblingIds(
    folders.map((folder) => folder.path),
    groups[folderSiblingGroupKey(parentPath)],
  )
  const byPath = new Map(folders.map((folder) => [folder.path, folder]))
  return orderedPaths.map((path) => {
    const folder = byPath.get(path)!
    return {
      ...folder,
      elementIds: orderSiblingIds(folder.elementIds, groups[folderContentsGroupKey(path)]),
      folders: applyFolderTreeOrder(folder.folders, groups, path),
    }
  })
}

/**
 * Move one id among the ids of a single sibling list.
 * Returns null when either id is outside that list, so a drop cannot change parent.
 */
export function reorderWithin(
  ids: string[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
): string[] | null {
  if (draggedId === targetId) return null
  if (!ids.includes(draggedId) || !ids.includes(targetId)) return null
  const next = ids.filter((id) => id !== draggedId)
  const targetIndex = next.indexOf(targetId)
  const insertAt = position === 'before' ? targetIndex : targetIndex + 1
  next.splice(insertAt, 0, draggedId)
  if (next.every((id, index) => id === ids[index])) return null
  return next
}

export function loadViewTreeOrder(projectId: string): ViewTreeOrder {
  if (!projectId) return emptyViewTreeOrder()
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId)
    if (!raw) return emptyViewTreeOrder()
    const parsed = JSON.parse(raw) as { groups?: unknown }
    if (!parsed || typeof parsed !== 'object' || !parsed.groups || typeof parsed.groups !== 'object') {
      return emptyViewTreeOrder()
    }
    const groups: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(parsed.groups as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((id) => typeof id === 'string')) {
        groups[key] = value
      }
    }
    return { groups }
  } catch {
    return emptyViewTreeOrder()
  }
}

export function saveViewTreeOrder(projectId: string, order: ViewTreeOrder): void {
  if (!projectId) return
  localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(order))
}
