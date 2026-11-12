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
import { UseCaseFlowParamsPanel } from './UseCaseFlowParamsPanel'
import { DIAGRAM_MAX_ZOOM, DIAGRAM_MIN_ZOOM, diagramFitOptions } from '../../diagramZoom'

const nodeTypes = { action: ActionNode }

type Props = {
  useCaseId: string
  semantic: Record<string, SemanticElement>
  onClose: () => void
  onOpenAction?: (actionId: string) => void
  /** Open the details of a traced requirement. */
  onOpenElement?: (artifactId: string) => void
}

export function UseCaseFlowDialog({
  useCaseId,
  semantic,
  onClose,
  onOpenAction,
  onOpenElement,
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
          <UseCaseFlowParamsPanel
            params={flow.params}
            actionLinks={flow.actionLinks}
            semantic={semantic}
            onOpenAction={onOpenAction}
            onOpenElement={onOpenElement}
          />
          <div className="usecase-flow-canvas">
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={diagramFitOptions(false)}
              minZoom={DIAGRAM_MIN_ZOOM}
              maxZoom={DIAGRAM_MAX_ZOOM}
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
