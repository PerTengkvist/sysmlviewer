# SysML Viewer

Web service that visualizes SysML v2 textual files and projects. Alpha vertical slice: project CRUD, subset parser (structure + sequence/state/action/tree views), React Flow diagram with movable layout, and JSON persistence.

## Docs

- [Requirements](docs/requirements.md)
- [Use cases](docs/use-cases.md)
- [Architecture](docs/architecture.md)

## Quick start

```bash
./sysmlviewer start                         # empty session
./sysmlviewer start -f /path/to/folder      # open workspace folder
./sysmlviewer start -p /path/to/project.json
./sysmlviewer stop
./sysmlviewer status
```

UI: http://127.0.0.1:5173 (proxies `/api` → backend :5174)  
API docs: http://127.0.0.1:5174/docs  

Use **New** / **Open** in the UI to bind a project folder (absolute path). Add `.sysml` files by relative path; the backend reads/writes disk. Layout and sheet metadata live in `state.json` next to `project.json`.

### Manual (optional)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn main:app --app-dir src --reload --port 5174
```

### Frontend

```bash
cd frontend
npm install
npm run dev
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
