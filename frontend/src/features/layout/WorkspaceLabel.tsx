import { pathTail } from './pathTail'

type Props = {
  name: string | null | undefined
  root: string | null | undefined
  /** Character budget for the visible tail of the root path. */
  maxChars?: number
}

/** Header label: project name plus the end of the workspace path. */
export function WorkspaceLabel({ name, root, maxChars = 48 }: Props) {
  return (
    <span className="workspace-label muted">
      <span className="workspace-name">{name || 'No project'}</span>
      {root ? (
        <span className="workspace-path" title={root}>
          {' — '}
          {pathTail(root, maxChars)}
        </span>
      ) : null}
    </span>
  )
}
