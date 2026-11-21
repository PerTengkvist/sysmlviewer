"""The use case realization snippet in the tutorial parses clean and realizes what it says."""

from __future__ import annotations

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile
from domain.realization import derive_realization
from test_sequence_tutorial_snippets import fenced_blocks

TUTORIAL = resolve_repo_root() / "docs" / "tutorials" / "use-cases-and-scenarios.md"


def snippet() -> str:
    blocks = [b for tag, lang, b in fenced_blocks(TUTORIAL.read_text(encoding="utf-8")) if tag == "realization-snippet"]
    assert len(blocks) == 1
    return blocks[0]


def test_realization_snippet_realizes_every_system_step():
    r = SubsetSysmlParser().parse_project([SysmlFile("t.sysml", "t.sysml", snippet(), path="t.sysml")])
    assert r.warnings == []
    real = derive_realization(r.elements)
    uc = "Realize::UC::StartVehicle"
    assert real.in_scope == {uc}
    assert real.findings == []
    assert real.actor_steps[uc] == {f"{uc}::pressStart": f"{uc}::Driver"}
    assert list(real.uc_functions[uc]) == ["Realize::Functions::Security"]
    assert real.uc_parts[uc] == {"Realize::Logical::vehicleController": "step"}
