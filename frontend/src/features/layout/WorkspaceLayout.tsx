import type { ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import type { AppSettings } from '../../settings'

type Props = {
  layout: Pick<AppSettings, 'horizontalPanelSizes'>
  onLayoutChange: (sizes: [number, number, number]) => void
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

export function WorkspaceLayout({ layout, onLayoutChange, left, center, right }: Props) {
  const [leftSize, centerSize, rightSize] = layout.horizontalPanelSizes

  return (
    <div className="workspace no-print panel-host">
      <Group
        orientation="horizontal"
        className="panel-group-horizontal"
        onLayoutChanged={(panelLayout) => {
          const l = panelLayout['left']
          const c = panelLayout['center']
          const r = panelLayout['right']
          if (l != null && c != null && r != null) {
            onLayoutChange([l, c, r])
          }
        }}
      >
        <Panel
          id="left"
          defaultSize={`${leftSize}%`}
          minSize="12%"
          maxSize="40%"
          className="panel-scroll"
        >
          {left}
        </Panel>
        <Separator className="panel-resize-handle panel-resize-handle-vertical" />
        <Panel id="center" defaultSize={`${centerSize}%`} minSize="30%" className="panel-fill">
          {center}
        </Panel>
        <Separator className="panel-resize-handle panel-resize-handle-vertical" />
        <Panel
          id="right"
          defaultSize={`${rightSize}%`}
          minSize="12%"
          maxSize="45%"
          className="panel-scroll"
        >
          {right}
        </Panel>
      </Group>
    </div>
  )
}
