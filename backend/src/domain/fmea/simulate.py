"""Monte Carlo over the mission time.

For every trial, item instance and failure mode a time T ~ Exp(lambda_m) is drawn,
lambda_m = lambda_p * alpha * 1e-9 per hour, as `-ln(1 - u) / lambda` (explicit, so
the stream does not depend on the Python version). The first mode of an instance
with T <= t applies (competing risks); SRU modes strike the LRU instance and an
erroneous mode counts as loss. All times are drawn before they are compared with t,
so one seed gives the same sample for every t (common random numbers). The effect of
a failure set is computed by the trace engine and cached per set; beta is not used.
"""

from __future__ import annotations

import math
import random
from collections.abc import Mapping
from dataclasses import dataclass

from domain.failure.model import Failure, ImpactGraph, Status
from domain.failure.propagate import evaluate
from domain.fmea.model import FmeaModel, ModeSpec

FIT = 1e-9


@dataclass
class SimResult:
    trials: int
    seed: int
    mission_time_h: float
    counts: dict[str, dict[Status, int]]  # node -> status -> number of trials

    def p(self, node_id: str, status: Status) -> float:
        return self.counts[node_id][status] / self.trials


@dataclass(frozen=True)
class _Source:
    part_id: str
    instances: int  # how many instances draw times
    group: bool  # the part is a group usage: a failure hits one instance
    modes: tuple[tuple[float, ModeSpec], ...]  # (lambda per hour, mode)


def _sources(fmea: FmeaModel, graph: ImpactGraph) -> list[_Source]:
    out = []
    for item in fmea.items:
        node = graph.nodes.get(item.part_id)
        if node is None:
            continue  # implements nothing: no effect
        modes = tuple(
            ((unit.rate_fit or 0.0) * (m.mode_ratio or 0.0) * FIT, m)
            for unit in item.units
            for m in unit.modes
        )
        if modes:
            out.append(_Source(item.part_id, node.gate.n if node.gate else 1, node.gate is not None, modes))
    return out


def _key(f: Failure) -> tuple:
    return (f.part_id, f.kind.value, f.fraction if f.fraction is not None else -1.0, f.instances or 0)


def simulate(
    fmea: FmeaModel,
    graph: ImpactGraph,
    *,
    trials: int,
    seed: int,
    mission_time_h: float,
) -> SimResult:
    rng = random.Random(seed)
    sources = _sources(fmea, graph)
    counts = {nid: {Status.LOST: 0, Status.DEGRADED: 0} for nid in graph.nodes}
    cache: dict[tuple, list[tuple[str, Status]]] = {}
    for _ in range(trials):
        failures: list[Failure] = []
        for src in sources:
            for _instance in range(src.instances):
                best_time, best_mode = math.inf, None
                for lam, mode in src.modes:  # draw every time, even when lam is 0
                    u = rng.random()
                    t = -math.log(1.0 - u) / lam if lam > 0 else math.inf
                    if t < best_time:
                        best_time, best_mode = t, mode
                if best_mode is not None and best_time <= mission_time_h:
                    failures.append(
                        Failure(src.part_id, best_mode.kind, best_mode.fraction, 1 if src.group else None)
                    )
        if not failures:
            continue
        canonical = tuple(sorted(failures, key=_key))
        if canonical not in cache:
            impacts = evaluate(graph, canonical)
            cache[canonical] = [
                (nid, imp.status) for nid, imp in impacts.items() if imp.status is not Status.OK
            ]
        for nid, status in cache[canonical]:
            counts[nid][status] += 1
    return SimResult(trials, seed, mission_time_h, counts)
