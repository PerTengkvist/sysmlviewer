import { useEffect, type ReactNode } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import type { AppSettings } from '../../settings'

type Props = {
  layout: Pick<AppSettings, 'horizontalPanelSizes'>
  onLayoutChange: (sizes: [number, number, number]) => void
  /** Right sidebar hidden; the center panel takes its space. */
  rightCollapsed?: boolean
  onToggleRight?: () => void
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

export function WorkspaceLayout({
  layout,
  onLayoutChange,
  rightCollapsed = false,
  onToggleRight,
  left,
  center,
  right,
}: Props) {
  const [leftSize, centerSize, rightSize] = layout.horizontalPanelSizes
  const rightRef = usePanelRef()

  useEffect(() => {
    const handle = rightRef.current
    if (!handle) return
    if (rightCollapsed && !handle.isCollapsed()) handle.collapse()
    else if (!rightCollapsed && handle.isCollapsed()) handle.expand()
  }, [rightCollapsed, rightRef])

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
          className="panel-fill"
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
          panelRef={rightRef}
          collapsible
          collapsedSize={0}
          defaultSize={`${rightSize}%`}
          minSize="12%"
          maxSize="45%"
          className="panel-scroll"
        >
          {right}
        </Panel>
      </Group>
      {rightCollapsed ? (
        <div className="panel-collapsed-strip">
          <button
            type="button"
            className="panel-collapsed-btn"
            aria-label="Show details panel"
            title="Show details panel"
            onClick={onToggleRight}
          >
            ‹ Details
          </button>
        </div>
      ) : null}
    </div>
  )
}
