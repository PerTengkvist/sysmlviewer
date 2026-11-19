"""scripts/electric_car_trigger_fmea_failure.py apply|reset (step 24). Always on a temp copy."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import shutil

import pytest

from adapters.api.static_paths import resolve_repo_root
from helpers import car_ignore

REPO = resolve_repo_root()
CAR = REPO / "examples" / "electric_car"
SCRIPT = REPO / "scripts" / "electric_car_trigger_fmea_failure.py"
SYSML = "physical_architecture/vehicle_physical.sysml"
MARKER = ".sysmlviewer/fmea_trigger.json"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def trigger():
    return load(SCRIPT, "trigger_fmea")


@pytest.fixture(scope="module")
def fmea_cli():
    return load(REPO / "scripts" / "fmea.py", "fmea_cli_trigger")


@pytest.fixture()
def car(tmp_path):
    dst = tmp_path / "electric_car"
    shutil.copytree(CAR, dst, ignore=car_ignore("icons", ".sysmlviewer"))
    return dst


def run(module, capsys, *argv):
    code = module.main([*map(str, argv)])
    out = capsys.readouterr()
    return code, out.out, out.err


def apply(trigger, capsys, car, *extra):
    return run(trigger, capsys, "apply", "--project", car, *extra)


def reset(trigger, capsys, car):
    return run(trigger, capsys, "reset", "--project", car)


def snapshot(car):
    """Every file under the project, as bytes, excluding the trigger's own folder."""
    return {
        p.relative_to(car).as_posix(): p.read_bytes()
        for p in sorted(car.rglob("*"))
        if p.is_file() and ".sysmlviewer" not in p.relative_to(car).parts
    }


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalise(text, car):
    return text.replace(f" --project {car}", "").replace(str(car), "examples/electric_car")


APPLY_OUT = (
    "Applied: renamed part def PhysicalArchitecture::BatteryModule -> BatteryCellModule\n"
    "  in physical_architecture/vehicle_physical.sysml (2 places: declaration and the type of batteryPack.modules).\n"
    "  The SysML model is still valid; the FMEA library fmea/library/battery_module.yaml now points at a name that no longer exists.\n"
    "Next:\n"
    "  backend/.venv/bin/python scripts/fmea.py validate examples/electric_car   # expected to fail\n"
    "  backend/.venv/bin/python scripts/electric_car_trigger_fmea_failure.py reset\n"
)


def test_apply_then_validate_fails_with_message(trigger, fmea_cli, capsys, car):
    code, out, err = apply(trigger, capsys, car)
    assert code == 0, err
    assert normalise(out, car) == APPLY_OUT
    text = (car / SYSML).read_text(encoding="utf-8")
    assert "part def BatteryCellModule" in text and ": BatteryCellModule" in text
    assert "BatteryModule" not in re.sub("BatteryCellModule", "", text)
    code, out, err = run(fmea_cli, capsys, "validate", car)
    assert code == 1 and out == ""
    assert "FMEA is out of sync with the SysML model: 1 error" in err
    assert "Did you mean 'PhysicalArchitecture::BatteryCellModule'?" in err
    for argv in (("analyze", "--mode", "fmea"), ("analyze", "--mode", "fmeca"), ("simulate",)):
        code, _, err = run(fmea_cli, capsys, argv[0], car, *argv[1:])
        assert code == 1 and "out of sync" in err, argv
    code, out, err = run(fmea_cli, capsys, "validate", car, "--allow-warnings")
    assert code == 1  # still drifted; the model itself has no parser warnings


def test_model_has_no_parser_warnings_after_apply(trigger, capsys, car):
    from adapters.parser.subset_parser import SubsetSysmlParser
    from domain.models import SysmlFile

    apply(trigger, capsys, car)
    files = [
        SysmlFile(id=str(f.relative_to(car)), name=f.name, content=f.read_text(encoding="utf-8"),
                  path=str(f.relative_to(car)))
        for f in sorted(car.rglob("*.sysml"))
    ]
    assert SubsetSysmlParser().parse_project(files).warnings == []


def test_reset_restores_bytes(trigger, fmea_cli, capsys, car):
    before = snapshot(car)
    apply(trigger, capsys, car)
    code, out, err = reset(trigger, capsys, car)
    assert code == 0, err
    assert snapshot(car) == before
    assert not (car / MARKER).exists()
    assert normalise(out, car).rstrip("\n").endswith(
        "backend/.venv/bin/python scripts/fmea.py validate examples/electric_car   # expected to pass"
    )
    assert run(fmea_cli, capsys, "validate", car)[0] == 0


def test_state_json_restored(trigger, capsys, car):
    apply(trigger, capsys, car)
    state = car / "state.json"
    at_apply = state.read_bytes()
    state.write_bytes(at_apply + b" ")  # what the viewer does on a refresh
    views_before = {p.name: p.read_bytes() for p in (car / "views").glob("*.json")}
    code, out, err = reset(trigger, capsys, car)
    assert code == 0, err
    assert state.read_bytes() == at_apply
    during = car / ".sysmlviewer" / "state.during-trigger.json"
    assert during.read_bytes() == at_apply + b" "
    assert "state.during-trigger.json" in out
    assert {p.name: p.read_bytes() for p in (car / "views").glob("*.json")} == views_before


def test_views_are_never_written(trigger, capsys, car):
    apply(trigger, capsys, car)
    view = next((car / "views").glob("*.json"))
    view.write_bytes(view.read_bytes() + b" ")
    changed = view.read_bytes()
    code, out, _ = reset(trigger, capsys, car)
    assert code == 0
    assert view.read_bytes() == changed
    assert "warning" in out.lower() and view.name in out


def test_apply_twice(trigger, capsys, car):
    apply(trigger, capsys, car)
    after_first = snapshot(car)
    marker = (car / MARKER).read_bytes()
    code, out, _ = apply(trigger, capsys, car)
    assert code == 0
    assert out == "Already applied (marker .sysmlviewer/fmea_trigger.json). Nothing changed. Run 'reset' to undo.\n"
    assert snapshot(car) == after_first and (car / MARKER).read_bytes() == marker


def test_reset_without_apply(trigger, capsys, car):
    before = snapshot(car)
    code, out, _ = reset(trigger, capsys, car)
    assert code == 0
    assert out == "Nothing to reset: the model is in its original state.\n"
    assert snapshot(car) == before and not (car / ".sysmlviewer").exists()


def _two_to_one(text):
    return text.replace(": BatteryModule", ": Other", 1)


def _two_to_three(text):
    return text + "\n// BatteryModule is mentioned again\n"


@pytest.mark.parametrize("scenario", ["one", "three", "already-sysml", "already-fmea", "other-project"])
def test_apply_refuses_unexpected_content(trigger, capsys, car, scenario):
    f = car / SYSML
    if scenario == "one":
        f.write_text(_two_to_one(f.read_text(encoding="utf-8")), encoding="utf-8")
    elif scenario == "three":
        f.write_text(_two_to_three(f.read_text(encoding="utf-8")), encoding="utf-8")
    elif scenario == "already-sysml":
        (car / "extra.sysml").write_text("package X { part def BatteryCellModule; }\n", encoding="utf-8")
    elif scenario == "already-fmea":
        lib = car / "fmea" / "library" / "battery_module.yaml"
        lib.write_text(lib.read_text(encoding="utf-8") + "# BatteryCellModule\n", encoding="utf-8")
    else:
        manifest = json.loads((car / "project.json").read_text(encoding="utf-8"))
        manifest["projektnamn"] = "Something Else"
        (car / "project.json").write_text(json.dumps(manifest), encoding="utf-8")
    before = snapshot(car)
    code, out, err = apply(trigger, capsys, car)
    assert code == 1
    assert "Nothing was changed" in err
    assert snapshot(car) == before and not (car / MARKER).exists()


def test_reset_refuses_if_file_changed_after_apply(trigger, capsys, car):
    apply(trigger, capsys, car)
    f = car / SYSML
    edited = f.read_bytes() + b"// my own line\n"
    f.write_bytes(edited)
    code, out, err = reset(trigger, capsys, car)
    assert code == 1
    assert (
        "vehicle_physical.sysml changed after apply; not overwriting your edits. "
        "The original is stored in .sysmlviewer/fmea_trigger.json." in err
    )
    assert f.read_bytes() == edited and (car / MARKER).exists()


def test_reset_refuses_without_marker_but_renamed(trigger, capsys, car):
    apply(trigger, capsys, car)
    (car / MARKER).unlink()
    before = snapshot(car)
    code, _, err = reset(trigger, capsys, car)
    assert code == 1 and "BatteryCellModule" in err
    assert snapshot(car) == before


def test_crlf_files_keep_their_line_endings(trigger, capsys, car):
    f = car / SYSML
    f.write_bytes(f.read_bytes().replace(b"\n", b"\r\n"))
    original = f.read_bytes()
    assert apply(trigger, capsys, car)[0] == 0
    assert b"\r\n" in f.read_bytes() and b"\n" not in f.read_bytes().replace(b"\r\n", b"")
    assert reset(trigger, capsys, car)[0] == 0
    assert f.read_bytes() == original


def test_no_git_usage():
    source = SCRIPT.read_text(encoding="utf-8")
    assert "subprocess" not in source and "os.system" not in source
    assert not re.search(r"\bgit\b", source, re.I)


def test_default_project_is_the_example(trigger):
    assert trigger.DEFAULT_PROJECT == CAR
