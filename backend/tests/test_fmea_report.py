"""The markdown report with mermaid (step 22)."""

from __future__ import annotations

import pytest
from mermaid_check import check_mermaid, mermaid_blocks

from adapters.fmea.yaml_source import read_fmea_dir
from domain.failure.extract import build_impact_graph
from domain.fmea.analyze import analyze
from domain.fmea.export import SimInfo, simulation_rows, to_report_markdown
from domain.fmea.load import load_fmea
from domain.fmea.simulate import simulate
from domain.fmea.validate import coverage
from test_fmea_load import CAR, parse_model

FILES = ["fmea-table.csv", "spof.csv", "coverage.csv"]


@pytest.fixture(scope="module")
def env():
    semantic, resolver = parse_model()
    fmea = load_fmea(read_fmea_dir(CAR / "fmea"), semantic, resolver)
    graph = build_impact_graph(semantic)
    sim = simulate(fmea, graph, trials=200, seed=1, mission_time_h=fmea.severity.mission_time_h)
    return {
        "fmea": fmea,
        "graph": graph,
        "analysis": {m: analyze(fmea, semantic, graph, m) for m in ("fmea", "fmeca")},
        "coverage": coverage(fmea, semantic, graph),
        "sim": SimInfo(200, 1, fmea.severity.mission_time_h, simulation_rows(graph, sim)),
    }


def report(env, mode, sim=None, files=FILES):
    return to_report_markdown(
        env["analysis"][mode], env["graph"], env["fmea"].severity, env["coverage"],
        project_name="Electric Car", files=files, physical_total=39, sim=sim,
    )


def headings(md):
    return [ln for ln in md.split("\n") if ln.startswith("# ") or ln.startswith("## ")]


def test_report_sections_fmea(env):
    md = report(env, "fmea")
    assert headings(md) == [
        "# FMEA report: Electric Car", "## Summary", "## Top risks", "## Single points of failure",
        "## Criticality matrix", "## Effect chains", "## Coverage", "## Files",
    ]
    assert "quadrantChart" not in md


def test_report_sections_fmeca(env):
    md = report(env, "fmeca", sim=env["sim"])
    assert headings(md) == [
        "# FMECA report: Electric Car", "## Summary", "## Top risks", "## Single points of failure",
        "## Criticality matrix", "## Effect chains", "## Coverage", "## Simulation", "## Files",
    ]
    assert "quadrantChart" in md


def test_summary_mentions_coverage(env):
    assert "5 of 39 physical parts have failure modes" in report(env, "fmea")


def test_top_risks(env):
    for mode in ("fmea", "fmeca"):
        md = report(env, mode)
        section = md.split("## Top risks")[1].split("## ")[0]
        rows = [ln for ln in section.split("\n") if ln.startswith("|")][2:]
        assert len(rows) == 5
        assert "winding_open" in rows[0]


def test_effect_chains_one_per_severe_mode(env):
    md = report(env, "fmea")
    flows = [b for b in mermaid_blocks(md) if b.startswith("flowchart")]
    assert len(flows) == 3
    winding = next(b for b in flows if "winding_open" in b)
    for name in ("electricMotor", "engine", "tractionDrive", "SpeedControl", "Brake", "BrakingDistance"):
        assert f'["{name}' in winding, name
    assert "-->|implements|" in winding and "-->|allocate|" in winding


def test_mermaid_blocks_are_valid(env):
    for mode in ("fmea", "fmeca"):
        blocks = mermaid_blocks(report(env, mode))
        assert blocks
        for b in blocks:
            assert check_mermaid(b) == [], b


def test_files_section_links_are_relative_csv(env):
    md = report(env, "fmea").split("## Files")[1]
    assert "[fmea-table.csv](fmea-table.csv)" in md
    assert ".md)" not in md


def test_simulation_section_only_with_sim(env):
    assert "## Simulation" not in report(env, "fmeca")


def test_report_is_deterministic(env):
    assert report(env, "fmeca", sim=env["sim"]) == report(env, "fmeca", sim=env["sim"])
