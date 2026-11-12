import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

/**
 * Typing a pattern in the view filter must keep every character: each save
 * echoes back while the user is still typing, and that echo used to reset the
 * field to an older value.
 */

const VIEW = 'UseCasesExample::UseCasesStructureView'

async function openFilterDialog(page: Page) {
  const button = page.getByRole('button', { name: 'view-filter' })
  if (!(await button.isVisible().catch(() => false))) {
    await page.locator(`.tree-label[title="${VIEW}"]`).first().click()
  }
  await button.click()
  const dlg = page.getByRole('dialog', { name: 'Filter out artefacts in view' })
  await dlg.waitFor()
  return dlg
}

test('a typed pattern is kept and saved', async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
  await openView(page, VIEW)
  const dlg = await openFilterDialog(page)
  await dlg.getByRole('button', { name: 'Add filter row' }).click()
  await dlg.getByLabel('Artefact kind').last().selectOption('useCase')
  const pattern = dlg.getByLabel('Filter pattern').last()
  await pattern.fill('')
  await pattern.pressSequentially('Login*', { delay: 0 })
  await page.waitForTimeout(1000)
  await expect(pattern).toHaveValue('Login*')
  await dlg.getByLabel('Filter status').last().check()
  await dlg.getByRole('button', { name: 'Close' }).click()
  await expect(
    page.locator('.react-flow__node[data-id="UseCasesExample::Login"]'),
  ).toHaveCount(0)

  await openView(page, VIEW)
  const again = await openFilterDialog(page)
  await expect(again.getByLabel('Filter pattern').last()).toHaveValue('Login*')
  await expect(
    page.locator('.react-flow__node[data-id="UseCasesExample::Login"]'),
  ).toHaveCount(0)
})
