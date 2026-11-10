import { expect, test } from '@playwright/test'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { exampleProjectFile, openProject } from './helpers/diagram'

const FILE = 'view_usages_e2e.sysml'
const MODEL = `package ViewUsageDemo {
  part car {
    part engine;
    part motor;
  }
  interaction drive {
    lifeline driver;
    lifeline vehicle;
    message start from driver to vehicle;
  }
  view def CarViewDef :> GeneralView;
  view carView : CarViewDef { expose ViewUsageDemo::car; }
  view def SeqDef :> SequenceView;
  view seq : SeqDef { expose ViewUsageDemo::drive; }
}
`

type ViewResponse = { diagramMode: string; view: { id: string } }

/** A GET of the view's payload; the id is URL-encoded in the request. */
function viewUrl(url: string, viewId: string): boolean {
  const path = decodeURIComponent(new URL(url).pathname)
  return path.endsWith(`/views/${viewId}`)
}

test.describe('view def and view usages', () => {
  let projectId = ''
  let fileId = ''

  test.beforeAll(async ({ request }) => {
    const projectFile = exampleProjectFile('diagrams')
    writeFileSync(path.join(path.dirname(projectFile), FILE), MODEL)
    const res = await request.post('/api/session/open', { data: { projectFile } })
    projectId = ((await res.json()) as { project: { id: string } }).project.id
    const added = await request.post(`/api/projects/${projectId}/files`, {
      data: { path: FILE },
    })
    expect(added.ok(), await added.text()).toBeTruthy()
    const project = (await added.json()) as { files: { id: string; path: string }[] }
    fileId = project.files.find((f) => f.path.endsWith(FILE))!.id
  })

  test.afterAll(async ({ request }) => {
    await request.delete(`/api/projects/${projectId}/files/item/${fileId}`)
    rmSync(path.join(path.dirname(exampleProjectFile('diagrams')), FILE), { force: true })
  })

  test('the tree shows the definition as an element and opens the usages', async ({
    page,
  }) => {
    await openProject(page, exampleProjectFile('diagrams'))
    await page.goto('/')
    const definition = page.locator('[data-artifact-id="ViewUsageDemo::CarViewDef"]')
    await definition.scrollIntoViewIfNeeded()
    await expect(definition).toHaveClass(/is-other/)
    await expect(definition).toContainText('view def')

    const usage = page.locator('[data-artifact-id="ViewUsageDemo::carView"]')
    await expect(usage).toHaveClass(/is-view/)
    const carResponse = page.waitForResponse((r) => viewUrl(r.url(), 'ViewUsageDemo::carView'))
    await usage.locator('.tree-label').click()
    const car = (await (await carResponse).json()) as ViewResponse
    expect(car.view.id).toBe('ViewUsageDemo::carView')
    await expect(page.locator('.react-flow__node[data-id="ViewUsageDemo::car::engine"]')).toBeVisible()

    const seqResponse = page.waitForResponse((r) => viewUrl(r.url(), 'ViewUsageDemo::seq'))
    await page.locator('[data-artifact-id="ViewUsageDemo::seq"] .tree-label').click()
    const seq = (await (await seqResponse).json()) as ViewResponse
    expect(seq.diagramMode).toBe('sequence')
    await expect(page.locator('.react-flow__node').first()).toBeVisible()
  })
})
