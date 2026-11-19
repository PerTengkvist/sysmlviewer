import { expect, test } from '@playwright/test'
import { exampleProjectFile, openProject } from './helpers/diagram'

/**
 * The committed FMEA/FMECA reports in examples/electric_car/fmea/docs/ show up in the
 * Files tab and render with mermaid in the markdown canvas, with no viewer code involved.
 */

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('electric_car'))
  await page.goto('/')
  // Let the project and its documentation list load before switching tab.
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.left-sidebar .tree-row').first()).toBeVisible({ timeout: 60_000 })
  await page.locator('.left-sidebar .tab-bar button', { hasText: 'Files' }).click()
  // The documentation list is fetched once the project has loaded.
  await expect(page.locator('.left-sidebar .tree-row.is-doc').first()).toBeVisible({ timeout: 60_000 })
})

for (const [file, title] of [
  ['fmea-report.md', 'FMEA report: Electric Car'],
  ['fmeca-report.md', 'FMECA report: Electric Car'],
] as const) {
  test(`${file} opens from the Files tab and renders its mermaid`, async ({ page }) => {
    const doc = page.locator(`.left-sidebar button[title="fmea/docs/${file}"]`)
    // Folders may start collapsed: expand every collapsed one on the way down.
    for (let i = 0; i < 4 && !(await doc.isVisible()); i++) {
      const collapsed = page.locator('.left-sidebar .tree-expand-btn[aria-expanded="false"]')
      if ((await collapsed.count()) === 0) break
      await collapsed.first().click()
    }
    await doc.click()
    const canvas = page.locator('.markdown-canvas')
    await expect(canvas).toContainText(title, { timeout: 30_000 })
    await expect(canvas.locator('.mermaid-diagram svg').first()).toBeVisible({ timeout: 60_000 })
    await expect(canvas.locator('.mermaid-diagram-error')).toHaveCount(0)
    await expect(canvas.locator('.mermaid-diagram-loading')).toHaveCount(0)
  })
}
