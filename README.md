# SysML Viewer

Web service that visualizes SysML v2 textual files and projects. Alpha vertical slice: project CRUD, subset parser (structure + sequence/state/action/tree views), React Flow diagram with movable layout, and JSON persistence.

## Docs

- [Requirements](docs/requirements.md)
- [Use cases](docs/use-cases.md)
- [Architecture](docs/architecture.md)
- [AutoLayout, layout rules and e2e evaluation](docs/autolayout.md)

## Quick start

```bash
./sysmlviewer.sh start                         # prod: UI + API on :5174
./sysmlviewer.sh start --build                 # force rebuild frontend, then start
./sysmlviewer.sh start -f /path/to/folder      # open workspace folder
./sysmlviewer.sh start -p /path/to/project.json
./sysmlviewer.sh start --dev                   # Vite :5173 + API :5174 (HMR)
./sysmlviewer.sh stop
./sysmlviewer.sh status
```

Windows (cmd.exe): `sysmlviewer.bat` with the same subcommands.

Legacy wrapper: `./sysmlviewer` → `sysmlviewer.sh`

UI (prod): http://127.0.0.1:5174/  
API docs: http://127.0.0.1:5174/api/docs  

**Prod vs `--dev`:** Production mode serves the Vite build from `frontend/dist/` (not tracked in git). If `dist` is missing, `start` runs `npm run build` automatically (requires Node/npm once). Use `--build` to force a rebuild when `dist` already exists. Use `--dev` for Vite HMR on `:5173` with the API on `:5174`.

Use **New** / **Open** in the UI to bind a project folder (absolute path). Add `.sysml` files by relative path; the backend reads them from disk (SysML is read-only in the viewer). Persistence roles:

- **`*.sysml`** — source of truth for the model
- **`state.json`** — semantic cache, view metadata list, sheet, global visualization defaults (no per-diagram geometry)
- **`views/*.json`** — one file per view for node/edge layout overlays (auto-saved on drag; **Export JSON** saves a copy via Save As)

Legacy projects with `viewLayouts` inside `state.json` are migrated on open (or run `python scripts/migrate_view_layouts.py <project-folder>`).

Requires Python venv in `backend/.venv` (see Manual below). First prod start (or `--build`) needs Node/npm to produce `frontend/dist/`.

### Manual (optional)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -m cli --host 127.0.0.1 --port 5174 --reload
```

### Frontend (development)

```bash
cd frontend
npm install
npm run dev
```

Rebuild static assets (writes local `frontend/dist/`, gitignored):

```bash
cd frontend && npm run build
# or: ./sysmlviewer.sh start --build
```

### Sample projects

[`examples/diagrams/`](examples/diagrams) - shows different types of sysml diagrams

Electric-car example workspace: [`examples/electric_car/`](examples/electric_car/) (requirements, functions, use cases, logical architecture, sequences, and physical architecture). Interface naming notes: [`docs/interface_naming.md`](docs/interface_naming.md).

### Documentation files

Markdown documentation for an artifact lives in a `docs/` folder next to its SysML file and is named with the package chain as prefix: `<Package>[.<SubPackage>…].<name>.md` (part nesting is not part of the name). Example: `PhysicalArchitecture::VehiclePhysical::infotainmentEcu::entertainmentSw` → `physical_architecture/docs/PhysicalArchitecture.entertainmentSw.md`. The viewer falls back to the flat `docs/<name>.md` when no qualified file exists. Existing projects can be migrated with:

```bash
python scripts/migrate_docs_names.py path/to/project --dry-run   # show the plan
python scripts/migrate_docs_names.py path/to/project --git       # rename with git mv
```

## Alpha features

- Open / create workspace projects (`project.json` at folder root)
- Add & refresh `.sysml` files via backend disk I/O (layout preserved by qualified name)
- Viewer/Editor settings (theme, attribute visibility, hierarchy depth)
- Drawing sheet: optional title block + A4/A3 frame; Print dialog with page packing
- Editor: add/remove parts, ports, attributes; SysML content stays in sync on disk
- Interconnection-style diagram: parts, ports, connections, editable waypoints
- Drag nodes; Option+drag ports/waypoints; change edge routing in details panel
- `>>` menu for sub-diagrams; Views / Files sidebars; text canvas mode
- MongoDB adapter stubbed for later (`MongoProjectRepository`)

## Tests

```bash
cd backend && source .venv/bin/activate && pytest
cd frontend && npm test
```

E2E layout evaluation (Playwright, Chromium; writes screenshots + metrics to
`frontend/e2e/output/`):

```bash
cd frontend && npx playwright install chromium   # once
npm run e2e
```
