import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
} from '@xyflow/react'
import type { SemanticElement } from '../../../../api'
import { buildUseCaseFlow } from './buildUseCaseFlow'
import { ActionNode } from '../actionFlow/ActionNode'

const nodeTypes = { action: ActionNode }

type Props = {
  useCaseId: string
  semantic: Record<string, SemanticElement>
  onClose: () => void
  onOpenAction?: (actionId: string) => void
}

export function UseCaseFlowDialog({
  useCaseId,
  semantic,
  onClose,
  onOpenAction,
}: Props) {
  const flow = useMemo(
    () => buildUseCaseFlow(useCaseId, semantic),
    [useCaseId, semantic],
  )

  return (
    <div className="usecase-flow-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="usecase-flow-dialog"
        role="dialog"
        aria-label={`Use case ${flow.params.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{flow.params.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="usecase-flow-body">
          <aside className="usecase-flow-params">
            <h3>Parameters</h3>
            <dl>
              <dt>Title</dt>
              <dd>{flow.params.title}</dd>
              <dt>Actor</dt>
              <dd>{flow.params.actors.join(', ') || '—'}</dd>
              <dt>Subject</dt>
              <dd>{flow.params.subjects.join(', ') || '—'}</dd>
              <dt>Objective</dt>
              <dd>{flow.params.objective || '—'}</dd>
            </dl>
            {flow.actionLinks.length > 0 && onOpenAction ? (
              <div className="usecase-flow-action-links">
                <h3>Actions</h3>
                <ul>
                  {flow.actionLinks.map((id) => (
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
          <div className="usecase-flow-canvas">
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              fitView
              nodesDraggable={false}
              nodesConnectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </div>
        </div>
      </div>
    </div>
  )
}
