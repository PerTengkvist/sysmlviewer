# SysML Viewer — Use Cases (Alpha)

## UC-01 Create project

**Actor:** User  
**Flow:** Open app → “New project” → enter name → empty project model is saved → becomes active.

## UC-02 Switch project

List projects → select one → load semantic + visualization + files → canvas/sidebars update.

## UC-03 Add SysML file

Files tab → drop/upload `.sysml` → backend stores file content → parse subset → merge visualization → Views update → default diagram shown.

## UC-04 Refresh file

Right-click file → Refresh → re-parse → merge (layout kept) → canvas updates.

## UC-05 Edit layout

Drag part/port → update visualization locally → Save project (explicit save in alpha).

## UC-06 Change connection routing

Select connection → set `angular` / `direct` / `spline` → waypoints/reference points stored on viz edge.

## UC-07 Navigate hierarchy

Click part → details in right sidebar; `>>` → list child views/diagrams → open selected view in canvas.

## UC-08 Show text file

Select file in Files (or “View as text”) → canvas shows raw text instead of diagram.
