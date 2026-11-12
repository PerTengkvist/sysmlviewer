import { describe, expect, it } from 'vitest'
import { nextDialogDraft } from './dialogDraft'

describe('nextDialogDraft', () => {
  it('takes the incoming value when the dialog opens', () => {
    expect(nextDialogDraft('old', { open: true, wasOpen: false, incoming: 'new' })).toBe('new')
  })

  it('keeps the draft while the dialog is open, even when an older save echoes back', () => {
    // Typed "Login*"; the echo of the save for "Lo" arrives afterwards.
    expect(
      nextDialogDraft('Login*', { open: true, wasOpen: true, incoming: 'Lo' }),
    ).toBe('Login*')
  })

  it('keeps the draft while the dialog is closed', () => {
    expect(nextDialogDraft('a', { open: false, wasOpen: true, incoming: 'b' })).toBe('a')
    expect(nextDialogDraft('a', { open: false, wasOpen: false, incoming: 'b' })).toBe('a')
  })

  it('takes the new incoming value after closing and opening again', () => {
    let draft = nextDialogDraft('x', { open: true, wasOpen: false, incoming: 'first' })
    draft = nextDialogDraft(draft, { open: true, wasOpen: true, incoming: 'echo' })
    draft = nextDialogDraft(draft, { open: false, wasOpen: true, incoming: 'saved' })
    draft = nextDialogDraft(draft, { open: true, wasOpen: false, incoming: 'saved' })
    expect(draft).toBe('saved')
  })
})
