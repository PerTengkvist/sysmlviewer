import { expect, test, type Locator, type Page } from '@playwright/test'
import { exampleProjectFile, openLayoutRules, openProject, openView } from './helpers/diagram'

/**
 * Layout Rules: one tab per scope (+ to add, × to remove). A scope targets the
 * whole diagram, a package or a part with children, and its own rules only
 * arrange that target's direct children.
 */

const VIEW = 'HierarchicalPartsPkg::HierarchicalPartsView'
const PKG = 'HierarchicalPartsPkg::PartDefinitions'
const FD1 = `${PKG}::FD1`

async function setup(
  page: Page,
  layoutScopes?: unknown[],
  nodes?: Record<string, Record<string, number>>,
): Promise<void> {
  const projectId = await openProject(page, exampleProjectFile('diagrams'))
  // Deep enough to draw the F parts inside the FD parts.
  const res = await page.request.patch(`/api/projects/${projectId}/visualization`, {
    data: {
      viewId: VIEW,
      structureNotation: 'sysmlv2',
      hierarchicalLevelsOverride: 3,
      layoutScopes: layoutScopes ?? [],
      ...(nodes ? { nodes } : {}),
    },
  })
  expect(res.ok()).toBeTruthy()
  await openView(page, VIEW)
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'LayoutWizard' })
const tabs = (dlg: Locator) => dlg.getByRole('tab')

async function centerY(page: Page, id: string): Promise<number> {
  const b = (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!
  return b.y + b.height / 2
}

test('a scope is added as a tab and removed with ×', async ({ page }) => {
  await setup(page)
  await openLayoutRules(page)
  const dlg = dialog(page)
  await expect(dlg.getByText('No scopes yet')).toBeVisible()

  await dlg.getByTestId('lw-scope-add').click()
  const target = dlg.getByTestId('lw-scope-target')
  const options = await target.locator('option').allTextContents()
  expect(options).toEqual(
    expect.arrayContaining(['Whole diagram', 'Part FD1', 'Part FD2', 'Part FD3']),
  )
  await target.selectOption(FD1)
  await expect(tabs(dlg)).toHaveText(['Part FD1'])
  await expect(tabs(dlg).first()).toHaveAttribute('aria-selected', 'true')

  // Editing a rule saves, and the tab stays selected after the save echoes.
  await dlg.getByTestId('lw-add-row').click()
  await page.waitForTimeout(500)
  await expect(tabs(dlg).first()).toHaveAttribute('aria-selected', 'true')
  await expect(dlg.getByTestId('lw-row')).toHaveCount(1)

  // A second scope, then remove the first one.
  await dlg.getByTestId('lw-scope-add').click()
  await dlg.getByTestId('lw-scope-target').selectOption('*')
  await expect(tabs(dlg)).toHaveText(['Part FD1', 'Whole diagram'])
  await dlg.getByRole('button', { name: 'Remove scope Part FD1' }).click()
  await expect(tabs(dlg)).toHaveText(['Whole diagram'])
  await dlg.getByRole('button', { name: 'Close' }).click()

  await openView(page, VIEW)
  await openLayoutRules(page)
  await expect(tabs(dialog(page))).toHaveText(['Whole diagram'])
})

test('a scope arranges only its own children, and only when enabled', async ({ page }) => {
  // FD1: F1 below F3. FD2 has a rule that matches nothing in FD1's scope.
  await setup(page, [
    {
      id: 'fd1',
      target: { kind: 'element', id: FD1 },
      enabled: false,
      layering: { enabled: false, direction: 'top-down', layers: [] },
      rules: [
        { id: 'r1', kind: 'part', namePattern: 'F1', placement: 'below', peerKind: 'part', peerNamePattern: 'F3' },
      ],
    },
    {
      id: 'fd2',
      target: { kind: 'element', id: `${PKG}::FD2` },
      enabled: true,
      layering: { enabled: false, direction: 'top-down', layers: [] },
      rules: [
        // Same names as FD1's children: must not reach them.
        { id: 'r2', kind: 'part', namePattern: 'F3', placement: 'below', peerKind: 'part', peerNamePattern: 'F1' },
      ],
    },
  ], {
    // Room inside FD1, with its children side by side.
    [FD1]: { width: 900, height: 420 },
    [`${FD1}::F1`]: { x: 30, y: 60 },
    [`${FD1}::F2`]: { x: 320, y: 60 },
    [`${FD1}::F3`]: { x: 610, y: 60 },
  })
  const f1 = `${FD1}::F1`
  const f3 = `${FD1}::F3`
  const before = { f1: await centerY(page, f1), f3: await centerY(page, f3) }

  // FD1's scope is off: Apply leaves its children where they are.
  await openLayoutRules(page)
  await expect(dialog(page).getByTestId('lw-scope-enabled')).not.toBeChecked()
  await dialog(page).getByTestId('lw-apply').click()
  await page.waitForTimeout(800)
  expect(Math.abs((await centerY(page, f1)) - before.f1)).toBeLessThan(1)
  expect(Math.abs((await centerY(page, f3)) - before.f3)).toBeLessThan(1)

  // Turn it on: F1 ends up below F3.
  await openLayoutRules(page)
  await dialog(page).getByTestId('lw-scope-enabled').check()
  await dialog(page).getByTestId('lw-apply').click()
  await page.waitForTimeout(800)
  expect(await centerY(page, f1)).toBeGreaterThan(await centerY(page, f3))
})
