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
import { DependencyTreeButton } from '../../../dependencyTree/DependencyTreeButton'
import { handleVisibilityClass, useOptionKeyHeld } from '../../optionKey'

const nodeTypes = { action: ActionNode }

type Props = {
  useCaseId: string
  semantic: Record<string, SemanticElement>
  onClose: () => void
  onOpenAction?: (actionId: string) => void
  /** Open the details of a traced requirement. */
  onOpenElement?: (artifactId: string) => void
  /** Open the dependency tree of this use case. */
  onOpenDependencyTree?: (artifactId: string) => void
}

export function UseCaseFlowDialog({
  useCaseId,
  semantic,
  onClose,
  onOpenAction,
  onOpenElement,
  onOpenDependencyTree,
}: Props) {
  // Connection handles show only while Option is held, as on the canvas.
  const optionHeld = useOptionKeyHeld()
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
          <span className="element-dialog-actions">
            {onOpenDependencyTree && (
              <DependencyTreeButton onClick={() => onOpenDependencyTree(useCaseId)} />
            )}
            <button type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </span>
        </header>
        <div className="usecase-flow-body">
          <UseCaseFlowParamsPanel
            params={flow.params}
            actionLinks={flow.actionLinks}
            semantic={semantic}
            onOpenAction={onOpenAction}
            onOpenElement={onOpenElement}
          />
          <div
            className={['usecase-flow-canvas', handleVisibilityClass(optionHeld)]
              .filter(Boolean)
              .join(' ')}
          >
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
