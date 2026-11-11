import { expect, test } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Requirement traceability between use cases and requirements: the use case
 * dialog, the details relations list, a UseCaseView with two kinds of expose,
 * and the Use cases column of the requirement table.
 */

const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
})

test('a UseCaseView shows the requirements its use cases trace to', async ({ page }) => {
  await openView(page, 'UseCases::UseCaseTraceabilityView')
  await expect(page.locator('.react-flow__node-useCase')).toHaveCount(12)
  await expect(page.locator('.react-flow__node-requirement')).toHaveCount(14)
  await expect(
    page.locator('.react-flow__edge-textwrapper, .react-flow__edgelabel-renderer *', {
      hasText: '«objective»',
    }).first(),
  ).toBeVisible()
  // Requirements sit to the right of the use cases.
  const uc = (await page.locator(nodeSel('UseCases::Driving::StartVehicle')).boundingBox())!
  const req = (await page.locator(nodeSel('Requirements::PowerModes')).boundingBox())!
  expect(req.x).toBeGreaterThan(uc.x + uc.width)
})

test('double-click on a use case lists its requirements and opens one', async ({ page }) => {
  await openView(page, 'UseCases::UseCaseTraceabilityView')
  await fitView(page)
  await page.locator(nodeSel('UseCases::Driving::StartVehicle')).dblclick()
  const dlg = page.getByRole('dialog', { name: 'Use case StartVehicle' })
  await expect(dlg).toBeVisible()
  const reqs = dlg.locator('.usecase-flow-requirements')
  await expect(reqs).toContainText('«objective»')
  await expect(reqs).toContainText('PowerModes')
  await expect(reqs).toContainText('«refine»')
  await expect(reqs).toContainText('DriveToDestination')

  await reqs.locator('[data-requirement-id="Requirements::DriveToDestination"]').click()
  await expect(dlg).toBeHidden()
  const details = page.getByRole('dialog', { name: /DriveToDestination/ })
  await expect(details).toBeVisible()
  const incoming = details.locator('.relations-list li[data-direction="in"]', {
    hasText: 'StartVehicle',
  })
  await expect(incoming).toContainText('«refine»')

  // And back: the use case at the far end opens the use case dialog again.
  await incoming.locator('[data-related-id="UseCases::Driving::StartVehicle"]').click()
  await expect(page.getByRole('dialog', { name: 'Use case StartVehicle' })).toBeVisible()
})

test('the requirement table names the use cases tracing to each requirement', async ({ page }) => {
  // A table view has no diagram nodes, so wait for the table itself.
  await page.goto(`/?view=${encodeURIComponent('Requirements::RequirementsTableView')}`)
  const table = page.locator('.requirement-table-canvas table')
  await expect(table).toBeVisible({ timeout: 60_000 })
  await expect(table.locator('th', { hasText: 'Use cases' })).toBeVisible()
  const row = table.locator('tr[data-artifact-id="Requirements::DriveToDestination"]')
  await expect(row).toContainText('StartVehicle')
  await expect(row).toContainText('ChangeGear')
})
