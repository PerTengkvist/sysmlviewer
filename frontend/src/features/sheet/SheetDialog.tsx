import { useEffect, useState } from 'react'
import {
  TITLE_BLOCK_POSITIONS,
  type ProjectSheet,
  type SheetFrame,
  type TitleBlock,
  type TitleBlockPosition,
} from './sheet'

type Props = {
  open: boolean
  sheet: ProjectSheet
  onClose: () => void
  onSaveTitleBlock: (block: TitleBlock) => void
  onClearTitleBlock: () => void
  onSaveFrame: (frame: SheetFrame) => void
  onClearFrame: () => void
}

const emptyBlock = (): TitleBlock => ({
  title: '',
  createdBy: '',
  editedBy: '',
  version: '',
  lastUpdated: '',
  drawingId: '',
  position: 'bottom-right',
})

export function SheetDialog({
  open,
  sheet,
  onClose,
  onSaveTitleBlock,
  onClearTitleBlock,
  onSaveFrame,
  onClearFrame,
}: Props) {
  const [block, setBlock] = useState<TitleBlock>(sheet.titleBlock ?? emptyBlock())
  const [frame, setFrame] = useState<SheetFrame>(
    sheet.frame ?? { paper: 'A4', orientation: 'landscape', visible: true },
  )

  useEffect(() => {
    if (open) {
      setBlock(sheet.titleBlock ?? emptyBlock())
      setFrame(sheet.frame ?? { paper: 'A4', orientation: 'landscape', visible: true })
    }
  }, [open, sheet])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-wide"
        role="dialog"
        aria-label="Drawing sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Drawing sheet</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <h3>Title block</h3>
          {(
            [
              ['title', 'Title'],
              ['createdBy', 'Created by'],
              ['editedBy', 'Edited by'],
              ['version', 'Version'],
              ['lastUpdated', 'Last updated'],
              ['drawingId', 'Drawing ID'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="settings-row">
              <span>{label}</span>
              <input
                value={block[key]}
                onChange={(e) => setBlock({ ...block, [key]: e.target.value })}
              />
            </label>
          ))}
          <label className="settings-row">
            <span>Position</span>
            <select
              value={block.position}
              onChange={(e) =>
                setBlock({
                  ...block,
                  position: e.target.value as TitleBlockPosition,
                })
              }
            >
              {TITLE_BLOCK_POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClearTitleBlock}>
              Remove title block
            </button>
            <button type="button" className="primary" onClick={() => onSaveTitleBlock(block)}>
              Save title block
            </button>
          </div>

          <h3>Frame</h3>
          <label className="settings-row">
            <span>Paper</span>
            <select
              value={frame.paper}
              onChange={(e) =>
                setFrame({ ...frame, paper: e.target.value as SheetFrame['paper'] })
              }
            >
              <option value="A4">A4</option>
              <option value="A3">A3</option>
            </select>
          </label>
          <label className="settings-row">
            <span>Orientation</span>
            <select
              value={frame.orientation}
              onChange={(e) =>
                setFrame({
                  ...frame,
                  orientation: e.target.value as SheetFrame['orientation'],
                })
              }
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </select>
          </label>
          <label className="settings-row">
            <span>Visible on canvas</span>
            <input
              type="checkbox"
              checked={frame.visible}
              onChange={(e) => setFrame({ ...frame, visible: e.target.checked })}
            />
          </label>
          <div className="modal-actions">
            <button type="button" onClick={onClearFrame}>
              Remove frame
            </button>
            <button type="button" className="primary" onClick={() => onSaveFrame(frame)}>
              Save frame
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
