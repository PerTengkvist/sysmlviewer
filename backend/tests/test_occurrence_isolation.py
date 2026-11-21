"""Parts of an occurrence are lifelines: failure impact and FMEA must not see them."""

from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.fmea.yaml_source import read_fmea_dir
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.scenarios import (
    AmbiguousName,
    UnknownName,
    resolve_failure_target,
    spof,
)
from domain.fmea.load import load_fmea
from domain.models import ArtifactKind, SysmlFile
from domain.name_resolution import ImportSpec, NameResolver
from test_fmea_outputs import COMMITTED, DOCS, generate, names, tutorial_report_commands

REPO = resolve_repo_root()
CAR = REPO / "examples" / "electric_car"
PROBE = Path(__file__).parent / "fixtures" / "occurrence_probe.sysml"
PROBE_PREFIX = "SequenceProbe::Probe::"


def _load(with_probe: bool):
    files = []
    for path in sorted(CAR.rglob("*.sysml")):
        rel = path.relative_to(CAR).as_posix()
        files.append(SysmlFile(id=rel, name=path.name, content=path.read_text("utf-8"), path=rel))
    if with_probe:
        files.append(
            SysmlFile(id="probe.sysml", name="probe.sysml", content=PROBE.read_text("utf-8"), path="probe.sysml")
        )
    result = SubsetSysmlParser().parse_project(files)
    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    return result, resolver


@pytest.fixture(scope="module")
def plain():
    return _load(False)


@pytest.fixture(scope="module")
def probed():
    return _load(True)


def test_probe_parses_without_warnings(plain, probed):
    assert probed[0].warnings == plain[0].warnings == []


def test_typed_context_part_copies_nothing(probed):
    ids = [i for i in probed[0].elements if i.startswith(PROBE_PREFIX + "car::")]
    assert ids and all(
        i == PROBE_PREFIX + "car::battery" or i.startswith(PROBE_PREFIX + "car::battery_redefines")
        for i in ids
    ), ids


@pytest.mark.parametrize("ref", ["frictionBrakes", "battery", "electricMotor"])
def test_failure_names_ignore_sequence_parts(plain, probed, ref):
    before = resolve_failure_target(ref, plain[0].elements, plain[1])
    after = resolve_failure_target(ref, probed[0].elements, probed[1])
    assert before == after and not after.startswith(PROBE_PREFIX)


def test_sequence_part_full_name_is_not_a_candidate(probed):
    elements, resolver = probed[0].elements, probed[1]
    for ref in (PROBE_PREFIX + "electricMotor", PROBE_PREFIX + "modules"):
        with pytest.raises((UnknownName, AmbiguousName)):
            resolve_failure_target(ref, elements, resolver)


def test_impact_graph_unchanged_by_sequences(plain, probed):
    a, b = build_impact_graph(plain[0].elements), build_impact_graph(probed[0].elements)
    assert list(a.nodes) == list(b.nodes)
    assert a.inputs == b.inputs
    assert not any(n.startswith(PROBE_PREFIX) for n in b.nodes)


def test_spof_unchanged_by_sequences(plain, probed):
    a = spof(build_impact_graph(plain[0].elements))
    b = spof(build_impact_graph(probed[0].elements))
    assert len(a) == len(b) == 39
    assert a == b


def test_fmea_items_ignore_sequence_parts(probed):
    model = load_fmea(read_fmea_dir(CAR / "fmea"), probed[0].elements, probed[1])
    assert model.items
    assert not any(item.part_id.startswith(PROBE_PREFIX) for item in model.items)


def test_fmea_instance_naming_a_sequence_part_is_rejected(probed, tmp_path):
    fmea = tmp_path / "fmea"
    shutil.copytree(CAR / "fmea", fmea, ignore=shutil.ignore_patterns("docs"))
    with (fmea / "instances.yaml").open("a", encoding="utf-8") as fh:
        fh.write(f"- part: {PROBE_PREFIX}modules\n  rate_fit: 10\n")
    model = load_fmea(read_fmea_dir(fmea), probed[0].elements, probed[1])
    assert any(u.code == "not-a-part-usage" for u in model.unresolved)


def _cli(path):
    spec = importlib.util.spec_from_file_location(path.stem + "_probe", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_committed_reports_unchanged_with_sequence_probe(capsys, tmp_path):
    cli = _cli(REPO / "scripts" / "fmea.py")
    commands = [[*c[:-1], "--extra", str(PROBE), "--out"] for c in tutorial_report_commands()]
    out = tmp_path / "docs"
    generate(cli, capsys, CAR, out, commands)
    assert names(out) == COMMITTED
    stale = [n for n in COMMITTED if (out / n).read_bytes() != (DOCS / n).read_bytes()]
    assert not stale


@pytest.mark.parametrize(
    "argv", [["--spof", "--format", "json"], ["--fail", "frictionBrakes:loss"]]
)
def test_failure_impact_cli_unchanged_with_probe(capsys, argv):
    cli = _cli(REPO / "scripts" / "failure_impact.py")
    outputs = []
    for extra in ([], ["--extra", str(PROBE)]):
        assert cli.main([str(CAR), *argv, *extra]) == 0
        outputs.append(capsys.readouterr().out)
    assert outputs[0] == outputs[1] and outputs[0]
    if "json" in argv:
        json.loads(outputs[0])
