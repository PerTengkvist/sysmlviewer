# SysML Viewer

Web service that visualizes SysML v2 textual files and projects. Alpha vertical slice: project CRUD, subset parser (structure + sequence/state/action/tree views), React Flow diagram with movable layout, and JSON persistence.

## Docs

- [Requirements](docs/requirements.md)
- [Use cases](docs/use-cases.md)
- [Architecture](docs/architecture.md)

## Quick start

```bash
./sysmlviewer.sh start                         # prod: UI + API on :5174 (uses frontend/dist/)
./sysmlviewer.sh start --build                 # rebuild frontend, then start
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

Use **New** / **Open** in the UI to bind a project folder (absolute path). Add `.sysml` files by relative path; the backend reads them from disk (SysML is read-only in the viewer). Persistence roles:

- **`*.sysml`** — source of truth for the model
- **`state.json`** — semantic cache, view metadata list, sheet, global visualization defaults (no per-diagram geometry)
- **`views/*.json`** — one file per view for node/edge layout overlays (auto-saved on drag; **Export JSON** saves a copy via Save As)

Legacy projects with `viewLayouts` inside `state.json` are migrated on open (or run `python scripts/migrate_view_layouts.py <project-folder>`).

Requires Python venv in `backend/.venv` (see Manual below). Production start uses the pre-built `frontend/dist/` checked into the repo — no Node/npm needed unless you use `--build` or `--dev`.

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

Rebuild static assets (updates `frontend/dist/`):

```bash
cd frontend && npm run build
```

### Sample projects

[`examples/diagrams/`](examples/diagrams) - shows different types of sysml diagrams

Data-center example workspace: [`examples/data_center/`](examples/data_center/) (logical + physical). Interface naming: [`docs/interface_naming.md`](docs/interface_naming.md).

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
