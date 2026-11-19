"""The scripts/fmea.py command line (step 19)."""

from __future__ import annotations

import csv
import importlib.util
import io
import json
import shutil

import pytest

from adapters.api.static_paths import resolve_repo_root

REPO = resolve_repo_root()
SCRIPT = REPO / "scripts" / "fmea.py"
CAR = REPO / "examples" / "electric_car"


@pytest.fixture(scope="module")
def cli():
    spec = importlib.util.spec_from_file_location("fmea_cli", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(cli, capsys, *argv):
    code = cli.main([*map(str, argv)])
    out = capsys.readouterr()
    return code, out.out, out.err


@pytest.fixture()
def copy(tmp_path):
    dst = tmp_path / "electric_car"
    shutil.copytree(CAR, dst, ignore=shutil.ignore_patterns("icons", "views", "state.json"))
    return dst


@pytest.fixture()
def drifted(copy):
    f = copy / "physical_architecture" / "vehicle_physical.sysml"
    text = f.read_text(encoding="utf-8")
    f.write_text(
        text.replace("part def BatteryModule", "part def BatteryCellModule").replace(
            ": BatteryModule", ": BatteryCellModule"
        ),
        encoding="utf-8",
    )
    return copy


def test_validate_example_exit_0(cli, capsys):
    code, out, err = run(cli, capsys, "validate", CAR)
    assert code == 0, err
    assert "0 errors, 0 warnings (mode: both)" in out


def test_validate_drift_message(cli, capsys, drifted):
    code, out, err = run(cli, capsys, "validate", drifted)
    assert code == 1 and out == ""
    assert err == (
        "FMEA is out of sync with the SysML model: 1 error\n"
        "\n"
        "fmea/library/battery_module.yaml:2  part_def: PhysicalArchitecture::BatteryModule\n"
        "  The model has no part definition 'PhysicalArchitecture::BatteryModule'.\n"
        "  Did you mean 'PhysicalArchitecture::BatteryCellModule'?\n"
        "  Fix: update 'part_def' in fmea/library/battery_module.yaml to the new name,\n"
        "       or rename the part definition back in the SysML model.\n"
        "\n"
        "Nothing was analysed. After fixing, run:\n"
        f"  backend/.venv/bin/python scripts/fmea.py validate {drifted}\n"
    )


def test_analyze_aborts_on_drift(cli, capsys, drifted):
    code, out, err = run(cli, capsys, "analyze", drifted, "--mode", "fmea")
    assert code == 1 and out == "" and err.startswith("FMEA is out of sync with the SysML model: 1 error")
    assert not (drifted / "fmea" / "docs").exists()


def test_missing_field_message(cli, capsys, copy):
    lib = copy / "fmea" / "library" / "brake_circuit.yaml"
    lines = [l for l in lib.read_text(encoding="utf-8").splitlines() if "mode_ratio" not in l]
    lib.write_text("\n".join(lines) + "\n", encoding="utf-8")
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca")
    assert code == 1
    line = next(i for i, t in enumerate(lines, 1) if t.strip().startswith("- id: hydraulic_leak"))
    assert f"fmea/library/brake_circuit.yaml:{line}  failure_modes[0]: 'mode_ratio' is required for --mode fmeca" in err
    assert "out of sync" not in err
    code, _, _ = run(cli, capsys, "analyze", copy, "--mode", "fmea")
    assert code == 0


def test_broken_yaml_is_reported(cli, capsys, copy):
    (copy / "fmea" / "severity.yaml").write_text("a: [oops\n", encoding="utf-8")
    code, _, err = run(cli, capsys, "validate", copy)
    assert code == 1 and "fmea/severity.yaml:" in err


def test_coverage(cli, capsys):
    code, out, _ = run(cli, capsys, "coverage", CAR)
    assert code == 0
    assert out.count("part-without-modes") == 34


def test_analyze_modes(cli, capsys):
    code, out, _ = run(cli, capsys, "analyze", CAR, "--mode", "fmea", "--format", "csv")
    rows = list(csv.DictReader(io.StringIO(out)))
    assert code == 0 and len(rows) == 7 and "RPN" in rows[0]
    code, out, _ = run(cli, capsys, "analyze", CAR, "--mode", "fmeca", "--format", "csv")
    rows = list(csv.DictReader(io.StringIO(out)))
    assert code == 0 and len(rows) == 7 and "Criticality" in rows[0]
    code, out, _ = run(cli, capsys, "analyze", CAR, "--format", "json")
    data = json.loads(out)
    assert code == 0 and data["mode"] == "fmea" and len(data["rows"]) == 7
    code, out, _ = run(cli, capsys, "analyze", CAR, "--spof", "--format", "csv")
    assert code == 0 and out.splitlines()[0].startswith("Item,Failure mode,S")
    assert len(out.splitlines()) == 4


def test_schema_write(cli, capsys, tmp_path):
    code, _, _ = run(cli, capsys, "schema", "--write", "--out", tmp_path)
    assert code == 0
    for f in tmp_path.glob("*.json"):
        assert f.read_text(encoding="utf-8") == (REPO / "docs" / "schemas" / f.name).read_text(encoding="utf-8")
    assert len(list(tmp_path.glob("*.json"))) == 3


def test_fmea_dir_option(cli, capsys, copy, tmp_path):
    other = tmp_path / "elsewhere"
    shutil.move(str(copy / "fmea"), str(other))
    code, _, err = run(cli, capsys, "validate", copy)
    assert code == 2
    code, out, _ = run(cli, capsys, "validate", copy, "--fmea-dir", other)
    assert code == 0 and "0 errors" in out


def test_usage_errors(cli, capsys, tmp_path):
    code, _, err = run(cli, capsys, "validate", tmp_path / "nope")
    assert code == 2 and "not a folder" in err


def test_engine_warnings_stop_the_run(cli, capsys, tmp_path):
    extra = tmp_path / "warn.sysml"
    extra.write_text(
        "package Warn { part def L { part l; } part def V { #Redundant part x[2]; "
        "#implements dependency from V::x to L::l; } }",
        encoding="utf-8",
    )
    code, out, err = run(cli, capsys, "validate", CAR, "--extra", extra)
    assert code == 1 and out == ""
    assert "has no required attribute" in err and "--allow-warnings" in err
    code, out, err = run(cli, capsys, "validate", CAR, "--extra", extra, "--allow-warnings")
    assert code == 0 and "has no required attribute" in err


def test_load_error_lines_all_have_the_directory_prefix(cli, capsys, copy):
    (copy / "fmea" / "severity.yaml").write_text(
        "requirement_groups: { Safety: 11 }\nstatus_factor: { LOST: 2, DEGRADED: 2 }\n", encoding="utf-8"
    )
    code, _, err = run(cli, capsys, "validate", copy)
    assert code == 1
    lines = [l for l in err.splitlines() if "severity.yaml" in l]
    assert len(lines) >= 3 and all(l.startswith("fmea/severity.yaml:") for l in lines)


def test_unknown_line_number_is_left_out(cli, capsys, copy):
    sev = copy / "fmea" / "severity.yaml"
    sev.write_text(
        "\n".join(l for l in sev.read_text(encoding="utf-8").splitlines() if "mission_time_h" not in l) + "\n",
        encoding="utf-8",
    )
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca")
    assert code == 1
    assert "fmea/severity.yaml  mission_time_h: 'mission_time_h' is required for --mode fmeca" in err
    assert ":None" not in err and "severity.yaml:1" not in err


def test_spof_respects_format(cli, capsys):
    code, out, _ = run(cli, capsys, "analyze", CAR, "--spof", "--format", "markdown")
    assert code == 0 and out.startswith("| Item | Failure mode | S |") and len(out.strip().splitlines()) == 5
    code, out, _ = run(cli, capsys, "analyze", CAR, "--spof", "--format", "json")
    rows = json.loads(out)
    assert code == 0 and [r["failureMode"] for r in rows] == ["winding_open", "can_babbling", "psu_dead"]
    brake = next(q for q in rows[0]["requirements"] if q["id"] == "Requirements::BrakingDistance")
    assert brake == {"id": "Requirements::BrakingDistance", "label": "REQ-SAFE-02 BrakingDistance", "shortId": "REQ-SAFE-02"}


def test_analyze_shows_short_reference_warnings(cli, capsys, copy):
    inst = copy / "fmea" / "instances.yaml"
    inst.write_text(
        inst.read_text(encoding="utf-8").replace(
            "PhysicalArchitecture::VehiclePhysical::electricMotor", "electricMotor"
        ),
        encoding="utf-8",
    )
    code, out, err = run(cli, capsys, "analyze", copy, "--format", "csv")
    assert code == 0
    assert "use the qualified name PhysicalArchitecture::VehiclePhysical::electricMotor" in err
    assert "use the qualified name" not in out


def test_fmeca_markdown_notes_per_instance(cli, capsys):
    code, out, _ = run(cli, capsys, "analyze", CAR, "--mode", "fmeca")
    assert code == 0 and "per instance" in out.splitlines()[-1]
    code, out, _ = run(cli, capsys, "analyze", CAR, "--mode", "fmea")
    assert "per instance" not in out


def test_duplicate_part_message(cli, capsys, copy):
    inst = copy / "fmea" / "instances.yaml"
    inst.write_text(
        inst.read_text(encoding="utf-8")
        + "- part: electricMotor\n  failure_modes:\n    - id: bearing\n      local_effect: { kind: loss }\n",
        encoding="utf-8",
    )
    code, _, err = run(cli, capsys, "validate", copy)
    assert code == 1
    assert "is also described at instances.yaml:" in err
    assert err.count("fmea/instances.yaml:") >= 2


def test_severity_downgrade_warns_but_does_not_stop(cli, capsys, tmp_path):
    extra = tmp_path / "mixed.sysml"
    extra.write_text(
        'package Mixed { requirement def R { attribute Type = "Comfort"; } '
        "#refine dependency from R to Requirements::Safety; }",
        encoding="utf-8",
    )
    code, out, _ = run(cli, capsys, "validate", CAR, "--extra", extra)
    assert code == 0
    assert "warning: Mixed::R: requirement 'Mixed::R' has Type 'Comfort' (score 3)" in out
    assert "0 errors, 1 warning (mode: both)" in out
    code, out, err = run(cli, capsys, "analyze", CAR, "--extra", extra, "--format", "csv")
    assert code == 0 and "Failure mode" in out
    assert "Mixed::R" in err and "mixing requirement levels" in err
