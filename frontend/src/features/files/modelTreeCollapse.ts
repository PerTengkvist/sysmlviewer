import { defaultChildOrder, type FolderNode } from './viewTreeOrder'

type TreeElement = {
  id: string
  kind: string
  children?: string[]
  sourceId?: string | null
  targetId?: string | null
}

/** Ids of every element (from the given roots down) that has children. */
export function collapsedIdsForAll(
  byId: Record<string, TreeElement | undefined>,
  roots: TreeElement[],
): Set<string> {
  const out = new Set<string>()
  const walk = (id: string) => {
    const el = byId[id]
    if (!el) return
    const kids = defaultChildOrder(el.children || [], byId)
    if (kids.length) out.add(id)
    for (const cid of kids) walk(cid)
  }
  for (const r of roots) walk(r.id)
  return out
}

/** `folder::<path>` keys for every folder, recursively. */
export function collapsedFolderKeysForAll(folders: FolderNode[]): Set<string> {
  const out = new Set<string>()
  const walk = (list: FolderNode[]) => {
    for (const f of list) {
      out.add(`folder::${f.path}`)
      walk(f.folders)
    }
  }
  walk(folders)
  return out
}
