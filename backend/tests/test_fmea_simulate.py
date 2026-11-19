"""Monte Carlo simulation against analytic cases (step 20).

Tolerance per case: 4 * sqrt(p(1-p)/N) with p the analytic probability, that is four
sigma (false alarm rate about 6e-5). With a fixed seed the outcome is reproducible.
"""

from __future__ import annotations

import csv
import io
import math
import time

import pytest

from adapters.fmea.yaml_source import read_fmea_dir
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Layer, Status
from domain.fmea.load import FmeaSources, load_fmea
from domain.fmea.simulate import simulate
from domain.models import SysmlFile
from domain.name_resolution import ImportSpec, NameResolver
from test_fmea_cli import CAR, REPO, cli, run  # noqa: F401
from test_fmea_load import parse_model

N = 20000


def tol(p: float, n: int = N) -> float:
    return 4 * math.sqrt(p * (1 - p) / n)


SEVERITY = {
    "requirement_groups": {"Safety": 10},
    "status_factor": {"LOST": 1.0, "DEGRADED": 0.6},
    "mission_time_h": 10000,
}


def synthetic(structure: str, rate_fit: float, ratio: float = 1.0, beta: float = 1.0):
    text = f"""package P {{
      part def U;
      part def Log {{ part l; }}
      part def F {{ part n; }}
      allocate F::n to Log::l;
      part def V {{ {structure}
        #implements dependency from V::units to Log::l; }}
    }}"""
    result = SubsetSysmlParser().parse_project([SysmlFile("m.sysml", "m.sysml", text, path="m.sysml")])
    assert result.warnings == []
    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    library = {
        "part_def": "P::U",
        "rate_fit": rate_fit,
        "failure_modes": [
            {"id": "dead", "local_effect": {"kind": "loss"}, "mode_ratio": ratio, "effect_probability": beta}
        ],
    }
    fmea = load_fmea(FmeaSources({"severity.yaml": SEVERITY, "library/u.yaml": library}, {}), result.elements, resolver)
    return fmea, build_impact_graph(result.elements)


def binom_at_least(n, k, r):
    return sum(math.comb(n, i) * r**i * (1 - r) ** (n - i) for i in range(k, n + 1))


def test_deterministic_with_seed():
    fmea, graph = synthetic("#Redundant part units[3] : U; attribute unitsRequired = 2;", 50000)
    a = simulate(fmea, graph, trials=2000, seed=7, mission_time_h=10000)
    b = simulate(fmea, graph, trials=2000, seed=7, mission_time_h=10000)
    c = simulate(fmea, graph, trials=2000, seed=8, mission_time_h=10000)
    assert a.counts == b.counts
    assert a.counts != c.counts


def test_k_of_n_matches_analytic():
    fmea, graph = synthetic("#Redundant part units[3] : U; attribute unitsRequired = 2;", 50000)
    r = math.exp(-0.5)
    expected = 1 - binom_at_least(3, 2, r)
    assert expected == pytest.approx(0.3426, abs=1e-3)
    res = simulate(fmea, graph, trials=20000, seed=1, mission_time_h=10000)
    assert abs(res.p("P::F", Status.LOST) - expected) < tol(expected)


def test_one_of_two_matches_analytic():
    fmea, graph = synthetic("#Redundant part units[2] : U; attribute unitsRequired = 1;", 50000)
    expected = (1 - math.exp(-0.5)) ** 2
    res = simulate(fmea, graph, trials=20000, seed=1, mission_time_h=10000)
    assert abs(res.p("P::F", Status.LOST) - expected) < tol(expected)


def test_pool_matches_analytic():
    fmea, graph = synthetic(
        "#Pool part units[8] : U { attribute capacityKWh = 7.5; } attribute required = 45;", 10000
    )
    r = math.exp(-0.1)
    lost = 1 - binom_at_least(8, 6, r)
    degraded = binom_at_least(8, 6, r) - r**8
    assert lost == pytest.approx(0.0335, abs=1e-3) and degraded == pytest.approx(0.517, abs=1e-3)
    res = simulate(fmea, graph, trials=20000, seed=1, mission_time_h=10000)
    assert abs(res.p("P::F", Status.LOST) - lost) < tol(lost)
    assert abs(res.p("P::F", Status.DEGRADED) - degraded) < tol(degraded)


def test_single_part_matches_analytic():
    fmea, graph = synthetic("part units : U;", 20000)
    res = simulate(fmea, graph, trials=20000, seed=1, mission_time_h=10000)
    expected = 1 - math.exp(-0.2)
    assert abs(res.p("P::F", Status.LOST) - expected) < tol(expected)


def test_mode_ratio_scales_the_rate():
    """alpha 0.5 and 40000 FIT give lambda_m = 20000 FIT, lambda t = 0.2."""
    fmea, graph = synthetic("part units : U;", 40000, ratio=0.5)
    res = simulate(fmea, graph, trials=N, seed=1, mission_time_h=10000)
    expected = 1 - math.exp(-0.2)
    assert abs(res.p("P::F", Status.LOST) - expected) < tol(expected)
    # ignoring alpha would give 1 - exp(-0.4) = 0.33, far outside the tolerance
    assert abs(res.p("P::F", Status.LOST) - (1 - math.exp(-0.4))) > 0.05


def test_effect_probability_is_not_used():
    """Decision B9: beta enters C_m only, never the simulation."""
    fmea, graph = synthetic("part units : U;", 20000, beta=0.5)
    res = simulate(fmea, graph, trials=N, seed=1, mission_time_h=10000)
    expected = 1 - math.exp(-0.2)
    assert abs(res.p("P::F", Status.LOST) - expected) < tol(expected)
    same = simulate(synthetic("part units : U;", 20000, beta=1.0)[0], graph, trials=N, seed=1, mission_time_h=10000)
    assert res.counts == same.counts


def test_longer_mission_never_lowers_loss():
    fmea, graph = synthetic("#Redundant part units[3] : U; attribute unitsRequired = 2;", 50000)
    short = simulate(fmea, graph, trials=3000, seed=3, mission_time_h=5000)
    long_ = simulate(fmea, graph, trials=3000, seed=3, mission_time_h=10000)
    for nid in graph.nodes:
        assert short.counts[nid][Status.LOST] <= long_.counts[nid][Status.LOST]


def test_electric_car_simulation_smoke():
    semantic, resolver = parse_model()
    fmea = load_fmea(read_fmea_dir(CAR / "fmea"), semantic, resolver)
    graph = build_impact_graph(semantic)
    start = time.time()
    res = simulate(fmea, graph, trials=500, seed=1, mission_time_h=10000)
    assert time.time() - start < 10
    for nid in graph.nodes:
        for status in (Status.LOST, Status.DEGRADED):
            assert 0 <= res.p(nid, status) <= 1
    assert res.p("Functions::Climate", Status.LOST) == res.p("Functions::Entertainment", Status.LOST)


def test_cli_simulate(cli, capsys):  # noqa: F811
    code, out, err = run(cli, capsys, "simulate", CAR, "--trials", 500, "--seed", 1, "--format", "csv")
    assert code == 0, err
    rows = list(csv.DictReader(io.StringIO(out)))
    assert list(rows[0]) == ["Node", "Layer", "P(LOST)", "P(DEGRADED)"]
    layers = {r["Layer"] for r in rows}
    assert {"function", "useCase"} <= layers


def test_cli_simulate_aborts_on_drift(cli, capsys, tmp_path):  # noqa: F811
    import shutil

    dst = tmp_path / "car"
    shutil.copytree(CAR, dst, ignore=shutil.ignore_patterns("icons", "views", "state.json"))
    f = dst / "physical_architecture" / "vehicle_physical.sysml"
    f.write_text(f.read_text(encoding="utf-8").replace("electricMotor", "tractionMotor"), encoding="utf-8")
    code, out, err = run(cli, capsys, "simulate", dst)
    assert code == 1 and out == "" and "out of sync" in err
