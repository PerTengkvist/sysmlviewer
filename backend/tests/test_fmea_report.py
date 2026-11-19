"""The markdown report with mermaid (step 22)."""

from __future__ import annotations

import re

import pytest
from mermaid_check import check_mermaid, mermaid_blocks

from adapters.fmea.yaml_source import read_fmea_dir
from domain.failure.extract import build_impact_graph
from domain.fmea.analyze import analyze
from domain.fmea.export import FMECA_NOTE, SimInfo, quadrant_coord, simulation_rows, to_report_markdown
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
        "## Criticality matrix", "## Item criticality", "## Effect chains", "## Coverage", "## Simulation",
        "## Files",
    ]
    assert "quadrantChart" in md


def test_summary_mentions_coverage(env):
    assert "5 of 39 physical parts have failure modes" in report(env, "fmea")


def test_top_risks(env):
    for mode in ("fmea", "fmeca"):
        md = report(env, mode)
        section = md.split("## Top risks")[1].split("## ")[0]
        lines = [ln for ln in section.split("\n") if ln.startswith("|")]
        assert lines[0].startswith("| Item | Qty |")
        rows = lines[2:]
        assert len(rows) == 5
        assert "winding_open" in rows[0]
        assert ("modules | 8 |" in section)  # Qty of the group usage


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


def test_files_section_names_files_as_code_not_links(env):
    md = report(env, "fmea").split("## Files")[1]
    assert "- `fmea-table.csv`" in md
    assert "](" not in md  # a link to a csv is dead in the viewer
    assert "next to this report" in md


def test_per_instance_note_only_in_fmeca(env):
    fmeca = report(env, "fmeca")
    assert fmeca.count(FMECA_NOTE) == 2  # under Top risks and under the matrix
    assert FMECA_NOTE not in report(env, "fmea")


def test_item_criticality_sums_cm_per_item_and_class(env):
    md = report(env, "fmeca")
    section = md.split("## Item criticality")[1].split("## ")[0]
    rows = [ln for ln in section.split("\n") if ln.startswith("|")][2:]
    # batteryPack.modules: capacity_fade 3.75e-3 + cell_short 1.25e-3 = 5.0e-3, both class III
    assert any("batteryPack.modules" in r and "III" in r and "5.0e-03" in r for r in rows)
    assert len(rows) == 5  # five items, each in one class
    assert "Item criticality" not in report(env, "fmea")


def test_chain_nodes_all_show_their_status(env):
    md = report(env, "fmea")
    winding = next(b for b in mermaid_blocks(md) if "winding_open" in b)
    labels = [ln for ln in winding.split("\n") if "[\"" in ln][1:]  # skip the mode node
    assert labels and all("<br/>" in ln for ln in labels), labels
    assert 'tractionDrive<br/>LOST' in winding and 'electricMotor<br/>LOST' in winding


def test_simulation_section_says_when_not_run(env):
    assert "## Simulation" not in report(env, "fmea")
    md = report(env, "fmeca")
    assert "## Simulation" in md and "Not run for this report" in md
    assert "P(LOST)" not in md


@pytest.mark.parametrize(
    "value,expected",
    [(1.0, "1"), (0.9996, "1"), (0.9994, "0.999"), (0.5, "0.500"), (0.0, "0"), (0.0004, "0"), (-0.2, "0"), (1.7, "1")],
)
def test_quadrant_coordinates_are_valid_for_mermaid(value, expected):
    assert quadrant_coord(value) == expected
    assert re.fullmatch(r"1|0(\.\d+)?", quadrant_coord(value))


def test_report_is_deterministic(env):
    assert report(env, "fmeca", sim=env["sim"]) == report(env, "fmeca", sim=env["sim"])
