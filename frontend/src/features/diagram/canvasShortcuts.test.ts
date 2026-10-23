import { describe, expect, it, vi } from 'vitest'
import { allDiagramIds, handleCanvasShortcut } from './canvasShortcuts'

function keyEvent(
  partial: Partial<KeyboardEvent> & { key: string },
): KeyboardEvent {
  return {
    key: partial.key,
    ctrlKey: !!partial.ctrlKey,
    metaKey: !!partial.metaKey,
    shiftKey: !!partial.shiftKey,
    target: partial.target ?? { tagName: 'DIV', isContentEditable: false },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('allDiagramIds', () => {
  it('concatenates node and edge ids', () => {
    expect(
      allDiagramIds([{ id: 'n1' }, { id: 'n2' }], [{ id: 'e1' }]),
    ).toEqual(['n1', 'n2', 'e1'])
  })
})

describe('handleCanvasShortcut', () => {
  it('maps Ctrl+Z / Ctrl+Y / Ctrl+A', () => {
    const handlers = {
      undo: vi.fn(),
      redo: vi.fn(),
      selectAll: vi.fn(),
    }
    expect(handleCanvasShortcut(keyEvent({ key: 'z', ctrlKey: true }), handlers)).toBe(
      'undo',
    )
    expect(handleCanvasShortcut(keyEvent({ key: 'y', metaKey: true }), handlers)).toBe(
      'redo',
    )
    expect(
      handleCanvasShortcut(keyEvent({ key: 'z', ctrlKey: true, shiftKey: true }), handlers),
    ).toBe('redo')
    expect(handleCanvasShortcut(keyEvent({ key: 'a', ctrlKey: true }), handlers)).toBe(
      'selectAll',
    )
    expect(handlers.undo).toHaveBeenCalledTimes(1)
    expect(handlers.redo).toHaveBeenCalledTimes(2)
    expect(handlers.selectAll).toHaveBeenCalledTimes(1)
  })

  it('ignores shortcuts in inputs', () => {
    const handlers = { undo: vi.fn(), redo: vi.fn(), selectAll: vi.fn() }
    expect(
      handleCanvasShortcut(
        keyEvent({
          key: 'z',
          ctrlKey: true,
          target: { tagName: 'INPUT', isContentEditable: false } as EventTarget,
        }),
        handlers,
      ),
    ).toBeNull()
    expect(handlers.undo).not.toHaveBeenCalled()
  })
})
