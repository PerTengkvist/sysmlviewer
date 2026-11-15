import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Dependency tree: one chain up towards the more abstract element and a
 * labelled tree down, opened from Details and from the use case dialog.
 */

const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`
const REQ = 'Requirements::BrakingDistance'
const BRAKE = 'UseCases::Driving::Brake'

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await openView(page, 'UseCases::UseCaseTraceabilityView')
  await fitView(page)
})

async function openRequirementTree(page: Page) {
  await page.locator(nodeSel(REQ)).click()
  const sidebar = page.locator('.right-sidebar .details-panel')
  await expect(sidebar).toContainText('BrakingDistance')
  await sidebar.getByRole('button', { name: 'dependency tree' }).click()
  const dlg = page.getByRole('dialog', { name: /^Dependency tree .*BrakingDistance$/ })
  await expect(dlg).toBeVisible()
  await expect(dlg.locator('.dependency-tree-root')).toBeVisible()
  return dlg
}

test('a requirement shows its group above and what satisfies and pursues it below', async ({
  page,
}) => {
  const dlg = await openRequirementTree(page)

  const up = dlg.locator('.dependency-tree-up')
  await expect(up.locator('[data-related-id="Requirements::Safety"]')).toBeVisible()
  await expect(up).toContainText('«refine»')
  await expect(dlg.locator('.dependency-tree-root')).toContainText('BrakingDistance')

  const down = dlg.locator('.dependency-tree-down > .dependency-tree-children')
  for (const part of ['brakePedal', 'frictionBrakes', 'driveController']) {
    const row = down.locator(':scope > li > .dependency-tree-row', {
      has: page.locator(`[data-related-id="LogicalArchitecture::Car::${part}"]`),
    })
    await expect(row).toContainText('«satisfy»')
  }
  const brake = down.locator(':scope > li > .dependency-tree-row', {
    has: page.locator(`[data-related-id="${BRAKE}"]`),
  })
  await expect(brake).toContainText('«objective»')
})

test('clicking a branch opens that element', async ({ page }) => {
  const dlg = await openRequirementTree(page)
  await dlg
    .locator('.dependency-tree-down [data-related-id="LogicalArchitecture::Car::brakePedal"]')
    .first()
    .click()
  await expect(dlg).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'part brakePedal' })).toBeVisible()
})

test('the use case dialog opens the tree of its use case', async ({ page }) => {
  await page.locator(nodeSel(BRAKE)).dblclick()
  const ucDialog = page.getByRole('dialog', { name: 'Use case Brake' })
  await expect(ucDialog).toBeVisible()
  await ucDialog.getByRole('button', { name: 'dependency tree' }).click()
  await expect(ucDialog).toBeHidden()

  const dlg = page.getByRole('dialog', { name: 'Dependency tree Brake' })
  await expect(dlg).toBeVisible()
  await expect(
    dlg.locator(`.dependency-tree-up [data-related-id="${REQ}"]`),
  ).toBeVisible()
  // Only one dialog at a time.
  await expect(page.getByRole('dialog')).toHaveCount(1)
})
