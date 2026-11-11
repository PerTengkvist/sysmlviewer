import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

/**
 * Align / distribute must work for requirement and use case nodes, in a
 * GeneralView requirement diagram and in a UseCaseView, not only for parts.
 */

const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

async function centers(page: Page, ids: string[]) {
  const out: { x: number; y: number }[] = []
  for (const id of ids) {
    const b = (await page.locator(nodeSel(id)).boundingBox())!
    out.push({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
  }
  return out
}

async function selectNodes(page: Page, ids: string[]) {
  await page.locator(nodeSel(ids[0]!)).click({ position: { x: 12, y: 8 } })
  for (const id of ids.slice(1)) {
    await page
      .locator(nodeSel(id))
      .click({ position: { x: 12, y: 8 }, modifiers: ['Shift'] })
  }
  for (const id of ids) {
    await expect(page.locator(nodeSel(id))).toHaveClass(/selected/)
  }
}

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
})

test('distributes three requirements horizontally in a GeneralView', async ({ page }) => {
  await openView(page, 'RequirementsExample::RequirementsGraphView')
  const ids = [
    'RequirementsExample::Safety',
    'RequirementsExample::ShowStatus',
    'RequirementsExample::ConfirmAction',
  ]
  await selectNodes(page, ids)
  await page
    .getByRole('button', { name: /Distribute selected elements horizontally/ })
    .click()
  await page.waitForTimeout(300)
  const c = (await centers(page, ids)).sort((a, b) => a.x - b.x)
  expect(Math.abs(c[1]!.x - c[0]!.x - (c[2]!.x - c[1]!.x))).toBeLessThan(2)
})

test('aligns and distributes use cases in a UseCaseView', async ({ page }) => {
  await openView(page, 'UseCasesExample::VehicleUseCaseView')
  const ids = [
    'UseCasesExample::Login',
    'UseCasesExample::Drive',
    'UseCasesExample::EmergencyStop',
  ]
  await selectNodes(page, ids)
  await page
    .getByRole('button', { name: /Align selected to first selected \(vertical = same X\)/ })
    .click()
  await page.waitForTimeout(300)
  let c = await centers(page, ids)
  expect(Math.abs(c[1]!.x - c[0]!.x)).toBeLessThan(2)
  expect(Math.abs(c[2]!.x - c[0]!.x)).toBeLessThan(2)

  await page
    .getByRole('button', { name: /Distribute selected elements vertically/ })
    .click()
  await page.waitForTimeout(300)
  c = (await centers(page, ids)).sort((a, b) => a.y - b.y)
  expect(Math.abs(c[1]!.y - c[0]!.y - (c[2]!.y - c[1]!.y))).toBeLessThan(2)
})
