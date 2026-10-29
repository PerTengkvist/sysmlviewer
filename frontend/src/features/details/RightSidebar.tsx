import type { ComponentProps } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { DetailsPanel } from './DetailsPanel'
import { DocumentationPanel } from './DocumentationPanel'
import type { AppSettings } from '../../settings'

type DetailsProps = ComponentProps<typeof DetailsPanel>

type Props = DetailsProps & {
  layout: Pick<AppSettings, 'rightPanelSizes'>
  onLayoutChange: (sizes: [number, number]) => void
  /** Hide the sidebar (canvas takes the space). */
  onToggle?: () => void
  requirementDisplay?: AppSettings['requirementDisplay']
  /** Project documentation paths (markdown files in docs folders). */
  docPaths?: readonly string[]
  /** Open an internal markdown link in the markdown dialog. */
  onOpenDoc?: (docPath: string) => void
}

export function RightSidebar({
  layout,
  onLayoutChange,
  onToggle,
  requirementDisplay,
  docPaths,
  onOpenDoc,
  ...detailsProps
}: Props) {
  const [detailsSize, docsSize] = layout.rightPanelSizes

  return (
    <aside className="sidebar right-sidebar panel-host">
      <div className="sidebar-toolbar right-sidebar-toolbar">
        <button
          type="button"
          className="sidebar-toolbar-btn"
          aria-label="Hide details panel"
          title="Hide details panel"
          onClick={onToggle}
        >
          ›
        </button>
      </div>
      <Group
        orientation="vertical"
        className="panel-group-vertical"
        onLayoutChanged={(panelLayout) => {
          const top = panelLayout['details']
          const bottom = panelLayout['docs']
          if (top != null && bottom != null) {
            onLayoutChange([top, bottom])
          }
        }}
      >
        <Panel
          id="details"
          defaultSize={`${detailsSize}%`}
          minSize="20%"
          className="panel-scroll"
        >
          <DetailsPanel {...detailsProps} />
        </Panel>
        <Separator className="panel-resize-handle panel-resize-handle-horizontal" />
        <Panel id="docs" defaultSize={`${docsSize}%`} minSize="20%" className="panel-scroll">
          <DocumentationPanel
            project={detailsProps.project}
            selectedId={detailsProps.selectedId}
            docPaths={docPaths}
            requirementDisplay={requirementDisplay}
            onOpenDoc={onOpenDoc}
          />
        </Panel>
      </Group>
    </aside>
  )
}
