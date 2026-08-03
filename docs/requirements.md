# SysML Viewer — Requirements (Alpha)

## Vision

A web service that visualizes SysMLv2 files and projects, with a separate *semantic* model (from code) and *visualization* model (position, size, routing) keyed by artifact identity so that re-parsing updates content without destroying layout.

## Functional requirements

| ID | Requirement |
|----|-------------|
| FR-01 | User can create a named project |
| FR-02 | User can list and switch the active project |
| FR-03 | User can save a project (model + visualization + file references) |
| FR-04 | User can load a saved project |
| FR-05 | User can add `.sysml` files via drop/upload in the Files tab |
| FR-06 | Added files are parsed automatically; visualization objects are created for new artifacts |
| FR-07 | File refresh: re-parse; existing artifacts keep position/size/port offsets/routing; removed artifacts are dropped; new ones get default layout |
| FR-08 | Canvas shows a hierarchical diagram view; click selects an artifact |
| FR-09 | Artifacts are movable; position is stored in the visualization model |
| FR-10 | Ports can be moved along part edges; anchor points are stored |
| FR-11 | Connections have routing type `angular` \| `direct` \| `spline` and stored reference points |
| FR-12 | `>>` menu at top-right of an artifact lists sub-diagrams (navigation) |
| FR-13 | Views tree lists defined views; Files lists project files |
| FR-14 | Right sidebar shows details for the selected artifact |
| FR-15 | Canvas can show text content of a selected `.sysml` file (read-only in alpha) |

## Non-functional requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | Hexagonal backend: domain independent of FastAPI/JSON/Mongo |
| NFR-02 | Visualization key = stable artifact id (qualified name, e.g. `Package::Part::port`) |
| NFR-03 | Merge on refresh: content from parse, layout from existing viz when keys match |
| NFR-04 | Alpha runs locally (API + Vite) |
| NFR-05 | API contract via OpenAPI (FastAPI) |

## Alpha out of scope

- Full OMG symbol catalog / all diagram types
- Complete SysMLv2 grammar, libraries, inheritance beyond subset
- Multi-user / auth / realtime collaboration
- Production MongoDB, deploy, CI
