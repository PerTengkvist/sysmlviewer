import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, openProject } from './helpers/diagram'

/**
 * The traceability matrix (examples/diagrams/use_case_realization.sysml): a GridView
 * that exposes use cases. `●` derived link, `○` only an explicit #refine.
 */

const P = 'UseCaseRealization::'
const VIEW = `${P}RealizationMatrix`
const START = `${P}UC::Start`
const LOCK = `${P}UC::Lock`
const SEC = `${P}F::Security`
const grid = (page: Page) => page.getByRole('grid')
const row = (page: Page, id: string) => grid(page).locator(`tr[data-row-id="${id}"]`)
const cell = (page: Page, rowId: string, columnId: string) =>
  row(page, rowId).locator(`td[data-column-id="${columnId}"]`)

async function openMatrix(page: Page) {
  // A matrix has no diagram nodes, so wait for the grid itself.
  await page.goto(`/?view=${encodeURIComponent(VIEW)}`)
  await expect(grid(page)).toBeVisible({ timeout: 60_000 })
}

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
  // Start from the defaults, whatever an earlier run saved.
  await page.request.patch('/api/projects/' + (await projectId(page)) + '/visualization', {
    data: { viewId: VIEW, realizationMatrix: null, structureNotation: 'sysmlv2' },
  })
  await openMatrix(page)
})

async function projectId(page: Page): Promise<string> {
  const res = await page.request.get('/api/session')
  return ((await res.json()) as { project: { id: string } }).project.id
}

test('a derived link is a filled dot, a bare explicit link a ring', async ({ page }) => {
  await expect(cell(page, START, `${SEC}::auth`)).toHaveText('●')
  await expect(cell(page, START, `${SEC}::locks`)).toHaveText('')
  for (const node of ['auth', 'immo', 'locks']) {
    await expect(cell(page, LOCK, `${SEC}::${node}`)).toHaveText('○')
  }
  await expect(grid(page).locator('th.realization-group')).toHaveText('Security')
})

test('coverage flags the use case with an unrealized system step', async ({ page }) => {
  const coverage = row(page, START).locator('td.realization-coverage')
  await expect(coverage).toHaveText('2/3 ✗')
  await expect(coverage).toHaveClass(/realization-gap/)
  await expect(row(page, LOCK).locator('td.realization-coverage')).toHaveText('0/1')
})

test('the step rows show the unrealized step', async ({ page }) => {
  await page.getByRole('button', { name: 'Steps', exact: true }).click()
  const step = row(page, `${START}::askForBrake`)
  await expect(step).toBeVisible()
  await expect(step.locator('td.realization-coverage')).toHaveText('✗')
  await expect(cell(page, `${START}::checkKey`, `${SEC}::auth`)).toHaveText('●')
  await expect(cell(page, `${START}::checkKey`, `${SEC}::immo`)).toHaveText('')
})

test('the parts columns list the logical parts', async ({ page }) => {
  await page.getByRole('button', { name: 'Logical parts', exact: true }).click()
  const heads = grid(page).locator('th.realization-column-head')
  await expect(heads).toHaveText(['vc', 'bc'])
  await expect(cell(page, START, `${P}L::vc`)).toHaveText('●')
  await expect(cell(page, START, `${P}L::bc`)).toHaveText('')
})

test('the choice of rows and columns survives a reload', async ({ page }) => {
  await page.getByRole('button', { name: 'Steps', exact: true }).click()
  await page.getByRole('button', { name: 'Logical parts', exact: true }).click()
  await expect(row(page, `${START}::askForBrake`)).toBeVisible()
  // Wait for the save before reloading.
  await expect
    .poll(async () => {
      const res = await page.request.get(
        `/api/projects/${await projectId(page)}/views/${encodeURIComponent(VIEW)}`,
      )
      return ((await res.json()) as { realizationMatrix: unknown }).realizationMatrix
    })
    .toEqual({ rows: 'steps', columns: 'parts' })
  await openMatrix(page)
  await expect(row(page, `${START}::askForBrake`)).toBeVisible()
  await expect(grid(page).locator('th.realization-column-head')).toHaveText(['vc', 'bc'])
  await expect(page.getByRole('button', { name: 'Steps', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a click on a header or a cell selects it in Details', async ({ page }) => {
  await grid(page).locator('th[data-column-id="' + SEC + '::immo"]').click()
  await expect(page.locator('.details-panel')).toContainText('immo')
  await cell(page, START, `${SEC}::auth`).click()
  // The cell selects the #refine behind it: its source is the realizing function step.
  const details = page.locator('.details-panel')
  await expect(details).toContainText('dependency')
  await expect(details).toContainText(`${SEC}::startFlow::checkKeyInCabin`)
  await expect(details).toContainText(`${START}::checkKey`)
})

test('the export button downloads the same cells as CSV', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('RealizationMatrix-matrix.csv')
  const stream = await download.createReadStream()
  let text = ''
  for await (const chunk of stream) text += chunk
  const lines = text.split('\n')
  expect(lines[0]).toBe('Use case,Coverage,Security: auth,Security: immo,Security: locks')
  expect(lines[1]).toBe('UCA Start,2/3 ✗,●,●,')
})
