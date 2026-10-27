/**
 * Playwright webServer: build dist (if missing), copy examples/ to a temp
 * workspace so tests never write into the repo, then start the backend in
 * production mode (UI + API on one port).
 */
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = path.resolve(frontend, '..')
const port = process.env.E2E_PORT || '5184'
const dist = path.join(frontend, 'dist')

if (!existsSync(path.join(dist, 'index.html')) || process.env.E2E_BUILD === '1') {
  const build = spawnSync('npm', ['run', 'build'], { cwd: frontend, stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
}

const tmpRoot = path.join(os.tmpdir(), 'sysmlviewer-e2e')
rmSync(tmpRoot, { recursive: true, force: true })
mkdirSync(tmpRoot, { recursive: true })
for (const name of ['electric_car', 'diagrams']) {
  cpSync(path.join(repo, 'examples', name), path.join(tmpRoot, name), {
    recursive: true,
  })
}
const metaDir = path.join(frontend, 'e2e', '.tmp')
mkdirSync(metaDir, { recursive: true })
writeFileSync(
  path.join(metaDir, 'examples.json'),
  JSON.stringify({ root: tmpRoot }, null, 2),
)

const python = path.join(repo, 'backend', '.venv', 'bin', 'python')
const child = spawn(
  python,
  [
    '-m',
    'cli',
    '-p',
    path.join(tmpRoot, 'electric_car', 'project.json'),
    '--host',
    '127.0.0.1',
    '--port',
    port,
  ],
  {
    cwd: path.join(repo, 'backend'),
    env: {
      ...process.env,
      PYTHONPATH: path.join(repo, 'backend', 'src'),
      SYSMLVIEWER_STATIC_DIR: dist,
    },
    stdio: 'inherit',
  },
)

const stop = () => {
  if (!child.killed) child.kill('SIGTERM')
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('exit', stop)
child.on('exit', (code) => process.exit(code ?? 0))
