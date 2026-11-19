"""Output folder, committed reports and their display (step 23)."""

from __future__ import annotations

import importlib.util
import shutil

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.persistence.workspace_repo import WorkspaceProjectRepository

REPO = resolve_repo_root()
CAR = REPO / "examples" / "electric_car"
DOCS = CAR / "fmea" / "docs"
COMMITTED = ["coverage.csv", "fmea-report.md", "fmea-table.csv", "fmeca-report.md",
             "fmeca-table.csv", "simulation.csv", "spof.csv"]


@pytest.fixture(scope="module")
def cli():
    spec = importlib.util.spec_from_file_location("fmea_cli_out", REPO / "scripts" / "fmea.py")
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
    shutil.copytree(CAR, dst, ignore=shutil.ignore_patterns("icons", "views", "state.json", "docs"))
    return dst


def names(folder):
    return sorted(p.name for p in folder.iterdir())


def test_analyze_writes_out_dir(cli, capsys, copy, tmp_path):
    out = tmp_path / "out"
    code, stdout, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--out", out)
    assert code == 0, err
    assert names(out) == ["coverage.csv", "fmeca-report.md", "fmeca-table.csv", "spof.csv"]
    for name in names(out):
        assert str(out / name) in stdout
    assert (out / "fmeca-report.md").read_text().startswith("# FMECA report: Electric Car")


def test_analyze_default_out_is_project_fmea_docs(cli, capsys, copy):
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmea", "--out")
    assert code == 0, err
    assert (copy / "fmea" / "docs" / "fmea-report.md").is_file()
    assert (copy / "fmea" / "docs" / "fmea-table.csv").is_file()


def test_trials_writes_simulation_and_section(cli, capsys, copy, tmp_path):
    out = tmp_path / "out"
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--trials", "100", "--seed", "1", "--out", out)
    assert code == 0, err
    assert "simulation.csv" in names(out)
    assert "## Simulation" in (out / "fmeca-report.md").read_text()


def test_trials_needs_fmeca_and_out(cli, capsys, copy, tmp_path):
    assert run(cli, capsys, "analyze", copy, "--mode", "fmea", "--trials", "10", "--out", tmp_path)[0] == 2
    assert run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--trials", "10")[0] == 2


def test_simulate_out_writes_csv(cli, capsys, copy, tmp_path):
    out = tmp_path / "sim"
    code, stdout, err = run(cli, capsys, "simulate", copy, "--trials", "50", "--out", out)
    assert code == 0, err
    assert names(out) == ["simulation.csv"]
    assert str(out / "simulation.csv") in stdout


def test_report_is_listed_as_documentation(copy, cli, capsys):
    run(cli, capsys, "analyze", copy, "--mode", "fmea", "--out")
    assert "fmea/docs/fmea-report.md" in WorkspaceProjectRepository(copy).list_documentation()


def test_committed_reports_are_listed():
    assert "fmea/docs/fmea-report.md" in WorkspaceProjectRepository(CAR).list_documentation()
    assert "fmea/docs/fmeca-report.md" in WorkspaceProjectRepository(CAR).list_documentation()


def test_committed_reports_are_current(cli, capsys, tmp_path):
    """The commands documented in docs/tutorials/fmea.md reproduce the committed files."""
    out = tmp_path / "docs"
    assert run(cli, capsys, "analyze", CAR, "--mode", "fmea", "--out", out)[0] == 0
    assert run(cli, capsys, "analyze", CAR, "--mode", "fmeca", "--trials", "2000", "--seed", "1", "--out", out)[0] == 0
    assert names(out) == COMMITTED
    stale = [n for n in COMMITTED if (out / n).read_bytes() != (DOCS / n).read_bytes()]
    assert not stale, (
        f"stale committed reports {stale}; regenerate with:\n"
        "  backend/.venv/bin/python scripts/fmea.py analyze examples/electric_car --mode fmea --out\n"
        "  backend/.venv/bin/python scripts/fmea.py analyze examples/electric_car --mode fmeca "
        "--trials 2000 --seed 1 --out"
    )


def test_reports_do_not_affect_model(cli, capsys):
    code, out, err = run(cli, capsys, "validate", CAR)
    assert code == 0, err
    assert "0 errors, 0 warnings" in out
