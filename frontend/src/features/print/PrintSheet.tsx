import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ViewMode } from '../../settings'
import { DiagramCanvas } from '../diagram/DiagramCanvas'
import type { ProjectSheet } from '../sheet/sheet'
import type { PrintPage } from './printLayout'

const noop = () => {}
const noopAsync = async () => {}

type Props = {
  pages: PrintPage[]
  sheet: ProjectSheet
  viewMode: ViewMode
  showAttributes: boolean
  selectedConnectionColor: string
  selectedConnectionLinewidth: number
  connectionSeparation: number
  onDiagramReady: (diagramId: string) => void
}

export function PrintSheet({
  pages,
  sheet,
  viewMode,
  showAttributes,
  selectedConnectionColor,
  selectedConnectionLinewidth,
  connectionSeparation,
  onDiagramReady,
}: Props) {
  return (
    <div className="print-root" aria-hidden>
      {pages.map((page, i) => (
        <div
          key={i}
          className="print-page"
          style={{
            width: `${page.widthMm}mm`,
            height: `${page.heightMm}mm`,
          }}
        >
          {page.showFrame && <div className="print-frame" />}
          {page.showTitleBlock && sheet.titleBlock && (
            <div className={`print-title-block pos-${sheet.titleBlock.position}`}>
              <div>
                <strong>{sheet.titleBlock.title}</strong>
              </div>
              <div>ID: {sheet.titleBlock.drawingId}</div>
              <div>Ver: {sheet.titleBlock.version}</div>
              <div>By: {sheet.titleBlock.createdBy}</div>
              <div>Edit: {sheet.titleBlock.editedBy}</div>
              <div>{sheet.titleBlock.lastUpdated}</div>
            </div>
          )}
          <div
            className={`print-diagrams${
              page.diagrams.length === 1 ? ' print-layout-separate' : ''
            }`}
          >
            {page.diagrams.map((d) => (
              <div key={d.id} className="print-diagram-slot">
                <h3 className="print-diagram-title">{d.name}</h3>
                {d.viewPayload ? (
                  <div className="print-diagram-canvas-host">
                    <DiagramCanvas
                      view={d.viewPayload}
                      diagramEpoch={0}
                      printMode
                      viewMode={viewMode}
                      showAttributes={showAttributes}
                      selectedConnectionColor={selectedConnectionColor}
                      selectedConnectionLinewidth={selectedConnectionLinewidth}
                      connectionSeparation={connectionSeparation}
                      sheet={sheet}
                      onSelectArtifact={noop}
                      onOpenView={noop}
                      onNodesMoved={noopAsync}
                      onPortMoved={noop}
                      onConnectPorts={noop}
                      onWaypointsMoved={noopAsync}
                      onLabelOffsetMoved={noopAsync}
                      onPrintReady={() => onDiagramReady(d.id)}
                    />
                  </div>
                ) : null}
                {d.documentation ? (
                  <div className="print-description markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {d.documentation}
                    </ReactMarkdown>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
