import { expect, test } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Use case realization in Details (examples/diagrams/use_case_realization.sysml):
 * "Realized by" on a use case, "Realizes" on a function node, "Not realized"
 * on a system step, and the typed far end of a Relations row.
 */

const P = 'UseCaseRealization::'
const START = `${P}UC::Start`
const LOCK = `${P}UC::Lock`
const SEC = `${P}F::Security`
const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
  await openView(page, `${P}UseCaseRealizationView`)
  await fitView(page)
})

test('a use case lists its function, function nodes and logical parts', async ({ page }) => {
  await page.locator(nodeSel(START)).click()
  const section = page.locator('.details-panel .realization-section[data-realization="realized-by"]')
  await expect(section).toBeVisible()
  const security = section.locator(`> ul > li`).filter({ has: page.locator(`[data-related-id="${SEC}"]`) })
  await expect(security.locator('> .link-button')).toContainText('part def Security')
  await expect(security.locator('> .realization-precision')).toHaveText('step')
  const auth = security.locator(`li[data-node-id="${SEC}::auth"]`)
  const immo = security.locator(`li[data-node-id="${SEC}::immo"]`)
  await expect(auth.locator(`[data-related-id="${P}L::vc"]`)).toBeVisible()
  await expect(immo.locator(`[data-related-id="${P}L::vc"]`)).toBeVisible()
  await expect(auth.locator('.relation-element-type').first()).toHaveText('part')
})

test('a Relations row names the type of the far end', async ({ page }) => {
  await page.locator(nodeSel(LOCK)).click()
  const row = page.locator('.details-panel .relations-list li[data-direction="in"]', {
    hasText: 'Security',
  })
  await expect(row).toContainText('«refine»')
  await expect(row).toContainText('part def Security')
  await expect(row.locator('.relation-element-type')).toHaveText('part def')
})

test('a function node lists the use cases it realizes', async ({ page }) => {
  await page.locator(nodeSel(START)).click()
  await page
    .locator(`.details-panel .realization-section[data-realization="realized-by"] [data-related-id="${SEC}::immo"]`)
    .click()
  const dlg = page.getByRole('dialog', { name: /immo/ })
  await expect(dlg).toBeVisible()
  const realizes = dlg.locator('.realization-section[data-realization="realizes"]')
  await expect(realizes).toContainText('Start')
  await expect(realizes.locator('li[data-use-case-id="' + START + '"] .realization-precision')).toHaveText('step')
})

test('a system step no function step realizes is marked Not realized', async ({ page }) => {
  await page.locator(nodeSel(START)).dblclick()
  const flow = page.getByRole('dialog', { name: /Use case .*Start/ })
  await expect(flow).toBeVisible()
  await flow.locator(nodeSel(`${START}::askForBrake`)).click()
  const dlg = page.getByRole('dialog', { name: /askForBrake/ })
  await expect(dlg).toBeVisible()
  await expect(dlg.locator('.realization-unrealized')).toHaveText('Not realized')
  await expect(dlg.locator('.realization-finding')).toContainText('askForBrake')
})
