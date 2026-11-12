import { useState } from 'react'

/**
 * Next draft of a dialog that saves while it is open. The draft is taken
 * from the saved value only when the dialog opens: while it is open, every
 * save echoes back an older value and must never replace what is typed.
 */
export function nextDialogDraft<T>(
  draft: T,
  { open, wasOpen, incoming }: { open: boolean; wasOpen: boolean; incoming: T },
): T {
  return open && !wasOpen ? incoming : draft
}

/**
 * Draft state for a dialog: `value` seeds it each time the dialog opens and
 * is ignored while it stays open.
 */
export function useDialogDraft<T>(
  open: boolean,
  value: T,
): [T, (next: T) => void] {
  const [draft, setDraft] = useState<T>(value)
  // Previous `open`, kept in state (React's "adjust state on prop change").
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    const next = nextDialogDraft(draft, { open, wasOpen, incoming: value })
    if (next !== draft) setDraft(next)
    return [next, setDraft]
  }
  return [draft, setDraft]
}
