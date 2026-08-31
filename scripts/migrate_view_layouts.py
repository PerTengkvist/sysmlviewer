#!/usr/bin/env python3
"""Split legacy state.json viewLayouts into views/*.json and drop the key.

Usage:
  python scripts/migrate_view_layouts.py examples/data_center
  python scripts/migrate_view_layouts.py /path/to/project
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = ROOT / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from adapters.persistence.view_file_store import migrate_from_state  # noqa: E402


def migrate_project(project_root: Path) -> int:
    state_path = project_root / "state.json"
    if not state_path.is_file():
        print(f"skip (no state.json): {project_root}")
        return 0
    state = json.loads(state_path.read_text(encoding="utf-8"))
    legacy = state.get("viewLayouts")
    if not isinstance(legacy, dict) or not legacy:
        print(f"skip (no viewLayouts): {project_root}")
        return 0
    view_names = {
        str(v.get("id")): str(v.get("name") or "")
        for v in (state.get("views") or [])
        if isinstance(v, dict) and v.get("id")
    }
    layouts = migrate_from_state(project_root, state, view_names=view_names)
    state.pop("viewLayouts", None)
    state_path.write_text(
        json.dumps(state, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"migrated {len(layouts.by_view)} view(s) → {project_root / 'views'}")
    return len(layouts.by_view)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    total = 0
    for arg in sys.argv[1:]:
        total += migrate_project(Path(arg).expanduser().resolve())
    print(f"done ({total} layouts)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
