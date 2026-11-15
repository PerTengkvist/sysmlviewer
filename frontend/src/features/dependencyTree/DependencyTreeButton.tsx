import { ListTree } from 'lucide-react'

/** Icon button that opens the dependency tree of an element. */
export function DependencyTreeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="dependency-tree-button"
      title="dependency tree"
      aria-label="dependency tree"
      onClick={onClick}
    >
      <ListTree size={16} aria-hidden="true" />
    </button>
  )
}
