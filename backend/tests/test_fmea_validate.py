"""Drift, per-mode requirements and coverage (step 16)."""

from __future__ import annotations

import copy

import pytest

from adapters.fmea.yaml_source import read_fmea_dir
from domain.failure.extract import build_impact_graph
from domain.fmea.load import FmeaSources, load_fmea
from domain.fmea.validate import coverage, validate
from test_fmea_load import CAR, PA, parse_model

SPARE = "package Spare { part def Kit { part electricMotor; part looseBolt; } }"
MODES = ("fmea", "fmeca", "both")


@pytest.fixture(scope="module")
def sources():
    return read_fmea_dir(CAR / "fmea")


def run(sources, mode="both", extra=None, replace=None, edit=None):
    data = copy.deepcopy(sources.data)
    if edit:
        edit(data)
    semantic, resolver = parse_model(extra, replace)
    fmea = load_fmea(FmeaSources(data, sources.lines), semantic, resolver)
    graph = build_impact_graph(semantic)
    return fmea, validate(fmea, semantic, graph, mode), semantic, graph


@pytest.mark.parametrize("mode", MODES)
def test_example_validates_clean(sources, mode):
    _, findings, _, _ = run(sources, mode)
    assert findings.errors == [] and findings.warnings == []


def test_renamed_part_def_suggests(sources):
    _, findings, _, _ = run(
        sources,
        replace={"part def BatteryModule": "part def BatteryCellModule", ": BatteryModule": ": BatteryCellModule"},
    )
    assert len(findings.errors) == 1
    err = findings.errors[0]
    assert err.code == "unknown-part-def"
    assert err.file == "library/battery_module.yaml"
    assert err.line == sources.lines[("library/battery_module.yaml", "part_def")]
    assert err.ref == "PhysicalArchitecture::BatteryModule"
    assert err.suggestions == ("PhysicalArchitecture::BatteryCellModule",)
    assert "update 'part_def'" in err.fix and "rename the part definition back" in err.fix


def test_renamed_part_is_error(sources):
    _, findings, _, _ = run(sources, replace={"electricMotor": "tractionMotor"})
    err = [e for e in findings.errors if e.code == "unknown-part"]
    assert len(err) == 1 and err[0].file == "instances.yaml"
    assert err[0].line == sources.lines[("instances.yaml", "[1].part")]
    assert f"{PA}::tractionMotor" in err[0].suggestions


def test_removed_part_is_error(sources):
    _, findings, _, _ = run(sources, replace={"infotainmentEcu": "zzqx"})
    err = [e for e in findings.errors if e.code == "unknown-part"]
    assert len(err) == 1 and err[0].path == "[2].part"


def _short_motor(data):
    data["instances.yaml"][1]["part"] = "electricMotor"


def test_ambiguous_reference_is_error(sources):
    _, findings, _, _ = run(sources, extra=SPARE, edit=_short_motor)
    err = [e for e in findings.errors if e.code == "ambiguous-part"]
    assert len(err) == 1
    assert set(err[0].suggestions) == {f"{PA}::electricMotor", "Spare::Kit::electricMotor"}


def test_short_unique_reference_warns(sources):
    _, findings, _, _ = run(sources, edit=_short_motor)
    assert findings.errors == []
    assert [w.message for w in findings.warnings] == [
        f"use the qualified name {PA}::electricMotor"
    ]


def test_part_def_pointing_at_usage_is_error(sources):
    def edit(data):
        data["library/brake_circuit.yaml"]["part_def"] = f"{PA}::brakeCircuits"

    _, findings, _, _ = run(sources, edit=edit)
    assert [e.code for e in findings.errors] == ["not-a-part-def"]


def test_instance_pointing_at_def_is_error(sources):
    def edit(data):
        data["instances.yaml"][1]["part"] = "PhysicalArchitecture::BatteryModule"

    _, findings, _, _ = run(sources, edit=edit)
    assert [e.code for e in findings.errors] == ["not-a-part-usage"]


def test_severity_groups_checked(sources):
    def edit(data):
        data["severity.yaml"]["requirement_groups"]["Ergonomics"] = 4

    _, findings, _, _ = run(sources, edit=edit)
    assert findings.errors == []
    assert [(w.code, w.ref) for w in findings.warnings] == [("unknown-group", "Ergonomics")]

    def drop(data):
        del data["severity.yaml"]["requirement_groups"]["Size"]

    _, findings, _, _ = run(sources, edit=drop)
    assert [(w.code, w.ref) for w in findings.warnings] == [("unknown-group", "Size")]


def _first_mode(data):
    return data["library/battery_module.yaml"]["failure_modes"][0]


def test_fmea_mode_needs_occurrence_or_scale(sources):
    def edit(data):
        del _first_mode(data)["occurrence"]
        del data["severity.yaml"]["occurrence_scale"]
        del data["library/battery_module.yaml"]["rate_fit"]

    _, findings, _, _ = run(sources, "fmea", edit=edit)
    assert [e.code for e in findings.errors] == ["missing-field"]
    assert findings.errors[0].message == (
        "failure mode 'cell_short' needs 'occurrence' (1-10), or 'rate_fit' + 'mode_ratio' "
        "with an 'occurrence_scale' in severity.yaml (needed for --mode fmea)"
    )
    assert findings.errors[0].file == "library/battery_module.yaml"
    assert findings.errors[0].line == sources.lines[("library/battery_module.yaml", "failure_modes[0]")]


def test_fmea_mode_occurrence_derived_from_rate(sources):
    def edit(data):
        del _first_mode(data)["occurrence"]

    _, findings, _, _ = run(sources, "fmea", edit=edit)
    assert findings.errors == []


def test_fmea_mode_needs_detection(sources):
    def edit(data):
        del _first_mode(data)["detection"]["score"]

    _, findings, _, _ = run(sources, "fmea", edit=edit)
    assert [e.code for e in findings.errors] == ["missing-field"]
    assert "detection.score" in findings.errors[0].message
    _, findings, _, _ = run(sources, "fmeca", edit=edit)
    assert findings.errors == []


def _fmea_only(data):
    lib = data["library/brake_circuit.yaml"]
    del lib["rate_fit"]
    for m in lib["failure_modes"]:
        del m["mode_ratio"]
        del m["effect_probability"]


def test_fmeca_mode_needs_rates(sources):
    _, findings, _, _ = run(sources, "fmeca", edit=_fmea_only)
    messages = sorted(e.message for e in findings.errors)
    assert messages == [
        "'effect_probability' is required for --mode fmeca",
        "'mode_ratio' is required for --mode fmeca",
        "'rate_fit' is required for --mode fmeca",
    ]
    assert all(e.file == "library/brake_circuit.yaml" and e.line for e in findings.errors)
    # without rate_fit the occurrence is still explicit, so fmea mode is happy
    _, findings, _, _ = run(sources, "fmea", edit=_fmea_only)
    assert findings.errors == []


def test_fmeca_mode_needs_mission_time_and_tables(sources):
    def edit(data):
        del data["severity.yaml"]["mission_time_h"]
        del data["severity.yaml"]["severity_classes"]
        del data["severity.yaml"]["probability_levels"]

    _, findings, _, _ = run(sources, "fmeca", edit=edit)
    assert [(e.code, e.path) for e in findings.errors] == [("missing-field", "mission_time_h")]
    _, findings, _, _ = run(sources, "fmea", edit=edit)
    assert findings.errors == []


def test_both_mode_reports_union(sources):
    def edit(data):
        _fmea_only(data)
        del data["library/battery_module.yaml"]["failure_modes"][0]["detection"]["score"]

    _, both, _, _ = run(sources, "both", edit=edit)
    _, fmea_only, _, _ = run(sources, "fmea", edit=edit)
    _, fmeca_only, _, _ = run(sources, "fmeca", edit=edit)
    key = lambda e: (e.file, e.path, e.message)
    assert sorted(map(key, both.errors)) == sorted(map(key, fmea_only.errors + fmeca_only.errors))
    assert len(both.errors) == 4


def test_coverage_lists_parts_without_modes(sources):
    fmea, _, semantic, graph = run(sources)
    cov = coverage(fmea, semantic, graph)
    assert len(cov.parts_without_modes) == 34
    assert f"{PA}::driveEcu::driveControlSw" in cov.parts_without_modes
    assert f"{PA}::batteryPack" in cov.parts_without_modes
    assert f"{PA}::batteryPack::modules" not in cov.parts_without_modes


def test_coverage_modes_on_parts_that_implement_nothing(sources):
    def edit(data):
        data["instances.yaml"].append(
            {
                "part": "Spare::Kit::looseBolt",
                "rate_fit": 5,
                "failure_modes": [
                    {
                        "id": "shear", "local_effect": {"kind": "loss"}, "mode_ratio": 1.0,
                        "effect_probability": 1.0, "occurrence": 2, "detection": {"score": 5},
                    }
                ],
            }
        )

    fmea, findings, semantic, graph = run(sources, extra=SPARE, edit=edit)
    assert findings.errors == []
    assert coverage(fmea, semantic, graph).modes_without_trace == ["Spare::Kit::looseBolt/shear"]


def test_coverage_requirements_without_group(sources):
    fmea, _, semantic, graph = run(sources)
    assert coverage(fmea, semantic, graph).requirements_without_group == []

    def edit(data):
        del data["severity.yaml"]["requirement_groups"]["Performance"]

    fmea, _, _, graph = run(sources, edit=edit)
    missing = coverage(fmea, semantic, graph).requirements_without_group
    assert "Requirements::Range" in missing
