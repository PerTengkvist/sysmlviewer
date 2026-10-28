# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## UI notes

- **Header path**: the workspace path shows its tail (`…/examples/car`);
  hover the path for the full value.
- **Left sidebar**: the Model/Files tabs, Collapse/Filter and the
  "Add SysML file" zone stay fixed while the tree scrolls.
- **Right sidebar**: the `›` button hides Details/Docs so the canvas gets the
  full width; the thin strip on the right shows it again. The choice and the
  previous width persist in `localStorage` (`sysmlviewer.settings`).
- **Double-click** on a part, interface or package node opens a dialog with
  Details on the left and Documentation on the right. Drag the bottom-right
  corner to resize (up to the window), use the maximize button for the full
  window, and Esc or × to close. Size is remembered in
  `sysmlviewer.elementDialog`. Double-click on a use case still opens the
  use-case flow dialog.
- **Relation TODOs**: the backend still writes `.update_relations_todos.json`
  on relation edits, but the viewer no longer shows a TODOs button or overlay.
