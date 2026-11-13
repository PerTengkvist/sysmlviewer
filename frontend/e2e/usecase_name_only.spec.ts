import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, openProject, openView, runAutoLayout } from './helpers/diagram'

/**
 * A general view draws a use case as an ellipse with only its name: no
 * actors, subject or parts inside it, and the same size as in a use case
 * view (168 × 72), also after AutoLayout.
 */

const VIEW = 'UseCasesExample::UseCasesStructureView'
const USE_CASES = [
  'UseCasesExample::Login',
  'UseCasesExample::Drive',
  'UseCasesExample::EmergencyStop',
]

async function useCaseSizes(page: Page) {
  return page.locator('.react-flow__node-useCase').evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-id'),
      width: (el as HTMLElement).style.width,
      height: (el as HTMLElement).style.height,
    })),
  )
}

async function expectNameOnly(page: Page) {
  const sizes = await useCaseSizes(page)
  expect(sizes.map((s) => s.id)).toEqual(expect.arrayContaining(USE_CASES))
  for (const { id } of sizes) {
    // Nothing owned by the use case is drawn.
    await expect(page.locator(`.react-flow__node[data-id^="${id}::"]`)).toHaveCount(0)
  }
  for (const s of sizes) {
    expect(s, `${s.id}`).toMatchObject({ width: '168px', height: '72px' })
  }
}

test.beforeEach(async ({ page }) => {
  const projectId = await openProject(page, exampleProjectFile('diagrams'))
  // Deep enough that the actors and the subject would be nested before.
  const res = await page.request.patch(`/api/projects/${projectId}/visualization`, {
    data: { viewId: VIEW, hierarchicalLevelsOverride: 4 },
  })
  expect(res.ok()).toBeTruthy()
})

test('a use case shows only its name, at the use case view size', async ({ page }) => {
  await openView(page, VIEW)
  await expectNameOnly(page)
})

test('AutoLayout keeps use cases name-only and small', async ({ page }) => {
  await openView(page, VIEW)
  await runAutoLayout(page, { mode: 'simple', algorithm: 'favour-grid' })
  await expectNameOnly(page)
})
