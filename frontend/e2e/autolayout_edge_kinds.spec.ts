import { expect, test, type Page } from '@playwright/test'
import {
  exampleProjectFile,
  openProject,
  openView,
  runAutoLayout,
} from './helpers/diagram'

/**
 * AutoLayout "Place by" checkboxes: relations place requirement diagrams,
 * and the choice is saved with the view.
 */

type Box = { id: string; x: number; y: number; w: number; h: number }

async function requirementBoxes(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.react-flow__node-requirement')].map(
      (el) => {
        const r = el.getBoundingClientRect()
        return { id: el.dataset.id || '', x: r.x, y: r.y, w: r.width, h: r.height }
      },
    ),
  )
}

function overlapPairs(boxes: Box[]): string[] {
  const out: string[] = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!
      const b = boxes[j]!
      if (a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1) {
        out.push(`${a.id} / ${b.id}`)
      }
    }
  }
  return out
}

async function openDialog(page: Page) {
  await page.getByRole('button', { name: /Open AutoLayout directives/ }).click()
  const dlg = page.getByRole('dialog', { name: 'AutoLayout directives' })
  await dlg.waitFor()
  return dlg
}

test('relations place a requirement diagram without overlaps', async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, 'Requirements::RequirementsGraphView')
  const before = await requirementBoxes(page)
  expect(before.length).toBeGreaterThan(10)

  // A diagram without connections defaults to placing by relations.
  const dlg = await openDialog(page)
  await expect(dlg.getByTestId('al-edges-relations')).toBeChecked()
  await expect(dlg.getByTestId('al-edges-connections')).toBeChecked()
  await dlg.getByRole('button', { name: 'Cancel' }).click()

  await runAutoLayout(page, { mode: 'advanced', pipeline: 'hierarchic' })
  const after = await requirementBoxes(page)
  expect(overlapPairs(after)).toEqual([])
  const moved = after.filter((a) => {
    const b = before.find((x) => x.id === a.id)
    return b && (Math.abs(b.x - a.x) > 2 || Math.abs(b.y - a.y) > 2)
  })
  expect(moved.length, 'requirements placed by AutoLayout').toBeGreaterThan(0)
})

test('the Place by choice is saved with the view', async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
  await openView(page, 'RequirementsExample::RequirementsGraphView')

  let dlg = await openDialog(page)
  await dlg.getByTestId('al-edges-relations').setChecked(false)
  await dlg.getByTestId('al-edges-bindings').setChecked(false)
  await dlg.getByTestId('al-run').click()
  await dlg.waitFor({ state: 'detached', timeout: 150_000 })

  // A fresh page load reads the choice back from the view.
  await openView(page, 'RequirementsExample::RequirementsGraphView')
  dlg = await openDialog(page)
  await expect(dlg.getByTestId('al-edges-connections')).toBeChecked()
  await expect(dlg.getByTestId('al-edges-bindings')).not.toBeChecked()
  await expect(dlg.getByTestId('al-edges-relations')).not.toBeChecked()
})
