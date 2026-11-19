import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

export const nodeSel = (id: string) => `.react-flow__node[data-id="${id}"]`

/** Lifeline node ids from left to right, as drawn. */
export async function lifelineOrder(page: Page): Promise<string[]> {
  // The count settles once the view has been built from the payload.
  const nodes = page.locator('.react-flow__node-lifeline')
  const boxes: { id: string; x: number }[] = []
  for (let i = 0; i < (await nodes.count()); i++) {
    const node = nodes.nth(i)
    const box = (await node.boundingBox())!
    boxes.push({ id: (await node.getAttribute('data-id'))!, x: box.x })
  }
  return boxes.sort((a, b) => a.x - b.x).map((b) => b.id)
}

/** Width in flow units, as set on the node (not scaled by the zoom). */
export async function lifelineWidth(page: Page, id: string): Promise<number> {
  return page.locator(nodeSel(id)).evaluate((el) => parseFloat((el as HTMLElement).style.width))
}

export async function sequenceLayoutOf(
  request: APIRequestContext,
  projectId: string,
  viewId: string,
): Promise<{ order?: string[]; widths?: Record<string, number> } | null> {
  const res = await request.get(`/api/projects/${projectId}/views/${encodeURIComponent(viewId)}`)
  expect(res.ok()).toBeTruthy()
  return ((await res.json()) as { sequenceLayout: { order?: string[] } | null }).sequenceLayout
}

/** Forget a saved lifeline order and widths, so a test leaves the view as it was. */
export async function resetSequenceLayout(
  request: APIRequestContext,
  projectId: string,
  viewId: string,
): Promise<void> {
  const res = await request.patch(`/api/projects/${projectId}/visualization`, {
    data: { viewId, structureNotation: 'sysmlv2', sequenceLayout: null },
  })
  expect(res.ok(), await res.text()).toBeTruthy()
}

/** Drag a lifeline by its header until its centre is past `target`'s centre. */
export async function dragLifelineOver(page: Page, id: string, target: string): Promise<void> {
  const from = (await page.locator(`${nodeSel(id)} .lifeline-header`).boundingBox())!
  const to = (await page.locator(`${nodeSel(target)} .lifeline-header`).boundingBox())!
  const y = from.y + from.height / 2
  await page.mouse.move(from.x + from.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, y, { steps: 4 })
  await page.mouse.move(to.x + to.width / 2 + 40, y, { steps: 12 })
  await page.mouse.up()
  // Callers poll for the result (`expect.poll(() => lifelineOrder(page))`).
}

/** Select the lifeline and drag its right-hand width handle by `dx` screen pixels. */
export async function resizeLifeline(page: Page, id: string, dx: number): Promise<void> {
  await page.locator(`${nodeSel(id)} .lifeline-header`).click()
  await expect(page.locator(nodeSel(id))).toHaveClass(/selected/)
  const handle: Locator = page.locator(`${nodeSel(id)} .lifeline-resize-handle`)
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y, { steps: 4 })
  await page.mouse.move(x + dx, y, { steps: 8 })
  await page.mouse.up()
}

/** Open a sequence view and wait until its lifelines are on screen and have stopped moving. */
export async function openSequenceView(page: Page, viewId: string, lifelines: number): Promise<void> {
  await page.goto(`/?view=${encodeURIComponent(viewId)}`)
  await expect(page.locator('.react-flow__node-lifeline')).toHaveCount(lifelines, { timeout: 60_000 })
  let previous = ''
  await expect
    .poll(async () => {
      const now = JSON.stringify(await lifelineOrder(page)) + (await lifelineXs(page))
      const settled = now === previous
      previous = now
      return settled
    })
    .toBe(true)
}

async function lifelineXs(page: Page): Promise<string> {
  return page
    .locator('.react-flow__node-lifeline')
    .evaluateAll((els) => els.map((e) => (e as HTMLElement).style.transform).join('|'))
}
