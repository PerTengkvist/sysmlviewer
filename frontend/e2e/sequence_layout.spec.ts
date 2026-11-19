import { expect, test } from '@playwright/test'
import { exampleProjectFile, openProject, openView } from './helpers/diagram'
import {
  dragLifelineOver,
  lifelineOrder,
  lifelineWidth,
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
  { name: 'legacy interaction', view: 'hbox::HBoxEventView' },
  { name: 'occurrence', view: 'OccurrenceSequences::SequenceCView' },
]

let projectId = ''

test.beforeEach(async ({ page }) => {
  projectId = await openProject(page, exampleProjectFile('diagrams'))
})

for (const { name, view } of VIEWS) {
  test.describe(name, () => {
    test.afterEach(async ({ request }) => {
      await resetSequenceLayout(request, projectId, view)
    })

    test('drag-reorder is saved and survives a reload', async ({ page, request }) => {
      await openView(page, view)
      const before = await lifelineOrder(page)
      expect(before.length).toBeGreaterThanOrEqual(3)
      await dragLifelineOver(page, before[0], before[1])
      const expected = [before[1], before[0], ...before.slice(2)]
      expect(await lifelineOrder(page)).toEqual(expected)
      await expect
        .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.order)
        .toEqual(expected)
      await openView(page, view)
      expect(await lifelineOrder(page)).toEqual(expected)
    })

    test('width resize is saved and survives a reload', async ({ page, request }) => {
      await openView(page, view)
      const [first, second] = await lifelineOrder(page)
      const before = await lifelineWidth(page, first)
      const secondX = (await page.locator(`.react-flow__node[data-id="${second}"]`).boundingBox())!.x
      await resizeLifeline(page, first, 90)
      const after = await lifelineWidth(page, first)
      expect(after).toBeGreaterThan(before + 20)
      // the neighbour is pushed along, not overlapped
      expect(
        (await page.locator(`.react-flow__node[data-id="${second}"]`).boundingBox())!.x,
      ).toBeGreaterThan(secondX)
      await expect
        .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.widths?.[first])
        .toBe(after)
      await openView(page, view)
      expect(await lifelineWidth(page, first)).toBe(after)
    })

    test('Redraw resets the order and the widths', async ({ page, request }) => {
      await openView(page, view)
      const before = await lifelineOrder(page)
      const width = await lifelineWidth(page, before[0])
      await dragLifelineOver(page, before[0], before[1])
      await resizeLifeline(page, before[0], 90)
      await expect
        .poll(async () => (await sequenceLayoutOf(request, projectId, view))?.order)
        .toBeTruthy()
      expect(await lifelineOrder(page)).not.toEqual(before)

      await page.getByRole('button', { name: 'Redraw: TD' }).click()
      await expect.poll(() => lifelineOrder(page)).toEqual(before)
      expect(await lifelineWidth(page, before[0])).toBe(width)
      await expect.poll(() => sequenceLayoutOf(request, projectId, view)).toBeNull()
      await openView(page, view)
      expect(await lifelineOrder(page)).toEqual(before)
    })
  })
}
