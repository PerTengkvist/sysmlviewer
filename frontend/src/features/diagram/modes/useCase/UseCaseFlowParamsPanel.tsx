import type { SemanticElement } from '../../../../api'
import type { UseCaseFlowParams } from './buildUseCaseFlow'

type Props = {
  params: UseCaseFlowParams
  actionLinks: string[]
  semantic: Record<string, SemanticElement>
  onOpenAction?: (actionId: string) => void
  /** Open the details of a traced requirement. */
  onOpenElement?: (artifactId: string) => void
}

/** Left side of the use case dialog: parameters, traced requirements, actions. */
export function UseCaseFlowParamsPanel({
  params,
  actionLinks,
  semantic,
  onOpenAction,
  onOpenElement,
}: Props) {
  return (
    <aside className="usecase-flow-params">
      <h3>Parameters</h3>
      <dl>
        <dt>Title</dt>
        <dd>{params.title}</dd>
        <dt>Actor</dt>
        <dd>{params.actors.join(', ') || '—'}</dd>
        <dt>Subject</dt>
        <dd>{params.subjects.join(', ') || '—'}</dd>
        <dt>Objective</dt>
        <dd>{params.objective || '—'}</dd>
      </dl>
      {params.requirements.length > 0 ? (
        <div className="usecase-flow-requirements">
          <h3>Requirements</h3>
          <ul>
            {params.requirements.map((req) => (
              <li key={`${req.id}|${req.label}`}>
                <span className="relation-stereotype">«{req.label}»</span>{' '}
                {onOpenElement ? (
                  <button
                    type="button"
                    className="link-button"
                    data-requirement-id={req.id}
                    title={`Open ${req.name}`}
                    onClick={() => onOpenElement(req.id)}
                  >
                    {req.name}
                  </button>
                ) : (
                  <span data-requirement-id={req.id}>{req.name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {actionLinks.length > 0 && onOpenAction ? (
        <div className="usecase-flow-action-links">
          <h3>Actions</h3>
          <ul>
            {actionLinks.map((id) => (
              <li key={id}>
                <button type="button" onClick={() => onOpenAction(id)}>
                  Open {semantic[id]?.name || id}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  )
}
