"""Output folder, committed reports and their display (step 23)."""

from __future__ import annotations

import importlib.util
import re
import shlex
import shutil

import pytest
from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.api.static_paths import resolve_repo_root
from adapters.persistence.workspace_repo import WorkspaceProjectRepository
from helpers import api_url, car_ignore

REPO = resolve_repo_root()
CAR = REPO / "examples" / "electric_car"
DOCS = CAR / "fmea" / "docs"
TUTORIAL = REPO / "docs" / "tutorials" / "fmea.md"
COMMITTED = [
    "coverage.csv", "fmea-report.md", "fmea-spof.csv", "fmea-table.csv", "fmeca-report.md",
    "fmeca-spof.csv", "fmeca-table.csv", "simulation.csv",
]


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
    shutil.copytree(CAR, dst, ignore=car_ignore("icons", "views", "state.json"))
    return dst


def names(folder):
    return sorted(p.name for p in folder.iterdir())


def tutorial_report_commands() -> list[list[str]]:
    """The `fmea.py analyze ... --out` lines of the tutorial, as argv lists (project path kept)."""
    found = []
    for line in TUTORIAL.read_text(encoding="utf-8").splitlines():
        m = re.match(r"backend/\.venv/bin/python scripts/fmea\.py (analyze .*--out)$", line.strip())
        if m:
            found.append(shlex.split(m.group(1)))
    return found


def generate(cli, capsys, project, out, commands):
    for argv in commands:
        argv = [str(project) if a == "examples/electric_car" else a for a in argv]
        assert argv[-1] == "--out"
        code, _, err = run(cli, capsys, *argv, out)
        assert code == 0, err


def test_analyze_writes_out_dir(cli, capsys, copy, tmp_path):
    out = tmp_path / "out"
    code, stdout, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--out", out)
    assert code == 0, err
    assert names(out) == ["coverage.csv", "fmeca-report.md", "fmeca-spof.csv", "fmeca-table.csv"]
    for name in names(out):
        assert str(out / name) in stdout
    assert (out / "fmeca-report.md").read_text().startswith("# FMECA report: Electric Car")


def test_analyze_default_out_is_project_fmea_docs(cli, capsys, copy):
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmea", "--out")
    assert code == 0, err
    assert (copy / "fmea" / "docs" / "fmea-report.md").is_file()
    assert (copy / "fmea" / "docs" / "fmea-table.csv").is_file()
    assert (copy / "fmea" / "docs" / "fmea-spof.csv").is_file()


def test_trials_writes_simulation_and_section(cli, capsys, copy, tmp_path):
    out = tmp_path / "out"
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--trials", "100", "--seed", "1", "--out", out)
    assert code == 0, err
    assert "simulation.csv" in names(out)
    assert "## Simulation" in (out / "fmeca-report.md").read_text()


def test_stale_simulation_is_not_presented_as_current(cli, capsys, copy, tmp_path):
    out = tmp_path / "out"
    run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--trials", "100", "--out", out)
    code, _, err = run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--out", out)
    assert code == 0, err
    report = (out / "fmeca-report.md").read_text()
    assert "Not run for this report" in report
    assert "simulation.csv" not in report.split("## Files")[1]
    assert "P(LOST)" not in report


@pytest.mark.parametrize(
    "extra",
    [
        ("--mode", "fmea", "--trials", "10"),
        ("--mode", "fmeca", "--trials", "0"),
        ("--mode", "fmeca", "--seed", "3"),
        ("--mode", "fmeca", "--spof"),
        ("--mode", "fmeca", "--format", "csv"),
    ],
)
def test_option_combinations_are_usage_errors(cli, capsys, copy, tmp_path, extra):
    code, _, err = run(cli, capsys, "analyze", copy, *extra, "--out", tmp_path / "o")
    assert code == 2 and err.startswith("error:")
    assert not (tmp_path / "o").exists()


def test_trials_and_seed_without_out_is_a_usage_error(cli, capsys, copy):
    assert run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--trials", "10")[0] == 2
    assert run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--seed", "2")[0] == 2


def test_out_pointing_at_a_file_is_a_usage_error(cli, capsys, copy, tmp_path):
    target = tmp_path / "a_file"
    target.write_text("x", encoding="utf-8")
    for argv in (("analyze", copy, "--mode", "fmea"), ("simulate", copy, "--trials", "5")):
        code, _, err = run(cli, capsys, *argv, "--out", target)
        assert code == 2 and "not a folder" in err
    assert target.read_text() == "x"


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
    listed = WorkspaceProjectRepository(CAR).list_documentation()
    assert "fmea/docs/fmea-report.md" in listed and "fmea/docs/fmeca-report.md" in listed


def test_report_is_served_by_the_documentation_api(cli, capsys, copy):
    run(cli, capsys, "analyze", copy, "--mode", "fmea", "--out")
    client = TestClient(create_app(data_dir=copy))
    opened = client.post(api_url("/session/open"), json={"projectFile": str(copy / "project.json")})
    assert opened.status_code == 200, opened.text
    pid = opened.json()["project"]["id"]
    assert "fmea/docs/fmea-report.md" in client.get(api_url(f"/projects/{pid}/documentation")).json()["paths"]
    doc = client.get(api_url(f"/projects/{pid}/documentation/fmea/docs/fmea-report.md"))
    assert doc.status_code == 200
    assert doc.json()["content"].startswith("# FMEA report: Electric Car")


def test_tutorial_documents_the_report_commands():
    commands = tutorial_report_commands()
    assert [c[c.index("--mode") + 1] for c in commands] == ["fmea", "fmeca"]


@pytest.mark.parametrize("reverse", [False, True])
def test_committed_reports_are_current(cli, capsys, tmp_path, reverse):
    """The commands in docs/tutorials/fmea.md reproduce the committed files, in any order."""
    out = tmp_path / "docs"
    commands = tutorial_report_commands()
    generate(cli, capsys, CAR, out, list(reversed(commands)) if reverse else commands)
    assert names(out) == COMMITTED
    stale = [n for n in COMMITTED if (out / n).read_bytes() != (DOCS / n).read_bytes()]
    assert not stale, (
        f"stale committed reports {stale}; regenerate with the commands under "
        "'Viewing the results' in docs/tutorials/fmea.md"
    )


def test_coverage_csv_does_not_depend_on_the_mode(cli, capsys, copy, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    run(cli, capsys, "analyze", copy, "--mode", "fmea", "--out", a)
    run(cli, capsys, "analyze", copy, "--mode", "fmeca", "--out", b)
    assert (a / "coverage.csv").read_bytes() == (b / "coverage.csv").read_bytes()


def test_reports_do_not_affect_model(cli, capsys):
    code, out, err = run(cli, capsys, "validate", CAR)
    assert code == 0, err
    assert "0 errors, 0 warnings" in out


def test_gitattributes_pins_report_line_endings():
    text = (REPO / ".gitattributes").read_text(encoding="utf-8")
    assert "examples/*/fmea/docs/* text eol=lf" in text
