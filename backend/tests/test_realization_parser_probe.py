"""Step 0 probes for use case realization: what the parser does today."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind, SysmlFile

REPO = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).parent / "fixtures" / "realization_probe.sysml"
P = "RealizationProbe"


def _parse():
    text = FIXTURE.read_text(encoding="utf-8")
    return SubsetSysmlParser().parse_project(
        [SysmlFile(id="p.sysml", name="p.sysml", content=text, path="p.sysml")]
    )


def test_step_refine_resolves_both_ends():
    result = _parse()
    assert result.warnings == []
    assert result.file_warnings.get("p.sysml", []) == []
    dep = result.elements[f"{P}::dep1"]
    assert dep.kind == ArtifactKind.DEPENDENCY
    assert "refine" in dep.metadata_keywords
    assert dep.source_id == f"{P}::F::Security::startFlow::checkKeyInCabin"
    assert dep.target_id == f"{P}::UC::Start::checkKey"
    assert result.elements[dep.source_id].kind == ArtifactKind.ACTION
    assert result.elements[dep.target_id].kind == ArtifactKind.ACTION


def test_electric_car_has_no_parser_warnings():
    proc = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "check_sysml.py"), str(REPO / "examples" / "electric_car")],
        capture_output=True,
        text=True,
        env={"PYTHONPATH": str(REPO / "backend" / "src")},
    )
    assert proc.returncode == 0, proc.stdout + proc.stderr
