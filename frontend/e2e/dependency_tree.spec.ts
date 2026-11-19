import { expect, test, type Locator, type Page } from '@playwright/test'
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
  const directRow = (id: string) =>
    down.locator(':scope > li > .dependency-tree-row', {
      has: page.locator(`[data-related-id="${id}"]`),
    })
  // Only the brake pedal satisfies it directly; the drive controller and the
  // friction brakes are reached through Brake and SpeedControl instead.
  await expect(directRow('LogicalArchitecture::Car::brakePedal')).toContainText('«satisfy»')
  for (const part of ['frictionBrakes', 'driveController']) {
    await expect(directRow(`LogicalArchitecture::Car::${part}`)).toHaveCount(0)
  }
  const brake = down.locator(':scope > li > .dependency-tree-row', {
    has: page.locator(`[data-related-id="${BRAKE}"]`),
  })
  await expect(brake).toContainText('«objective»')

  // Below Brake: the functions and the functional entities that refine it,
  // and the logical parts those entities are allocated to.
  /** Row of the child `id` directly below `parent` (an `li`); `..` is its `li`. */
  const childRow = (parent: Locator, id: string) =>
    parent.locator(':scope > .dependency-tree-children > li > .dependency-tree-row', {
      has: page.locator(`[data-related-id="${id}"]`),
    })
  const brakeItem = brake.locator('xpath=..')
  await expect(childRow(brakeItem, 'Functions::SpeedControl')).toContainText('«refine»')
  await expect(childRow(brakeItem, 'Functions::Lighting')).toContainText('«refine»')
  const friction = childRow(brakeItem, 'Functions::SpeedControl::frictionBraking')
  await expect(friction).toContainText('«refine»')
  await expect(
    childRow(friction.locator('xpath=..'), 'LogicalArchitecture::Car::frictionBrakes'),
  ).toContainText('«allocate»')
  await expect(childRow(brakeItem, 'Functions::Lighting::indicatorControl')).toContainText(
    '«refine»',
  )
  // Connections are not part of the tree.
  await expect(dlg).not.toContainText('«connection»')
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
  const ucDialog = page.getByRole('dialog', { name: 'Use case UC006 Brake' })
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

test('a satisfying part climbs to its requirement, not along #Command', async ({ page }) => {
  const dlg = await openRequirementTree(page)
  await dlg
    .locator('.dependency-tree-down [data-related-id="LogicalArchitecture::Car::brakePedal"]')
    .first()
    .click()
  const details = page.getByRole('dialog', { name: 'part brakePedal' })
  await expect(details).toBeVisible()
  // The button also sits in the double-click dialog's Details heading.
  await details.getByRole('button', { name: 'dependency tree' }).click()
  await expect(details).toBeHidden()

  const tree = page.getByRole('dialog', { name: 'Dependency tree brakePedal' })
  await expect(tree).toBeVisible()
  const up = tree.locator('.dependency-tree-up [data-related-id]')
  await expect(up).toHaveCount(2)
  await expect(up.nth(0)).toHaveAttribute('data-related-id', 'Requirements::Safety')
  await expect(up.nth(1)).toHaveAttribute('data-related-id', REQ)
  await expect(tree.locator('.dependency-tree-up')).toContainText('«satisfy»')
  await expect(tree).not.toContainText('«connection»')
})

test('a logical part climbs through its allocated entity to the use case it serves', async ({
  page,
}) => {
  const dlg = await openRequirementTree(page)
  await dlg
    .locator('.dependency-tree-down [data-related-id="LogicalArchitecture::Car::driveController"]')
    .first()
    .click()
  const details = page.getByRole('dialog', { name: 'part driveController' })
  await expect(details).toBeVisible()
  await details.getByRole('button', { name: 'dependency tree' }).click()
  await expect(details).toBeHidden()

  const tree = page.getByRole('dialog', { name: 'Dependency tree driveController' })
  await expect(tree).toBeVisible()
  // Top first: requirement group, objective, the use case the entity
  // refines, and the entity allocated to the part.
  const up = tree.locator('.dependency-tree-up [data-related-id]')
  await expect(up).toHaveCount(4)
  const ids = [
    'Requirements::Performance',
    'Requirements::Acceleration',
    'UseCases::Driving::Accelerate',
    'Functions::SpeedControl::torqueArbitration',
  ]
  for (const [i, id] of ids.entries()) {
    await expect(up.nth(i)).toHaveAttribute('data-related-id', id)
  }
  const chain = tree.locator('.dependency-tree-up')
  for (const label of ['«allocate»', '«refine»', '«objective»']) {
    await expect(chain).toContainText(label)
  }
  // Not the owner Car, not along #Command.
  await expect(chain.locator('[data-related-id="LogicalArchitecture::Car"]')).toHaveCount(0)
  await expect(chain).not.toContainText('«Command»')
})
