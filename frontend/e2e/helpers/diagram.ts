import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path to `<example>/project.json` inside the temp workspace. */
export function exampleProjectFile(example: 'electric_car' | 'diagrams'): string {
  const meta = JSON.parse(
    readFileSync(path.join(here, '..', '.tmp', 'examples.json'), 'utf8'),
  ) as { root: string }
  return path.join(meta.root, example, 'project.json')
}

export async function openProject(page: Page, projectFile: string): Promise<string> {
  const res = await page.request.post('/api/session/open', {
    data: { projectFile },
  })
  expect(res.ok(), `session/open failed: ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { project?: { id: string } }
  expect(body.project?.id).toBeTruthy()
  return body.project!.id
}

export async function openView(page: Page, viewId: string): Promise<void> {
  await page.goto(`/?view=${encodeURIComponent(viewId)}`)
  await page.locator('.react-flow__node').first().waitFor({ timeout: 60_000 })
  await page.waitForTimeout(600)
}

export type AutoLayoutChoice =
  | {
      mode: 'simple'
      algorithm: 'stress' | 'layered' | 'clustered' | 'favour-grid'
      portPlacement?: 'inputsLeftOutputsRight' | 'optimized'
      spacing?: 'compact' | 'normal' | 'spacious'
    }
  | {
      mode: 'advanced'
      pipeline: string
      portPlacement?: 'inputsLeftOutputsRight' | 'optimized'
      spacing?: 'compact' | 'normal' | 'spacious'
      /** Hierarchic options (data-testid → value), applied when visible. */
      hierarchic?: Record<string, string | boolean>
    }

export async function runAutoLayout(
  page: Page,
  choice: AutoLayoutChoice,
): Promise<void> {
  await page.getByRole('button', { name: /Open AutoLayout directives/ }).click()
  const dlg = page.getByRole('dialog', { name: 'AutoLayout directives' })
  await dlg.waitFor()
  await dlg.getByTestId('al-mode').selectOption(choice.mode)
  if (choice.portPlacement) {
    await dlg.getByTestId('al-port-placement').selectOption(choice.portPlacement)
  }
  if (choice.mode === 'simple') {
    await dlg.getByTestId('al-algorithm').selectOption(choice.algorithm)
  } else {
    await dlg.getByTestId('al-pipeline').selectOption(choice.pipeline)
    for (const [testId, value] of Object.entries(choice.hierarchic || {})) {
      const ctl = dlg.getByTestId(testId)
      if (typeof value === 'boolean') await ctl.setChecked(value)
      else await ctl.fill(String(value)).catch(() => ctl.selectOption(String(value)))
    }
  }
  if (choice.spacing) {
    await dlg.getByTestId('al-spacing').selectOption(choice.spacing)
  }
  await dlg.getByTestId('al-run').click()
  await dlg.waitFor({ state: 'detached', timeout: 150_000 })
  await page.waitForTimeout(800)
}

export async function fitView(page: Page): Promise<void> {
  const btn = page.locator('.react-flow__controls-fitview')
  if (await btn.count()) {
    await btn.first().click()
    await page.waitForTimeout(500)
    await btn.first().click()
    await page.waitForTimeout(300)
  }
}

/** Open the Layout Rules dialog (structure views only). */
export async function openLayoutRules(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Layout Rules' }).click()
  await page.getByRole('dialog', { name: 'LayoutWizard' }).waitFor()
}
