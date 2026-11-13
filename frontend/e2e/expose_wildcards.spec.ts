import { expect, test } from '@playwright/test'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'

/**
 * `expose PartDefinitions::*;` shows only the function domains, and
 * `expose PartDefinitions::**;` shows every level whatever the diagram
 * levels say. In both the Diagram levels control says the expose decides.
 */

const PD = 'HierarchicalPartsPkg::PartDefinitions'
const node = (id: string) => `.react-flow__node[data-id="${id}"]`

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
})

test('::* shows only the direct members of the package', async ({ page }) => {
  await openView(page, 'HierarchicalPartsPkg::PartDefinitionsMembersView')
  for (const fd of ['FD1', 'FD2', 'FD3']) {
    await expect(page.locator(node(`${PD}::${fd}`))).toHaveCount(1)
  }
  await expect(page.locator(`.react-flow__node[data-id^="${PD}::FD1::"]`)).toHaveCount(0)
  await expect(page.locator(node(PD))).toHaveCount(0)

  const levels = page.locator('.view-hierarchy-control')
  await expect(levels).toContainText("Depth is set by this view's expose")
  for (const input of await levels.locator('input').all()) {
    await expect(input).toBeDisabled()
  }
})

test('::** shows every level, deeper than the global levels', async ({ page }) => {
  await openView(page, 'HierarchicalPartsPkg::PartDefinitionsAllView')
  for (const fd of ['FD1', 'FD2', 'FD3']) {
    await expect(page.locator(node(`${PD}::${fd}`))).toHaveCount(1)
  }
  // The functions are nested inside their domain (the global default is 2).
  for (const f of ['FD1::F1', 'FD1::F2', 'FD1::F3', 'FD3::F9']) {
    await expect(page.locator(node(`${PD}::${f}`))).toHaveCount(1)
  }
  const fd1 = (await page.locator(node(`${PD}::FD1`)).boundingBox())!
  const f1 = (await page.locator(node(`${PD}::FD1::F1`)).boundingBox())!
  expect(f1.x).toBeGreaterThanOrEqual(fd1.x)
  expect(f1.y).toBeGreaterThanOrEqual(fd1.y)
  expect(f1.x + f1.width).toBeLessThanOrEqual(fd1.x + fd1.width + 1)
  expect(f1.y + f1.height).toBeLessThanOrEqual(fd1.y + fd1.height + 1)
})
