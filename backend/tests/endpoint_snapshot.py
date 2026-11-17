"""Golden snapshot of relation endpoints, perform targets and warnings for examples/.

Used by test_endpoint_snapshot.py as a regression gate for name resolution.
Regenerate (only with intent):
    cd backend && PYTHONPATH=src:tests .venv/bin/python tests/endpoint_snapshot.py --write
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLES = REPO_ROOT / "examples"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "endpoint_snapshot.json"

PROJECT_DIRS = ("examples/electric_car", "examples/diagrams")


def _kind(element: Any) -> str:
    return str(getattr(element.kind, "value", element.kind))


def _summarize(result: Any) -> dict[str, Any]:
    elements = result.elements
    relations = []
    performs = []
    for eid, e in elements.items():
        if e.source_id is not None or e.target_id is not None:
            relations.append(
                {
                    "id": eid,
                    "kind": _kind(e),
                    "sourceId": e.source_id,
                    "targetId": e.target_id,
                    "typeRef": e.type_ref,
                }
            )
        if e.perform_target_id is not None or "perform" in e.metadata_keywords:
            performs.append({"id": eid, "performTargetId": e.perform_target_id})
    return {
        "elementIds": sorted(elements),
        "relations": sorted(relations, key=lambda r: r["id"]),
        "performs": sorted(performs, key=lambda r: r["id"]),
        "warnings": sorted(result.warnings),
    }


def collect_snapshot() -> dict[str, Any]:
    from adapters.parser.subset_parser import SubsetSysmlParser
    from domain.models import SysmlFile

    snap: dict[str, Any] = {}
    for rel_dir in PROJECT_DIRS:
        root = REPO_ROOT / rel_dir
        files = []
        for path in sorted(root.rglob("*.sysml")):
            rel = path.relative_to(root).as_posix()
            files.append(
                SysmlFile(
                    id=rel,
                    name=path.name,
                    content=path.read_text(encoding="utf-8"),
                    path=rel,
                )
            )
        snap[f"project:{rel_dir}"] = _summarize(SubsetSysmlParser().parse_project(files))
    for path in sorted(EXAMPLES.rglob("*.sysml")):
        rel = path.relative_to(REPO_ROOT).as_posix()
        result = SubsetSysmlParser().parse(path.read_text(encoding="utf-8"), rel)
        snap[f"file:{rel}"] = _summarize(result)
    return snap


def snapshot_keys() -> list[str]:
    return sorted(json.loads(FIXTURE.read_text(encoding="utf-8")))


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def diff_snapshots(a: dict[str, Any], b: dict[str, Any]) -> list[str]:
    """Human-readable differences from snapshot `a` (old) to `b` (new)."""
    out: list[str] = []
    for key in sorted(set(a) | set(b)):
        if key not in a:
            out.append(f"{key}: key added")
            continue
        if key not in b:
            out.append(f"{key}: key removed")
            continue
        sa, sb = a[key], b[key]
        ids_a, ids_b = set(sa["elementIds"]), set(sb["elementIds"])
        for i in sorted(ids_b - ids_a):
            out.append(f"{key}: element id added {i!r}")
        for i in sorted(ids_a - ids_b):
            out.append(f"{key}: element id removed {i!r}")
        ra = {r["id"]: r for r in sa["relations"]}
        rb = {r["id"]: r for r in sb["relations"]}
        for i in sorted(set(rb) - set(ra)):
            out.append(f"{key}: relation added {i!r}")
        for i in sorted(set(ra) - set(rb)):
            out.append(f"{key}: relation removed {i!r}")
        for i in sorted(set(ra) & set(rb)):
            for field in ("kind", "sourceId", "targetId", "typeRef"):
                if ra[i][field] != rb[i][field]:
                    out.append(f"{key}: {i} {field} {ra[i][field]!r} -> {rb[i][field]!r}")
        pa = {r["id"]: r["performTargetId"] for r in sa["performs"]}
        pb = {r["id"]: r["performTargetId"] for r in sb["performs"]}
        for i in sorted(set(pa) | set(pb)):
            if pa.get(i) != pb.get(i):
                out.append(
                    f"{key}: {i} performTargetId {pa.get(i)!r} -> {pb.get(i)!r}"
                )
        for w in sorted(set(sb["warnings"]) - set(sa["warnings"])):
            out.append(f"{key}: warning added {w!r}")
        for w in sorted(set(sa["warnings"]) - set(sb["warnings"])):
            out.append(f"{key}: warning removed {w!r}")
    return out


def main(argv: list[str]) -> int:
    snap = collect_snapshot()
    if "--write" in argv:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(
            json.dumps(snap, indent=1, sort_keys=True, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        for key, value in snap.items():
            print(f"{key}: {len(value['warnings'])} warnings, "
                  f"{len(value['relations'])} relations, {len(value['elementIds'])} elements")
        return 0
    for line in diff_snapshots(load_fixture(), snap):
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
