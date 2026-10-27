"""Docs naming convention: <Package>[.<Sub>…].<name>.md, plus the migration tool."""

import importlib.util
import sys
from pathlib import Path

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.persistence.workspace_repo import WorkspaceProjectRepository, list_sysml_paths
from domain.models import ArtifactKind, SysmlFile

REPO = resolve_repo_root()


def _script():
    path = REPO / "scripts" / "migrate_docs_names.py"
    spec = importlib.util.spec_from_file_location("migrate_docs_names", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = mod  # dataclasses need the module registered
    spec.loader.exec_module(mod)
    return mod


def _parse(root: Path):
    files = [
        SysmlFile(id=rel, name=Path(rel).name, content=(root / rel).read_text(encoding="utf-8"), path=rel)
        for rel in list_sysml_paths(root)
    ]
    return SubsetSysmlParser().parse_project(files).elements


SYSML = """package Outer {
  package Inner {
    part def Thing;
  }
  part def Vehicle {
    part engine {
      part piston;
    }
  }
  port def DataPort;
  view def MainView : GeneralView { expose Vehicle; }
}
"""


def test_expected_paths_follow_package_chain(tmp_path: Path):
    (tmp_path / "arch").mkdir()
    (tmp_path / "arch" / "model.sysml").write_text(SYSML, encoding="utf-8")
    (tmp_path / "root.sysml").write_text("package Top { part def Root; }\n", encoding="utf-8")
    m = _script()
    elements = _parse(tmp_path)
    exp = {el.id: m.expected_doc_path(el, elements) for el in elements.values() if m.is_documented(el)}
    assert exp["Outer"] == "arch/docs/Outer.md"
    assert exp["Outer::Inner"] == "arch/docs/Outer.Inner.md"
    assert exp["Outer::Inner::Thing"] == "arch/docs/Outer.Inner.Thing.md"
    assert exp["Outer::Vehicle::engine::piston"] == "arch/docs/Outer.piston.md"
    assert exp["Outer::DataPort"] == "arch/docs/Outer.DataPort.md"
    assert exp["Outer::MainView"] == "arch/docs/Outer.MainView.md"
    assert exp["Top::Root"] == "docs/Top.Root.md"


def test_plan_renames_handles_migrated_orphans_and_collisions(tmp_path: Path):
    (tmp_path / "arch").mkdir()
    (tmp_path / "arch" / "model.sysml").write_text(
        "package P { part def A { part x; } part def B { part x; } part def C; }\n",
        encoding="utf-8",
    )
    m = _script()
    elements = _parse(tmp_path)
    docs = [
        "arch/docs/A.md",  # flat -> rename
        "arch/docs/P.C.md",  # already qualified
        "arch/docs/x.md",  # two parts named x share it -> one rename, one collision
        "arch/docs/Nobody.md",  # orphan
    ]
    plan = m.plan_renames(elements, docs)
    assert ("arch/docs/A.md", "arch/docs/P.A.md") in plan.renames
    assert plan.already == ["arch/docs/P.C.md"]
    assert [r for r in plan.renames if r[0] == "arch/docs/x.md"] == [("arch/docs/x.md", "arch/docs/P.x.md")]
    assert plan.collisions == []  # second x: its flat file is already consumed
    assert plan.orphans == ["arch/docs/Nobody.md"]


def test_apply_plan_renames_on_disk(tmp_path: Path):
    (tmp_path / "project.json").write_text("{}", encoding="utf-8")
    (tmp_path / "arch").mkdir()
    (tmp_path / "arch" / "model.sysml").write_text("package P { part def A; }\n", encoding="utf-8")
    docs = tmp_path / "arch" / "docs"
    docs.mkdir()
    (docs / "A.md").write_text("# A\n", encoding="utf-8")
    m = _script()
    plan = m.migrate_project(tmp_path, dry_run=True, use_git=False)
    assert plan.renames == [("arch/docs/A.md", "arch/docs/P.A.md")]
    assert (docs / "A.md").is_file()
    m.migrate_project(tmp_path, dry_run=False, use_git=False)
    assert not (docs / "A.md").exists()
    assert (docs / "P.A.md").read_text(encoding="utf-8") == "# A\n"
    # Second run is a no-op.
    again = m.migrate_project(tmp_path, dry_run=False, use_git=False)
    assert again.renames == []
    assert again.already == ["arch/docs/P.A.md"]


def _assert_example_docs_qualified(root: Path):
    m = _script()
    elements = _parse(root)
    docs = set(WorkspaceProjectRepository(root).list_documentation())
    expected = {m.expected_doc_path(el, elements) for el in elements.values() if m.is_documented(el)}
    # A doc without a model element (e.g. a view that only has a views/*.json)
    # still has to carry a top-level package prefix.
    packages = {el.name for el in elements.values() if el.kind == ArtifactKind.PACKAGE and not el.parent_id}
    flat_leftovers = sorted(
        p
        for p in docs - expected
        if not any(Path(p).name.startswith(f"{pkg}.") for pkg in packages)
    )
    assert flat_leftovers == [], f"docs not following <Package>.<name>.md: {flat_leftovers}"


def test_electric_car_docs_follow_convention():
    _assert_example_docs_qualified(REPO / "examples" / "electric_car")


def test_diagrams_docs_follow_convention():
    _assert_example_docs_qualified(REPO / "examples" / "diagrams")
