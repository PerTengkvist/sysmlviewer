import { useState } from 'react'
import type { DependencyTree, DependencyTreeNode } from '../../api'

type Props = {
  tree: DependencyTree
  /** Open the details of an element clicked in the tree. */
  onOpenElement?: (artifactId: string) => void
}

type Named = { id: string; name: string; shortId?: string | null }

function displayName(el: Named): string {
  return el.shortId ? `${el.shortId} ${el.name}` : el.name
}

function ElementLink({
  el,
  onOpenElement,
}: {
  el: Named & { kind: string }
  onOpenElement?: (artifactId: string) => void
}) {
  const name = displayName(el)
  return (
    <>
      <span className="artifact-kind">{el.kind}</span>{' '}
      {onOpenElement ? (
        <button
          type="button"
          className="link-button"
          data-related-id={el.id}
          title={`Open ${name}`}
          onClick={() => onOpenElement(el.id)}
        >
          {name}
        </button>
      ) : (
        <span data-related-id={el.id}>{name}</span>
      )}
    </>
  )
}

function Stereotype({ label }: { label: string | null }) {
  if (!label) return null
  return <span className="relation-stereotype">«{label}»</span>
}

function Branch({
  node,
  onOpenElement,
}: {
  node: DependencyTreeNode
  onOpenElement?: (artifactId: string) => void
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const classes = ['dependency-tree-node']
  if (node.repeated) classes.push('is-repeated')
  return (
    <li className={classes.join(' ')} role="treeitem" aria-expanded={hasChildren ? open : undefined}>
      <div className="tree-row dependency-tree-row">
        {hasChildren ? (
          <button
            type="button"
            className="dependency-tree-toggle"
            aria-expanded={open}
            aria-label={open ? 'Collapse' : 'Expand'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="dependency-tree-toggle is-leaf" aria-hidden="true" />
        )}
        <Stereotype label={node.label} />{' '}
        <ElementLink el={node} onOpenElement={onOpenElement} />
        {node.repeated && (
          <span
            className="dependency-tree-repeated"
            title="Shown elsewhere in the tree"
          >
            ↺
          </span>
        )}
        {node.truncated && (
          <span className="dependency-tree-truncated" title="More below, not shown">
            …
          </span>
        )}
      </div>
      {hasChildren && open && (
        <BranchList nodes={node.children} onOpenElement={onOpenElement} />
      )}
    </li>
  )
}

function BranchList({
  nodes,
  onOpenElement,
}: {
  nodes: DependencyTreeNode[]
  onOpenElement?: (artifactId: string) => void
}) {
  return (
    <ul className="dependency-tree-children" role="group">
      {nodes.map((child, i) => (
        <Branch
          key={`${child.relationId ?? child.label}|${child.id}|${i}`}
          node={child}
          onOpenElement={onOpenElement}
        />
      ))}
    </ul>
  )
}

/**
 * Up: one chain, the most abstract element first, each step labelled with
 * the relation to the element below it. Down: the root and its branches.
 */
export function DependencyTreeView({ tree, onOpenElement }: Props) {
  const { up, down } = tree
  return (
    <div className="dependency-tree">
      {up.length > 0 && (
        <ol className="dependency-tree-up" aria-label="Up">
          {up.map((n) => (
            <li key={n.id} className="dependency-tree-up-step">
              <div className="tree-row dependency-tree-row">
                <ElementLink el={n} onOpenElement={onOpenElement} />
                {n.alternatives > 0 && (
                  <span
                    className="dependency-tree-alternatives"
                    title={`${n.alternatives} more at this level, not followed`}
                  >
                    +{n.alternatives}
                  </span>
                )}
              </div>
              <div className="dependency-tree-edge">
                <span aria-hidden="true">↓</span> <Stereotype label={n.label} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="dependency-tree-down" role="tree" aria-label="Down">
        <div className="tree-row dependency-tree-row dependency-tree-root is-root" aria-current="true">
          <span className="artifact-kind">{down.kind}</span>{' '}
          <strong>{displayName(down)}</strong>
          {down.truncated && (
            <span className="dependency-tree-truncated" title="More below, not shown">
              …
            </span>
          )}
        </div>
        {down.children.length > 0 ? (
          <BranchList nodes={down.children} onOpenElement={onOpenElement} />
        ) : (
          <p className="muted">Nothing depends on this element.</p>
        )}
      </div>
      {tree.truncated && (
        <p className="muted dependency-tree-note">
          The tree is cut off at its depth or size limit (…).
        </p>
      )}
    </div>
  )
}
