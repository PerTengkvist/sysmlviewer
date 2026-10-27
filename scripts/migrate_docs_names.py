#!/usr/bin/env python3
"""Rename flat docs files to the package-qualified convention.

Documentation markdown lives next to the SysML file in a ``docs/`` folder.
The file name is ``<Package>[.<SubPackage>…].<name>.md`` where the package
path is the chain of *package* ancestors (part nesting is not part of the
name). Files that already follow the convention are left alone; files that
match no element are reported and left in place.

Usage:
  python scripts/migrate_docs_names.py examples/electric_car --dry-run
  python scripts/migrate_docs_names.py examples/electric_car examples/diagrams --git
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = ROOT / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from adapters.parser.subset_parser import SubsetSysmlParser  # noqa: E402
from adapters.persistence.workspace_repo import (  # noqa: E402
    WorkspaceProjectRepository,
    list_sysml_paths,
)
from domain.models import ArtifactKind, SemanticElement, SysmlFile  # noqa: E402

DOCUMENTED_KINDS = frozenset(
    {
        ArtifactKind.PACKAGE,
        ArtifactKind.PART,
        ArtifactKind.VIEW,
        ArtifactKind.PORT,
        ArtifactKind.REQUIREMENT,
        ArtifactKind.USE_CASE,
        ArtifactKind.ACTOR,
        ArtifactKind.INTERACTION,
    }
)


def is_documented(el: SemanticElement) -> bool:
    if el.kind not in DOCUMENTED_KINDS or not el.file_id:
        return False
    # Port usages reference a type; only port defs are documented.
    if el.kind == ArtifactKind.PORT and el.type_ref:
        return False
    return True


def package_path(el: SemanticElement, elements: dict[str, SemanticElement]) -> list[str]:
    """Package ancestors of ``el``, root first."""
    out: list[str] = []
    seen: set[str] = set()
    cur = elements.get(el.parent_id) if el.parent_id else None
    while cur is not None and cur.id not in seen:
        seen.add(cur.id)
        if cur.kind == ArtifactKind.PACKAGE:
            out.insert(0, cur.name)
        cur = elements.get(cur.parent_id) if cur.parent_id else None
    return out


def docs_dir(file_id: str) -> str:
    folder = file_id.rsplit("/", 1)[0] if "/" in file_id else ""
    return f"{folder}/docs" if folder else "docs"


def expected_doc_path(el: SemanticElement, elements: dict[str, SemanticElement]) -> str:
    """Project-relative ``<dir>/docs/<Package>[.<Sub>…].<name>.md``."""
    stem = ".".join([*package_path(el, elements), el.name])
    return f"{docs_dir(el.file_id or '')}/{stem}.md"


def legacy_doc_path(el: SemanticElement) -> str:
    return f"{docs_dir(el.file_id or '')}/{el.name}.md"


@dataclass
class RenamePlan:
    renames: list[tuple[str, str]] = field(default_factory=list)
    already: list[str] = field(default_factory=list)
    collisions: list[str] = field(default_factory=list)
    orphans: list[str] = field(default_factory=list)


def plan_renames(elements: dict[str, SemanticElement], doc_paths: list[str]) -> RenamePlan:
    """Map existing flat docs to qualified names; never overwrite a file."""
    plan = RenamePlan()
    existing = set(doc_paths)
    claimed: dict[str, str] = {}  # new path -> element id
    consumed: set[str] = set()
    for el in sorted(elements.values(), key=lambda e: e.id):
        if not is_documented(el):
            continue
        new = expected_doc_path(el, elements)
        old = legacy_doc_path(el)
        if new in existing:
            plan.already.append(new)
            consumed.add(new)
            continue
        if old not in existing or old in consumed:
            continue
        owner = claimed.get(new)
        if owner is not None:
            plan.collisions.append(f"{old} -> {new} (already claimed by {owner})")
            continue
        claimed[new] = el.id
        consumed.add(old)
        plan.renames.append((old, new))
    plan.orphans = sorted(p for p in existing if p not in consumed)
    return plan


def load_project(root: Path) -> tuple[dict[str, SemanticElement], list[str]]:
    files = []
    for rel in list_sysml_paths(root):
        files.append(
            SysmlFile(
                id=rel,
                name=Path(rel).name,
                content=(root / rel).read_text(encoding="utf-8"),
                path=rel,
            )
        )
    result = SubsetSysmlParser().parse_project(files)
    docs = WorkspaceProjectRepository(root).list_documentation()
    return result.elements, docs


def apply_plan(root: Path, plan: RenamePlan, *, use_git: bool) -> None:
    for old, new in plan.renames:
        src = root / old
        dst = root / new
        if dst.exists():
            raise FileExistsError(dst)
        if use_git:
            subprocess.run(["git", "mv", str(src), str(dst)], check=True)
        else:
            src.rename(dst)


def migrate_project(root: Path, *, dry_run: bool, use_git: bool) -> RenamePlan:
    elements, docs = load_project(root)
    plan = plan_renames(elements, docs)
    print(f"{root}: {len(plan.renames)} to rename, {len(plan.already)} already qualified")
    for old, new in plan.renames:
        print(f"  {old} -> {new}")
    for c in plan.collisions:
        print(f"  COLLISION {c}")
    for o in plan.orphans:
        print(f"  orphan (no matching element): {o}")
    if not dry_run:
        apply_plan(root, plan, use_git=use_git)
    return plan


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("roots", nargs="+", help="project root folders (contain project.json)")
    parser.add_argument("--dry-run", action="store_true", help="only print the plan")
    parser.add_argument("--git", action="store_true", help="rename with `git mv`")
    args = parser.parse_args(argv)
    total = 0
    for raw in args.roots:
        plan = migrate_project(Path(raw).expanduser().resolve(), dry_run=args.dry_run, use_git=args.git)
        total += len(plan.renames)
    print(f"done ({total} renamed{' [dry run]' if args.dry_run else ''})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
