"""Reading the FMEA directory and resolving it against the model (step 15)."""

from __future__ import annotations

import shutil

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.fmea.yaml_source import read_fmea_dir
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.fmea.load import FmeaLoadError, load_fmea
from domain.models import SysmlFile
from domain.name_resolution import ImportSpec, NameResolver

CAR = resolve_repo_root() / "examples" / "electric_car"
PA = "PhysicalArchitecture::VehiclePhysical"


def parse_model(extra: str | None = None, replace: dict[str, str] | None = None):
    files = []
    for path in sorted(CAR.rglob("*.sysml")):
        rel = path.relative_to(CAR).as_posix()
        text = path.read_text(encoding="utf-8")
        for old, new in (replace or {}).items():
            text = text.replace(old, new)
        files.append(SysmlFile(id=rel, name=path.name, content=text, path=rel))
    if extra:
        files.append(SysmlFile(id="spare.sysml", name="spare.sysml", content=extra, path="spare.sysml"))
    result = SubsetSysmlParser().parse_project(files)
    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    return result.elements, resolver


@pytest.fixture(scope="module")
def model():
    return parse_model()


@pytest.fixture(scope="module")
def sources():
    return read_fmea_dir(CAR / "fmea")


@pytest.fixture(scope="module")
def fmea(model, sources):
    return load_fmea(sources, *model)


def item(fmea, name):
    return next(i for i in fmea.items if i.part_id == f"{PA}::{name}")


def test_read_fmea_dir(sources, tmp_path):
    assert set(sources.data) == {
        "library/battery_module.yaml",
        "library/brake_circuit.yaml",
        "instances.yaml",
        "severity.yaml",
    }
    shutil.copytree(CAR / "fmea", tmp_path / "fmea")
    (tmp_path / "fmea" / "docs").mkdir(exist_ok=True)
    (tmp_path / "fmea" / "docs" / "report.yaml").write_text("not: [a library", encoding="utf-8")
    assert "docs/report.yaml" not in read_fmea_dir(tmp_path / "fmea").data


def test_line_numbers(sources):
    text = (CAR / "fmea" / "library" / "battery_module.yaml").read_text(encoding="utf-8").splitlines()
    line = next(i for i, t in enumerate(text, 1) if t.startswith("part_def:"))
    assert sources.lines[("library/battery_module.yaml", "part_def")] == line
    inst = (CAR / "fmea" / "instances.yaml").read_text(encoding="utf-8").splitlines()
    line = next(i for i, t in enumerate(inst, 1) if "part:" in t)
    assert sources.lines[("instances.yaml", "[0].part")] == line
    assert ("library/battery_module.yaml", "failure_modes[1].local_effect.fraction") in sources.lines


def test_library_applies_to_all_typed_usages(fmea):
    modules = item(fmea, "batteryPack::modules")
    assert modules.qty == 8
    assert [m.id for u in modules.units for m in u.modes] == ["cell_short", "capacity_fade"]
    circuits = item(fmea, "brakeCircuits")
    assert circuits.qty == 2
    assert [m.id for u in circuits.units for m in u.modes] == ["hydraulic_leak"]


def test_sru_modes_belong_to_lru(fmea):
    ecu = item(fmea, "driveEcu")
    srus = {u.sru: u for u in ecu.units if u.sru}
    assert set(srus) == {"powerSupply", "canTransceiver"}
    assert srus["powerSupply"].rate_fit == 50 and srus["canTransceiver"].rate_fit == 20
    assert [m.id for m in srus["canTransceiver"].modes] == ["can_babbling"]
    assert srus["canTransceiver"].modes[0].effect_probability == 0.5


def test_override_by_id(model, sources):
    data = dict(sources.data)
    data["instances.yaml"] = [
        *sources.data["instances.yaml"],
        {"part": f"{PA}::batteryPack::modules", "overrides": [{"id": "cell_short", "mode_ratio": 0.3}]},
    ]
    from domain.fmea.load import FmeaSources

    fmea = load_fmea(FmeaSources(data, sources.lines), *model)
    modules = item(fmea, "batteryPack::modules")
    by_id = {m.id: m for u in modules.units for m in u.modes}
    assert by_id["cell_short"].mode_ratio == 0.3
    assert by_id["capacity_fade"].mode_ratio == 0.75
    # the library, shared with other usages, is untouched
    again = load_fmea(sources, *model)
    assert {m.id: m for u in item(again, "batteryPack::modules").units for m in u.modes}[
        "cell_short"
    ].mode_ratio == 0.25


def test_items_in_example(fmea):
    assert len(fmea.items) == 5
    assert sum(len(u.modes) for i in fmea.items for u in i.units) == 7
    assert fmea.unresolved == []
    assert fmea.severity.requirement_groups["Safety"] == 10


def test_load_reports_schema_errors_with_file_and_line(model, sources):
    from domain.fmea.load import FmeaSources

    data = {k: v for k, v in sources.data.items()}
    broken = dict(data["library/brake_circuit.yaml"])
    broken["rate_fit"] = -5
    data["library/brake_circuit.yaml"] = broken
    with pytest.raises(FmeaLoadError) as exc:
        load_fmea(FmeaSources(data, sources.lines), *model)
    line = sources.lines[("library/brake_circuit.yaml", "rate_fit")]
    assert str(exc.value).startswith(f"library/brake_circuit.yaml:{line}:")


def test_yaml_syntax_error_has_file_and_line(tmp_path):
    (tmp_path / "severity.yaml").write_text("a: 1\nb: [oops\n", encoding="utf-8")
    with pytest.raises(FmeaLoadError) as exc:
        read_fmea_dir(tmp_path)
    assert str(exc.value).startswith("severity.yaml:")
