"""CSV and markdown tables (step 18)."""

from __future__ import annotations

import csv
import io

import pytest

from adapters.fmea.yaml_source import read_fmea_dir
from domain.failure.extract import build_impact_graph
from domain.fmea.analyze import analyze
from domain.fmea.export import (
    COMMON_COLUMNS,
    FMEA_COLUMNS,
    FMECA_COLUMNS,
    coverage_to_csv,
    spof_to_csv,
    to_csv,
    to_markdown_table,
)
from domain.fmea.load import load_fmea
from domain.fmea.validate import coverage
from test_fmea_load import CAR, parse_model


@pytest.fixture(scope="module")
def env():
    semantic, resolver = parse_model()
    fmea = load_fmea(read_fmea_dir(CAR / "fmea"), semantic, resolver)
    graph = build_impact_graph(semantic)
    return {
        "fmea": analyze(fmea, semantic, graph, "fmea"),
        "fmeca": analyze(fmea, semantic, graph, "fmeca"),
        "coverage": coverage(fmea, semantic, graph),
        "threshold": fmea.severity.spof_severity_threshold,
    }


def parse(text):
    reader = csv.DictReader(io.StringIO(text, newline=""))
    return reader.fieldnames, list(reader)


def test_common_columns_are_fixed():
    assert COMMON_COLUMNS == [
        "Item", "Qty", "SRU", "Function", "Failure mode", "Local effect", "Next higher effect",
        "End effect", "S", "Flags", "Detection method",
    ]


def test_fmea_csv_columns_and_rows(env):
    names, rows = parse(to_csv(env["fmea"]))
    assert names == COMMON_COLUMNS + ["O", "D", "RPN"] == COMMON_COLUMNS + FMEA_COLUMNS
    assert len(rows) == 7
    assert rows[0]["Failure mode"] == "winding_open" and rows[0]["RPN"] == "200"
    assert rows[0]["Item"] == "electricMotor"


def test_fmeca_csv_columns_and_rows(env):
    names, rows = parse(to_csv(env["fmeca"]))
    assert names == COMMON_COLUMNS + FMECA_COLUMNS
    assert FMECA_COLUMNS == [
        "Rate (FIT)", "Mode ratio", "Effect probability", "Mission time (h)", "Criticality",
        "Severity class", "Probability level",
    ]
    assert len(rows) == 7
    psu = next(r for r in rows if r["Failure mode"] == "psu_dead")
    assert (psu["Criticality"], psu["Severity class"], psu["Probability level"]) == ("5.0e-04", "I", "E")
    assert psu["SRU"] == "powerSupply" and psu["Item"] == "driveEcu"


def test_spof_csv(env):
    names, rows = parse(spof_to_csv(env["fmea"], env["threshold"]))
    assert names == ["Item", "Failure mode", "S", "Lost functions", "Requirements at risk"]
    assert [r["Failure mode"] for r in rows] == ["winding_open", "can_babbling", "psu_dead"]
    assert "SpeedControl" in rows[0]["Lost functions"]


def test_coverage_csv(env):
    names, rows = parse(coverage_to_csv(env["coverage"]))
    assert names == ["Kind", "Id"]
    assert sum(r["Kind"] == "part-without-modes" for r in rows) == 34
    assert len(rows) == 34


def test_csv_dialect(env):
    text = to_csv(env["fmea"])
    assert not text.startswith("\ufeff") and "\r" not in text
    assert text.encode("utf-8").decode("utf-8") == text
    _, rows = parse(text)
    psu = next(r for r in rows if r["Failure mode"] == "psu_dead")
    assert "; " in psu["Next higher effect"]
    raw = next(l for l in text.splitlines() if "psu_dead" in l)
    assert '"' in raw and raw.count(",") > 10  # quoted cells, plain separators


def test_markdown_tables(env):
    for key, extra in (("fmea", FMEA_COLUMNS), ("fmeca", FMECA_COLUMNS)):
        lines = to_markdown_table(env[key]).split("\n\n")[0].strip().splitlines()
        header = [c.strip() for c in lines[0].strip("|").split("|")]
        assert header == COMMON_COLUMNS + extra
        assert len(lines) == 2 + 7
