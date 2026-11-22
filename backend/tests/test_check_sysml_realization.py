"""check_sysml reports realization findings and keeps electric car green."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "check_sysml.py"
FIXTURE = Path(__file__).parent / "fixtures" / "realization_probe.sysml"
P = "RealizationProbe"


def run(folder: Path):
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(folder)],
        capture_output=True,
        text=True,
        env={"PYTHONPATH": str(REPO / "backend" / "src")},
    )


def probe_folder(tmp_path: Path) -> Path:
    (tmp_path / "probe.sysml").write_text(FIXTURE.read_text(encoding="utf-8"), encoding="utf-8")
    return tmp_path


def test_findings_printed_and_exit_1(tmp_path):
    proc = run(probe_folder(tmp_path))
    assert proc.returncode == 1
    lines = [l for l in proc.stdout.splitlines() if l.startswith("REALIZATION ")]
    assert [l.split()[1] for l in lines] == ["unrealized-system-step", "untraced-function-step"]
    assert f"REALIZATION unrealized-system-step {P}::UC::Start::askForBrake:" in lines[0]
    assert f"REALIZATION untraced-function-step {P}::F::Security::startFlow::logStart:" in lines[1]


def test_summary_line(tmp_path):
    proc = run(probe_folder(tmp_path))
    assert "realization: 1 use cases in scope, 2 findings" in proc.stdout


def test_electric_car_still_zero():
    proc = run(REPO / "examples" / "electric_car")
    assert proc.returncode == 0, proc.stdout
    assert "REALIZATION" not in proc.stdout
    assert "realization:" not in proc.stdout
