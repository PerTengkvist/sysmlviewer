"""Frozen facts of the electric car's sequences, taken from the legacy
`interaction def` / `lifeline` / `message` form before the occurrence migration.

Per sequence: the lifeline ids in declaration order, the default order (first
appearance in the messages, which is what the diagram uses), and the messages
(old id, name, ends, reply flag) in declaration order.

Regenerate (only with intent, and only from a legacy model):
    cd backend && PYTHONPATH=src:tests .venv/bin/python tests/sequence_migration_fixture.py --write
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = REPO_ROOT / "examples" / "electric_car"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sequence_migration.json"


def load_electric_car_elements() -> dict[str, Any]:
    from adapters.parser.subset_parser import SubsetSysmlParser
    from domain.models import SysmlFile

    files = []
    for path in sorted(EXAMPLE.rglob("*.sysml")):
        rel = path.relative_to(EXAMPLE).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    return SubsetSysmlParser().parse_project(files).elements


def _is_reply(element: Any) -> bool:
    return any(k.lower() == "reply" for k in (element.metadata_keywords or []))


def collect_legacy(elements: dict[str, Any]) -> dict[str, Any]:
    """Facts of the legacy model. Raises if there is no `interaction def`."""
    out: dict[str, Any] = {}
    for el in elements.values():
        if el.kind.value != "interaction" or el.parent_id != "Dynamics":
            continue
        lifelines = [
            c for c in el.children if elements[c].kind.value == "lifeline"
        ]
        messages = [
            {
                "oldId": c,
                "name": elements[c].name,
                "sourceId": elements[c].source_id,
                "targetId": elements[c].target_id,
                "reply": _is_reply(elements[c]),
            }
            for c in el.children
            if elements[c].kind.value == "message"
        ]
        default: list[str] = []
        for m in messages:
            for end in (m["sourceId"], m["targetId"]):
                if end in lifelines and end not in default:
                    default.append(end)
        out[el.id] = {"lifelines": lifelines, "defaultOrder": default, "messages": messages}
    if not out:
        raise SystemExit("no interaction def found: the model is not in the legacy form")
    return out


def load_fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def main(argv: list[str]) -> int:
    facts = collect_legacy(load_electric_car_elements())
    if "--write" in argv:
        FIXTURE.parent.mkdir(parents=True, exist_ok=True)
        FIXTURE.write_text(
            json.dumps(facts, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(f"{len(facts)} sequences, "
              f"{sum(len(v['lifelines']) for v in facts.values())} lifelines, "
              f"{sum(len(v['messages']) for v in facts.values())} messages")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
