"""The scripts/failure_impact.py command line."""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys

import pytest

from adapters.api.static_paths import resolve_repo_root

REPO = resolve_repo_root()
SCRIPT = REPO / "scripts" / "failure_impact.py"
CAR = str(REPO / "examples" / "electric_car")
SPARE = "package Spare { part def Kit { part electricMotor; } }"


@pytest.fixture(scope="module")
def cli():
    spec = importlib.util.spec_from_file_location("failure_impact", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(cli, capsys, *argv):
    code = cli.main([*argv])
    out = capsys.readouterr()
    return code, out.out, out.err


def test_cli_electric_motor_text(cli, capsys):
    code, out, _ = _run(cli, capsys, CAR, "--fail", "electricMotor:loss")
    assert code == 0
    assert re.search(
        r"^LOST\s+SpeedControl\s+← tractionDrive «allocate» engine «implements» electricMotor$",
        out,
        re.M,
    )


def test_cli_multiple_fail_flags(cli, capsys):
    code, out, _ = _run(
        cli, capsys, CAR, "--fail", "driveEcu:degraded:0.5", "--fail", "batteryPack.modules:loss:2"
    )
    assert code == 0
    failures = [l for l in out.splitlines() if l.startswith("FAILURE")]
    assert len(failures) == 2
    assert "driveEcu" in failures[0] and "batteryPack::modules" in failures[1]


def test_cli_formats(cli, capsys):
    code, out, _ = _run(cli, capsys, CAR, "--fail", "electricMotor:loss", "--format", "markdown")
    assert code == 0 and "## Functions" in out
    code, out, _ = _run(cli, capsys, CAR, "--fail", "electricMotor:loss", "--format", "json")
    assert code == 0
    assert json.loads(out)["nodes"]["Functions::SpeedControl"]["status"] == "LOST"


def test_cli_ambiguous_name_exit_2(cli, capsys, tmp_path):
    extra = tmp_path / "spare.sysml"
    extra.write_text(SPARE, encoding="utf-8")
    code, _, err = _run(cli, capsys, CAR, "--extra", str(extra), "--fail", "electricMotor:loss")
    assert code == 2
    assert "ambiguous part 'electricMotor':" in err
    assert "PhysicalArchitecture::VehiclePhysical::electricMotor" in err.splitlines()[1]
    assert "Spare::Kit::electricMotor" in err.splitlines()[2]


def test_cli_unknown_name_exit_2(cli, capsys):
    code, _, err = _run(cli, capsys, CAR, "--fail", "electricMotr:loss")
    assert code == 2
    assert "unknown part 'electricMotr' (did you mean: electricMotor?)" in err


def test_cli_bad_spec_exit_2(cli, capsys):
    code, _, err = _run(cli, capsys, CAR, "--fail", "x:broken")
    assert code == 2
    assert "unknown kind 'broken'" in err


def test_cli_too_many_instances_exit_2(cli, capsys):
    code, _, err = _run(cli, capsys, CAR, "--fail", "batteryPack.modules:loss:9")
    assert code == 2
    assert "has 8 instances" in err


def test_cli_needs_fail_or_spof(cli, capsys):
    code, _, err = _run(cli, capsys, CAR)
    assert code == 2 and "--fail" in err


def test_cli_spof(cli, capsys):
    code, out, _ = _run(cli, capsys, CAR, "--spof")
    assert code == 0
    assert out.splitlines()[0].split() [:2] == ["Part", "Lost"]
    code, out, _ = _run(cli, capsys, CAR, "--spof", "--format", "markdown")
    assert code == 0
    assert out.splitlines()[0] == "| Part | Lost functions | Degraded functions | Requirements at risk | Flags |"
    code, out, _ = _run(cli, capsys, CAR, "--spof", "--format", "json")
    assert code == 0 and len(json.loads(out)) == 39


def test_cli_parse_warnings_abort(cli, capsys, tmp_path):
    (tmp_path / "bad.sysml").write_text("package P { use case; }", encoding="utf-8")
    code, _, err = _run(cli, capsys, str(tmp_path), "--spof")
    assert code == 1
    assert "use case without name" in err
    code, _, _ = _run(cli, capsys, str(tmp_path), "--spof", "--allow-warnings")
    assert code == 0


def test_cli_smoke_subprocess():
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), CAR, "--fail", "electricMotor:loss"],
        cwd=REPO,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert proc.returncode == 0, proc.stderr
    assert "SpeedControl" in proc.stdout


def test_cli_allow_warnings_still_prints_them(cli, capsys, tmp_path):
    (tmp_path / "bad.sysml").write_text("package P { use case; }", encoding="utf-8")
    code, _, err = _run(cli, capsys, str(tmp_path), "--spof", "--allow-warnings")
    assert code == 0
    assert "use case without name" in err


def test_cli_missing_extra_file_exit_2(cli, capsys, tmp_path):
    code, _, err = _run(cli, capsys, CAR, "--spof", "--extra", str(tmp_path / "nope.sysml"))
    assert code == 2
    assert "nope.sysml" in err and "Traceback" not in err
