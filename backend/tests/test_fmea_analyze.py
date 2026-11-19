"""FMEA and FMECA analysis against the golden table (step 17)."""

from __future__ import annotations

import copy

import pytest

from adapters.fmea.yaml_source import read_fmea_dir
from domain.failure.extract import build_impact_graph
from domain.fmea.analyze import analyze, spof_modes
from domain.fmea.load import FmeaSources, load_fmea
from domain.fmea.validate import FmeaValidationError
from test_fmea_load import CAR, PA, parse_model

# item, sru, mode, lambda_m, S, O, D, RPN, C_m, class, level
GOLDEN = [
    ("electricMotor", None, "winding_open", 80, 10, 4, 5, 200, 8.0e-4, "I", "E"),
    ("driveEcu", "canTransceiver", "can_babbling", 20, 10, 3, 4, 120, 1.0e-4, "I", "E"),
    ("batteryPack::modules", None, "cell_short", 125, 6, 5, 3, 90, 1.25e-3, "III", "D"),
    ("infotainmentEcu", None, "soc_lockup", 200, 3, 5, 6, 90, 2.0e-3, "IV", "D"),
    ("batteryPack::modules", None, "capacity_fade", 375, 6, 6, 2, 72, 3.75e-3, "III", "D"),
    ("driveEcu", "powerSupply", "psu_dead", 50, 10, 3, 2, 60, 5.0e-4, "I", "E"),
    ("brakeCircuits", None, "hydraulic_leak", 30, 1, 3, 4, 12, 3.0e-4, "IV", "E"),
]
FMECA_ORDER = [
    "winding_open", "psu_dead", "can_babbling", "capacity_fade", "cell_short", "soc_lockup",
    "hydraulic_leak",
]


@pytest.fixture(scope="module")
def sources():
    return read_fmea_dir(CAR / "fmea")


def build(sources, mode, replace=None, edit=None):
    data = copy.deepcopy(sources.data)
    if edit:
        edit(data)
    semantic, resolver = parse_model(None, replace)
    fmea = load_fmea(FmeaSources(data, sources.lines), semantic, resolver)
    graph = build_impact_graph(semantic)
    return analyze(fmea, graph, semantic, mode), fmea, graph


@pytest.fixture(scope="module")
def fmea_a(sources):
    return build(sources, "fmea")[0]


@pytest.fixture(scope="module")
def fmeca_a(sources):
    return build(sources, "fmeca")[0]


def row(analysis, mode_id):
    return next(r for r in analysis.rows if r.mode_id == mode_id)


@pytest.mark.parametrize("g", GOLDEN, ids=[g[2] for g in GOLDEN])
def test_fmea_rows_match_golden(fmea_a, g):
    item, sru, mode, _, s, o, d, rpn, *_ = g
    r = row(fmea_a, mode)
    assert r.item_id == f"{PA}::{item}" and r.sru == sru
    assert (r.severity, r.occurrence, r.detection, r.rpn) == (s, o, d, rpn)
    assert (r.c_m, r.severity_class, r.probability_level) == (None, None, None)
    assert [x.mode_id for x in fmea_a.ranking] == [x[2] for x in GOLDEN]


@pytest.mark.parametrize("g", GOLDEN, ids=[g[2] for g in GOLDEN])
def test_fmeca_rows_match_golden(fmeca_a, g):
    _, _, mode, lam, s, _, _, _, cm, cls, level = g
    r = row(fmeca_a, mode)
    assert r.severity == s
    assert r.lambda_m == pytest.approx(lam, rel=1e-9)
    assert r.c_m == pytest.approx(cm, rel=1e-9)
    assert (r.severity_class, r.probability_level) == (cls, level)
    assert (r.occurrence, r.detection, r.rpn) == (None, None, None)
    assert [x.mode_id for x in fmeca_a.ranking] == FMECA_ORDER


def test_fmeca_matrix(fmeca_a):
    cells = {k: {r.mode_id for r in v} for k, v in fmeca_a.matrix.items() if v}
    assert cells == {
        ("I", "E"): {"winding_open", "can_babbling", "psu_dead"},
        ("III", "D"): {"cell_short", "capacity_fade"},
        ("IV", "D"): {"soc_lockup"},
        ("IV", "E"): {"hydraulic_leak"},
    }


def test_item_criticality(fmeca_a):
    assert fmeca_a.item_criticality[f"{PA}::driveEcu"] == pytest.approx(6.0e-4)
    assert fmeca_a.item_criticality[f"{PA}::batteryPack::modules"] == pytest.approx(5.0e-3)


def test_derived_occurrence_equals_explicit(sources):
    def edit(data):
        for lib in ("battery_module", "brake_circuit"):
            for m in data[f"library/{lib}.yaml"]["failure_modes"]:
                del m["occurrence"]
        for entry in data["instances.yaml"]:
            for m in entry.get("failure_modes", []):
                del m["occurrence"]
            for sru in entry.get("srus", []):
                for m in sru["failure_modes"]:
                    del m["occurrence"]

    derived, _, _ = build(sources, "fmea", edit=edit)
    assert {r.mode_id: r.occurrence for r in derived.rows} == {g[2]: g[5] for g in GOLDEN}


def test_row_effect_columns(fmea_a):
    r = row(fmea_a, "psu_dead")
    assert r.local_effect == "loss"
    assert set(r.functions) == {"torqueArbitration", "regenBlending", "steeringControl", "gearSelection"}
    texts = {e.text for e in r.next_higher}
    assert "driveController LOST" in texts
    assert {f"{f} LOST" for f in ("SpeedControl", "Maneuvrability", "Lighting", "WindshieldCleaning")} <= texts
    uc = [e for e in r.end_effect if e.layer == "useCase"]
    rq = [e for e in r.end_effect if e.layer == "requirement"]
    assert len(uc) == 9 and len(rq) == 8
    assert r.chain[0].startswith("Requirements::") and r.chain[-1] == f"{PA}::driveEcu"


def test_severity_follows_config(sources):
    def safety9(data):
        data["severity.yaml"]["requirement_groups"]["Safety"] = 9

    a, _, _ = build(sources, "fmea", edit=safety9)
    assert row(a, "psu_dead").severity == 9

    def half(data):
        data["severity.yaml"]["status_factor"]["DEGRADED"] = 0.5

    a, _, _ = build(sources, "fmea", edit=half)
    assert row(a, "cell_short").severity == 5


def test_effect_probability(sources):
    def full(data):
        data["instances.yaml"][0]["srus"][1]["failure_modes"][0]["effect_probability"] = 1.0

    a, _, _ = build(sources, "fmeca", edit=full)
    assert row(a, "can_babbling").c_m == pytest.approx(2 * 1.0e-4)


def test_spof_modes(fmea_a, fmeca_a):
    for a in (fmea_a, fmeca_a):
        assert {r.mode_id for r in spof_modes(a.rows, 8)} == {"winding_open", "can_babbling", "psu_dead"}


def test_flags_carried(fmea_a):
    assert "erroneous_as_loss" in row(fmea_a, "can_babbling").flags
    assert "redundancy_exhausted" in row(fmea_a, "hydraulic_leak").flags
    assert "common_cause" in row(fmea_a, "soc_lockup").flags


def test_architecture_change_recomputes(sources):
    before, _, _ = build(sources, "fmea")
    after, _, _ = build(
        sources, "fmea", replace={"#Indicate dependency from Lighting to Maneuvrability;": ""}
    )
    labels = lambda a: {e.label for e in row(a, "psu_dead").end_effect}
    assert "NightVisibility" in labels(before)
    assert "NightVisibility" not in labels(after)


def test_analyze_requires_valid_mode_data(sources):
    def fmea_only(data):
        for m in data["library/brake_circuit.yaml"]["failure_modes"]:
            del m["mode_ratio"]

    with pytest.raises(FmeaValidationError) as exc:
        build(sources, "fmeca", edit=fmea_only)
    assert exc.value.findings.errors[0].code == "missing-field"
