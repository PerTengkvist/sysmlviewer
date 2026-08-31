# Persistence adapters

## WorkspaceProjectRepository (default)

One open workspace folder. The project file lives at the **folder root**:

```
{workspace}/
  project.json     # id, projektnamn, created, updated, sysmlfiles
  state.json       # files metadata, semantic, visualization, views, sheet
  views/*.json     # per-view node/edge geometry overlays
  **/*.sysml       # source files (paths listed in project.json sysmlfiles)
```

Open / create via:

- CLI: `./sysmlviewer start -f /path/to/folder` or `-p /path/to/project.json`
- API: `POST /session/create` `{ name, folder }`, `POST /session/open` `{ folder }` or `{ projectFile }`

Without `-f`/`-p` the session starts empty (no catalog under `data/projects`).

SysML on disk is read-only for the viewer. Sheet and semantic cache live in `state.json`. Per-view layout lives under `views/`.

`state.json` → `visualization`: global style, port anchors, and edge routing keyed by artifact id.

`views/<name>.json` (schemaVersion 1): per-view node/edge geometry overlays:

```json
{
  "schemaVersion": 1,
  "viewId": "Package::TreeView",
  "name": "TreeView",
  "nodes": {
    "Package::Part": { "x": 40, "y": 40, "width": 160, "height": 40 }
  },
  "edges": {}
}
```

Legacy `state.json` → `viewLayouts` is migrated into `views/*.json` on load (or via `scripts/migrate_view_layouts.py`).

`get_view` merges overlay geometry into the view payload. Tree views without an overlay use compact defaults (`DEFAULT_TREE_WIDTH`/`HEIGHT`). GeneralView/whitebox uses global (or that view’s overlay) sizes.

`state.json` also caches `semantic` for the last successful load. On every project open/`GET`, the backend re-parses SysML from disk and updates that cache when the model changed (so external edits while the server was stopped are visible without a manual per-file refresh).

### Sheet (drawing frame + title block)

`state.json` → `sheet`:

```json
{
  "titleBlock": null,
  "frame": null
}
```

When created:

- `titleBlock`: title, createdBy, editedBy, version, lastUpdated, drawingId, position
- `frame`: paper (`A4`|`A3`), orientation (`landscape`|`portrait`), visible

## JsonFileProjectRepository (legacy)

Older multi-project UUID layout under `data/projects/{id}/` is superseded by the workspace repo. Kept in the tree only if needed for migration references.

## MongoProjectRepository (stub)

Located in [`backend/src/adapters/persistence/mongo_repo.py`](../backend/src/adapters/persistence/mongo_repo.py).
