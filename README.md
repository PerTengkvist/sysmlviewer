# SysML Viewer

Web service that visualizes SysML v2 textual files and projects. Alpha vertical slice: project CRUD, subset parser (`package` / `part` / `port` / `connection`), React Flow diagram with movable layout, and JSON persistence.

## Docs

- [Requirements](docs/requirements.md)
- [Use cases](docs/use-cases.md)
- [Architecture](docs/architecture.md)

## Quick start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn main:app --app-dir src --reload --port 8000
```

API docs: http://127.0.0.1:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

UI: http://127.0.0.1:5173 (proxies `/api` → backend)

### Sample file

[`examples/vehicle.sysml`](examples/vehicle.sysml) — drop into the Files tab after creating a project.

## Alpha features

- Create / switch / save / load / delete projects (JSON under `data/projects/`)
- Upload, refresh & export `.sysml` files (layout preserved by qualified name)
- Viewer/Editor settings (theme, attribute visibility, hierarchy depth)
- Editor: add/remove parts, ports, attributes; SysML content stays in sync
- Interconnection-style diagram: parts, ports, connections, editable waypoints
- Drag nodes; Option+drag ports/waypoints; change edge routing in details panel
- `>>` menu for sub-diagrams; Views / Files sidebars; text canvas mode
- MongoDB adapter stubbed for later (`MongoProjectRepository`)

## Tests

```bash
cd backend && source .venv/bin/activate && pytest
cd frontend && npm test
```
