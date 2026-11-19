"""Properties of the propagation engine, checked on seeded random failure sets."""

from __future__ import annotations

import random

import pytest

from adapters.api.static_paths import resolve_repo_root
from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import EPS, Failure, FailureKind, Layer, Status
from domain.failure.propagate import evaluate
from domain.failure.scenarios import spof
from domain.models import SysmlFile

ROOT = resolve_repo_root() / "examples" / "electric_car"
LOOSE_BOLT = "Spare::Kit::looseBolt"


def _graph(extra: str | None = None):
    files = []
    for path in sorted(ROOT.rglob("*.sysml")):
        rel = path.relative_to(ROOT).as_posix()
        files.append(
            SysmlFile(id=rel, name=path.name, content=path.read_text(encoding="utf-8"), path=rel)
        )
    if extra:
        files.append(SysmlFile("spare.sysml", "spare.sysml", extra, path="spare.sysml"))
    return build_impact_graph(SubsetSysmlParser().parse_project(files).elements)


@pytest.fixture(scope="module")
def graph():
    return _graph()


@pytest.fixture(scope="module")
def graph_with_spare():
    return _graph("package Spare { part def Kit { part looseBolt; } }")


def _random_failures(graph, rng: random.Random, count: int) -> list[Failure]:
    """Valid random failures on physical and logical parts."""
    parts = [
        nid for nid, n in graph.nodes.items() if n.layer in (Layer.PHYSICAL, Layer.LOGICAL)
    ]
    used: dict[str, int] = {}
    out: list[Failure] = []
    for _ in range(count):
        part = rng.choice(parts)
        gate = graph.nodes[part].gate
        kind = rng.choice(list(FailureKind))
        fraction = round(rng.uniform(0.1, 0.9), 1) if kind is FailureKind.DEGRADED else None
        instances = None
        if gate is not None:
            room = gate.n - used.get(part, 0)
            if room < 1:
                continue
            instances = rng.randint(1, room)
            used[part] = used.get(part, 0) + instances
        out.append(Failure(part, kind, fraction, instances))
    return out


@pytest.mark.parametrize("seed", range(50))
def test_more_failures_never_increase_capability(graph, seed):
    rng = random.Random(seed)
    base = _random_failures(graph, rng, rng.randint(1, 4))
    # Extra failures must stay valid together with the base set.
    for _ in range(20):
        extra = _random_failures(graph, rng, rng.randint(1, 3))
        try:
            more = evaluate(graph, [*base, *extra])
        except ValueError:
            continue
        before = evaluate(graph, base)
        for nid, impact in more.items():
            assert impact.capability <= before[nid].capability + EPS, nid
        return
    pytest.skip("no compatible extra failures drawn")


@pytest.mark.parametrize("seed", range(50))
def test_part_implementing_nothing_changes_nothing(graph_with_spare, seed):
    graph = graph_with_spare
    assert LOOSE_BOLT not in graph.nodes
    rng = random.Random(seed)
    failures = _random_failures(graph, rng, rng.randint(1, 4))
    bolt = Failure(LOOSE_BOLT, FailureKind.LOSS)
    assert evaluate(graph, [*failures, bolt]) == evaluate(graph, failures)
    for impact in evaluate(graph, [bolt]).values():
        assert impact.capability == 1.0
        assert impact.status is Status.OK
        assert impact.flags == frozenset()


def test_spof_matches_single_runs(graph):
    rows = spof(graph)
    assert len(rows) == 39
    for row in rows:
        impacts = evaluate(graph, [row.failure])

        def ids(layer, status):
            return {
                nid for nid, n in graph.nodes.items()
                if n.layer is layer and impacts[nid].status is status
            }

        assert set(row.lost_functions) == ids(Layer.FUNCTION, Status.LOST)
        assert set(row.degraded_functions) == ids(Layer.FUNCTION, Status.DEGRADED)
        assert set(row.requirements_at_risk) == (
            ids(Layer.REQUIREMENT, Status.LOST) | ids(Layer.REQUIREMENT, Status.DEGRADED)
        )
        assert impacts[row.part_id].flags <= row.flags


@pytest.mark.parametrize("seed", range(10))
def test_evaluate_is_deterministic(graph, seed):
    failures = _random_failures(graph, random.Random(seed), 4)
    first = evaluate(graph, failures)
    assert evaluate(graph, failures) == first
    assert evaluate(graph, list(reversed(failures))) == first
