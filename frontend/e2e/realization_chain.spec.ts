import { expect, test, type Page } from '@playwright/test'
import { exampleProjectFile, fitView, openProject, openView } from './helpers/diagram'

/**
 * Realization chain (examples/diagrams/use_case_realization.sysml): an AllocationView
 * on a use case or a function draws use case | function | function node | logical
 * part as four columns.
 */

const P = 'UseCaseRealization::'
const START = `${P}UC::Start`
const LOCK = `${P}UC::Lock`
const SEC = `${P}F::Security`
const AUTH = `${SEC}::auth`
const IMMO = `${SEC}::immo`
const VC = `${P}L::vc`
const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`
const edgeSel = (source: string, target: string, kind: string) =>
  `[data-testid="rf__edge-chain::${source}->${target}::${kind}"]`

async function box(page: Page, id: string) {
  const b = await page.locator(nodeSel(id)).boundingBox()
  expect(b, `node ${id} is drawn`).not.toBeNull()
  return b!
}

test.beforeEach(async ({ page }) => {
  await openProject(page, exampleProjectFile('diagrams'))
})

test('StartChain draws four columns with a strictly rising x', async ({ page }) => {
  await openView(page, `${P}StartChain`)
  await fitView(page)
  await expect(page.locator('.diagram-mode-badge')).toContainText('Realization chain')
  const x = [START, SEC, AUTH, VC].map(async (id) => (await box(page, id)).x)
  const [uc, fn, node, part] = await Promise.all(x)
  expect(uc).toBeLessThan(fn)
  expect(fn).toBeLessThan(node)
  expect(node).toBeLessThan(part)
  // Both nodes sit in the same column.
  expect((await box(page, IMMO)).x).toBeCloseTo(node, 0)
  await expect(page.locator('.react-flow__node')).toHaveCount(5)
})

test('StartChain links Start <- Security -> auth -> vc', async ({ page }) => {
  await openView(page, `${P}StartChain`)
  await fitView(page)
  await expect(page.locator(edgeSel(SEC, START, 'refine'))).toHaveCount(1)
  await expect(page.locator(edgeSel(SEC, AUTH, 'owns'))).toHaveCount(1)
  await expect(page.locator(edgeSel(AUTH, VC, 'allocate'))).toHaveCount(1)
  await expect(page.locator('.react-flow__edge')).toHaveCount(5)
  await expect(page.locator('.react-flow__edge-textwrapper', { hasText: '«refine» step' })).toHaveCount(1)
  await expect(page.locator('.react-flow__edge-textwrapper', { hasText: '«allocate»' })).toHaveCount(2)
})

test('SecurityChain shows Lock with a thinner explicit refine edge', async ({ page }) => {
  await openView(page, `${P}SecurityChain`)
  await fitView(page)
  await expect(page.locator(nodeSel(LOCK))).toBeVisible()
  const width = (selector: string) =>
    page
      .locator(`${selector} .react-flow__edge-path`)
      .evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth))
  const explicit = await width(edgeSel(SEC, LOCK, 'refine'))
  const step = await width(edgeSel(SEC, START, 'refine'))
  expect(explicit).toBeLessThan(step)
  await expect(
    page.locator('.react-flow__edge-textwrapper', { hasText: '«refine» explicit' }),
  ).toHaveCount(1)
})

test('a dragged position is saved and survives a reload', async ({ page }) => {
  const pid = await openProject(page, exampleProjectFile('diagrams'))
  const viewId = `${P}StartChain`
  const saved = async () => {
    const res = await page.request.get(`/api/projects/${pid}/views/${encodeURIComponent(viewId)}`)
    const body = (await res.json()) as {
      visualization: { nodes: Record<string, { x?: number; y?: number }> }
    }
    return body.visualization.nodes[AUTH]
  }
  expect((await saved()).y, 'nothing saved before the first drag').toBeUndefined()

  await openView(page, viewId)
  await fitView(page)
  // auth is laid out above immo (model order).
  expect((await box(page, AUTH)).y).toBeLessThan((await box(page, IMMO)).y)
  const before = await box(page, AUTH)
  const from = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + 220, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await saved()).y, { timeout: 10_000 }).toBeDefined()

  await page.reload()
  await page.locator('.react-flow__node').first().waitFor({ timeout: 60_000 })
  await fitView(page)
  // Now below immo: the saved position wins over the layout.
  expect((await box(page, AUTH)).y).toBeGreaterThan((await box(page, IMMO)).y)
})
