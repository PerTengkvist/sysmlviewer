# SysML Viewer — Architecture (Alpha)

## Stack

- **Backend:** FastAPI, hexagonal (domain / ports / adapters)
- **Frontend:** React + Vite + TypeScript + React Flow
- **Persistence:** JSON files under `data/projects/`; MongoDB adapter stubbed

## Hexagonal layout

```
backend/src/
  domain/           # Project, Artifact, Visualization, merge rules
  application/      # Use-case services
  ports/            # ProjectRepository, SysmlParser protocols
  adapters/
    api/            # FastAPI routes
    persistence/    # json_repo, mongo_repo (stub)
    parser/         # subset SysML textual parser
```

## Domain model

### Project

- `id`, `name`, `createdAt`, `updatedAt`
- `files`: list of SysML file records (`id`, `name`, `content`, `warnings`)
- `semantic`: map of artifact id → SemanticElement
- `visualization`: map of artifact id → VisualizationObject (+ edges)
- `views`: list of diagram views (auto-generated per package/part)

### SemanticElement

- `id` — qualified name (`Package::Part::port`)
- `kind` — `package` | `part` | `port` | `connection`
- `name`, `parentId`
- `typeRef` (optional), `sourceId` / `targetId` for connections
- `children` — child artifact ids
- `fileId` — originating file

### VisualizationObject (node)

- `artifactId`
- `x`, `y`, `width`, `height`
- `symbolRef` (default or SVG id)
- For ports: `side`, `offset` (0–1 along edge)

### VisualizationEdge

- `artifactId` (connection)
- `routing` — `angular` | `direct` | `spline`
- `waypoints` — list of `{x, y}` reference points

### Merge rule

`merge_visualization(semantic, existing_viz)`:

1. For each semantic element: if viz exists for `artifactId`, keep geometry; update kind/metadata.
2. Else create default layout.
3. Remove viz entries with no matching semantic element.
4. Same for edges keyed by connection artifact ids.

## Parser subset

Supported textual constructs:

- `package Name { ... }`
- `part def Name { ... }` / `part name : Type;`
- `port name;` / `port name : Type;`
- `connection name connect A.p to B.q;` / `connect A.p to B.q;`

Unknown constructs emit warnings and are skipped when possible.

## API (alpha)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/projects` | Create project |
| GET | `/projects` | List projects |
| GET | `/projects/{id}` | Get project |
| PUT | `/projects/{id}` | Save/update project |
| POST | `/projects/{id}/files` | Upload SysML file |
| POST | `/projects/{id}/files/{fileId}/refresh` | Re-parse file |
| PATCH | `/projects/{id}/visualization` | Update layout |
| GET | `/projects/{id}/views/{viewId}` | Get view payload |

## Frontend layout

- Left sidebar: Views | Files tabs
- Center: canvas (diagram or text)
- Right sidebar: selected artifact details
- Header: project switcher, New / Save
