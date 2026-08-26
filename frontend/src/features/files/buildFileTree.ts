import type { SysmlFile } from '../../api'

export type FileTreeNode =
  | { kind: 'folder'; name: string; path: string; children: FileTreeNode[] }
  | { kind: 'sysml'; name: string; path: string; file: SysmlFile }
  | { kind: 'markdown'; name: string; path: string }

function ensureFolder(
  root: FileTreeNode[],
  folderPath: string,
  folderName: string,
): Extract<FileTreeNode, { kind: 'folder' }> {
  let folder = root.find(
    (n): n is Extract<FileTreeNode, { kind: 'folder' }> =>
      n.kind === 'folder' && n.path === folderPath,
  )
  if (!folder) {
    folder = { kind: 'folder', name: folderName, path: folderPath, children: [] }
    root.push(folder)
  }
  return folder
}

function insertAtPath(root: FileTreeNode[], dirParts: string[], leaf: FileTreeNode): void {
  if (dirParts.length === 0) {
    if (!root.some((n) => n.kind !== 'folder' && n.path === leaf.path)) {
      root.push(leaf)
    }
    return
  }
  const folderPath = dirParts.join('/')
  const folderName = dirParts[dirParts.length - 1]
  const parentParts = dirParts.slice(0, -1)
  const parent =
    parentParts.length === 0
      ? null
      : ensureFolder(root, parentParts.join('/'), parentParts[parentParts.length - 1])
  const container = parent ? parent.children : root
  const folder = ensureFolder(container, folderPath, folderName)
  insertAtPath(folder.children, [], leaf)
}

function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes].sort((a, b) => {
    const rank = (n: FileTreeNode) => (n.kind === 'folder' ? 0 : 1)
    if (rank(a) !== rank(b)) return rank(a) - rank(b)
    return a.name.localeCompare(b.name)
  })
}

function sortTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return sortNodes(nodes).map((n) =>
    n.kind === 'folder' ? { ...n, children: sortTree(n.children) } : n,
  )
}

/** Build a folder tree from SysML project files and documentation paths. */
export function buildFileTree(files: SysmlFile[], docPaths: string[]): FileTreeNode[] {
  const root: FileTreeNode[] = []

  for (const file of files) {
    const rel = file.path || file.name
    const parts = rel.split('/')
    const fileName = parts.pop() || file.name
    insertAtPath(root, parts, { kind: 'sysml', name: fileName, path: rel, file })
  }

  for (const docPath of docPaths) {
    const parts = docPath.split('/')
    const fileName = parts.pop() || docPath
    insertAtPath(root, parts, { kind: 'markdown', name: fileName, path: docPath })
  }

  return sortTree(root)
}
