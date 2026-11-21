import { expect, test } from '@playwright/test'
import { exampleProjectFile, openProject } from './helpers/diagram'
import {
  dragLifelineOver,
  lifelineOrder,
  lifelineWidth,
  openSequenceView,
  resetSequenceLayout,
  resizeLifeline,
  sequenceLayoutOf,
} from './helpers/sequence'

/**
 * Lifeline layout of a sequence diagram: the order set by dragging and the
 * header widths set by resizing are saved per view and survive a reload, and
 * Redraw forgets both. One legacy view (interaction def) and one occurrence
 * view go through the same code.
 */

const VIEWS = [
  { name: 'legacy interaction', view: 'hbox::HBoxEventView', count: 4 },
  { name: 'occurrence', view: 'OccurrenceSequences::SequenceCView', count: 4 },
]

let projectId = ''

test.beforeEach(async ({ page }) => {
  projectId = await openProject(page, exampleProjectFile('diagrams'))
})

for (const { name, view, count } of VIEWS) {
  test.describe(name, () => {
    test.afterEach(async ({ request }) => {
      await resetSequenceLayout(request, projectId, view)
    })

    test('drag-reorder is saved and survives a reload', async ({ page, request }) => {
      await openSequenceView(page, view, count)
      await expect.poll(async () => (await lifelineOrder(page)).length).toBe(count)
      const before = await lifelineOrder(page)
      expect(before.length).toBeGreaterThanOrEqual(3)
      await dragLifelineOver(page, before[0], before[1])
      const expected = [before[1], before[0], ...before.slice(2)]
      await expect.poll(() => lifelineOrder(page)).toEqual(expected)
      await expect
        .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.order)
        .toEqual(expected)
      await openSequenceView(page, view, count)
      await expect.poll(() => lifelineOrder(page)).toEqual(expected)
    })

    test('width resize is saved and survives a reload', async ({ page, request }) => {
      await openSequenceView(page, view, count)
      const [first, second] = await lifelineOrder(page)
      const before = await lifelineWidth(page, first)
      const secondX = (await page.locator(`.react-flow__node[data-id="${second}"]`).boundingBox())!.x
      await resizeLifeline(page, first, 90)
      await expect.poll(() => lifelineWidth(page, first)).toBeGreaterThan(before + 20)
      const after = await lifelineWidth(page, first)
      // the neighbour is pushed along, not overlapped
      await expect
        .poll(async () => (await page.locator(`.react-flow__node[data-id="${second}"]`).boundingBox())!.x)
        .toBeGreaterThan(secondX)
      await expect
        .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.widths?.[first])
        .toBe(after)
      await openSequenceView(page, view, count)
      await expect.poll(() => lifelineWidth(page, first)).toBe(after)
    })

    test('Redraw resets the order and the widths', async ({ page, request }) => {
      await openSequenceView(page, view, count)
      const before = await lifelineOrder(page)
      const width = await lifelineWidth(page, before[0])
      await dragLifelineOver(page, before[0], before[1])
      await resizeLifeline(page, before[0], 90)
      await expect
        .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.order)
        .toBeTruthy()
      await expect.poll(() => lifelineOrder(page)).not.toEqual(before)

      await page.getByRole('button', { name: 'Redraw: TD' }).click()
      await expect.poll(() => lifelineOrder(page)).toEqual(before)
      await expect.poll(() => lifelineWidth(page, before[0])).toBe(width)
      await expect.poll(() => sequenceLayoutOf(request, projectId, view)).toBeNull()
      await openSequenceView(page, view, count)
      await expect.poll(() => lifelineOrder(page)).toEqual(before)
    })
  })
}
