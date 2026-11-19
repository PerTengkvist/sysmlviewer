"""Capability propagation (fixpoint of `min`) over the impact graph.

c(x) = min(own(x), c(parent(x)), min over inputs of c(input))

where a soft input contributes max(c, SOFT_FLOOR). Values only decrease and
come from a finite set, so the iteration terminates even with cycles.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from typing import NamedTuple

from domain.failure.model import (
    EPS,
    Failure,
    FailureKind,
    GateKind,
    Impact,
    ImpactGraph,
    Layer,
    Status,
    status_of,
)

SOFT_FLOOR = 0.5
_SPREADING_FLAGS = frozenset({"redundancy_exhausted", "pool_at_minimum"})
_LAYER_RANK = {
    Layer.PHYSICAL: 0,
    Layer.LOGICAL: 1,
    Layer.FUNCTION_NODE: 2,
    Layer.FUNCTION: 3,
    Layer.USE_CASE: 4,
    Layer.REQUIREMENT: 5,
}


def instance_vector(
    graph: ImpactGraph, failures: Iterable[Failure], part_id: str
) -> tuple[float, ...]:
    """Per-instance state of a part: lost instances first, then degraded, rest 1."""
    node = graph.nodes[part_id]
    n = node.gate.n if node.gate else 1
    lost = 0
    degraded: list[float] = []
    for f in failures:
        if f.part_id != part_id:
            continue
        if f.instances is not None and node.gate is None:
            raise ValueError(f"'{part_id}' has no instances; cannot fail {f.instances} of them")
        count = n if f.instances is None else f.instances
        if count > n:
            raise ValueError(
                f"cannot fail {count} instances of '{part_id}': it has {n} instances"
            )
        if f.kind is FailureKind.DEGRADED:
            degraded.extend([f.fraction if f.fraction is not None else 0.0] * count)
        else:
            lost += count
    degraded.sort()
    if lost + len(degraded) > n and node.gate is not None:
        raise ValueError(f"failures on '{part_id}' exceed its {n} instances")
    lost = min(lost, n)
    vector = [0.0] * lost + degraded[: n - lost]
    vector += [1.0] * (n - len(vector))
    return tuple(vector)


class GateResult(NamedTuple):
    capability: float
    label: str  # what limits the part: "failure", "pool" or "kofn"
    flags: frozenset[str]
    surviving: float  # surviving capacity (pool) or instance count
    alive: int  # instances that still work


def gate_result(graph: ImpactGraph, part_id: str, vector: Sequence[float]) -> GateResult:
    """Capability, label, flags and survivors of a part from its instance vector."""
    gate = graph.nodes[part_id].gate
    alive = sum(1 for v in vector if v > EPS)
    if gate is None or gate.kind is GateKind.AND:
        return GateResult(min(vector), "failure", frozenset(), sum(vector), alive)
    if gate.kind is GateKind.POOL:
        surviving = sum(c * v for c, v in zip(gate.capacities, vector))
        total = sum(gate.capacities)
        if surviving < gate.required - EPS:
            return GateResult(0.0, "pool", frozenset(), surviving, alive)
        flags = (
            frozenset({"pool_at_minimum"})
            if gate.required > 0 and abs(surviving - gate.required) <= EPS
            else frozenset()
        )
        return GateResult((surviving / total if total else 0.0), "pool", flags, surviving, alive)
    k = int(round(gate.required))
    ordered = sorted(vector, reverse=True)
    if k < 1:
        return GateResult(1.0, "kofn", frozenset(), float(alive), alive)
    if k > len(ordered):
        return GateResult(0.0, "kofn", frozenset(), float(alive), alive)
    value = ordered[k - 1]
    exhausted = alive == k or (alive > k and value < 1 - EPS)
    flags = frozenset({"redundancy_exhausted"}) if exhausted else frozenset()
    return GateResult(value, "kofn", flags, float(alive), alive)


def _order(graph: ImpactGraph) -> list[str]:
    def depth(nid: str) -> int:
        d = 0
        while nid in graph.parent:
            nid = graph.parent[nid]
            d += 1
        return d

    return sorted(
        graph.nodes,
        key=lambda nid: (_LAYER_RANK[graph.nodes[nid].layer], depth(nid)),
    )


def _cycle_nodes(graph: ImpactGraph) -> set[str]:
    """Nodes that lie on a cycle of the dependency relation (iterative Tarjan)."""
    succ: dict[str, list[str]] = {nid: [] for nid in graph.nodes}
    for nid in graph.nodes:
        if nid in graph.parent:
            succ[nid].append(graph.parent[nid])
        succ[nid].extend(e.source for e in graph.inputs.get(nid, ()))
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    on_stack: set[str] = set()
    stack: list[str] = []
    result: set[str] = set()
    counter = 0
    for root in graph.nodes:
        if root in index:
            continue
        work = [(root, 0)]
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)
        while work:
            node, i = work.pop()
            if i < len(succ[node]):
                work.append((node, i + 1))
                nxt = succ[node][i]
                if nxt not in index:
                    index[nxt] = low[nxt] = counter
                    counter += 1
                    stack.append(nxt)
                    on_stack.add(nxt)
                    work.append((nxt, 0))
                elif nxt in on_stack:
                    low[node] = min(low[node], index[nxt])
            else:
                if work:
                    parent = work[-1][0]
                    low[parent] = min(low[parent], low[node])
                if low[node] == index[node]:
                    component = []
                    while True:
                        member = stack.pop()
                        on_stack.discard(member)
                        component.append(member)
                        if member == node:
                            break
                    if len(component) > 1 or node in succ[node]:
                        result.update(component)
    return result


def evaluate(graph: ImpactGraph, failures: Iterable[Failure]) -> dict[str, Impact]:
    """Capability, status, limiting input and flags of every node."""
    failures = list(failures)
    own: dict[str, float] = {}
    own_label: dict[str, str] = {}
    flags: dict[str, set[str]] = {nid: set() for nid in graph.nodes}
    for part_id in dict.fromkeys(f.part_id for f in failures):
        if part_id not in graph.nodes:
            continue  # implements nothing: no effect
        vector = instance_vector(graph, failures, part_id)
        value, label, gate_flags, _, _ = gate_result(graph, part_id, vector)
        own[part_id] = value
        own_label[part_id] = label
        flags[part_id] |= gate_flags
        if any(
            f.part_id == part_id and f.kind is FailureKind.ERRONEOUS for f in failures
        ) and value < 1 - EPS:
            flags[part_id].add("erroneous_as_loss")

    order = _order(graph)
    cap = {nid: own.get(nid, 1.0) for nid in order}
    changed = True
    while changed:
        changed = False
        for nid in order:
            value = cap[nid]
            parent = graph.parent.get(nid)
            if parent is not None and cap[parent] < value:
                value = cap[parent]
            for edge in graph.inputs.get(nid, ()):
                x = cap[edge.source]
                if edge.soft and x < SOFT_FLOOR:
                    x = SOFT_FLOOR
                if x < value:
                    value = x
            if value < cap[nid]:
                cap[nid] = value
                changed = True

    # Flags spread downstream.
    changed = True
    while changed:
        changed = False
        for nid in order:
            sources = [graph.parent[nid]] if nid in graph.parent else []
            sources += [e.source for e in graph.inputs.get(nid, ())]
            for src in sources:
                add = flags[src] if cap[src] < 1 - EPS else flags[src] & _SPREADING_FLAGS
                if not add <= flags[nid]:
                    flags[nid] |= add
                    changed = True
    if any(v < 1 - EPS for v in cap.values()):
        for nid in _cycle_nodes(graph):
            if cap[nid] < 1 - EPS:
                flags[nid].add("cycle")

    limits = _limits(graph, order, cap, own, own_label)
    result: dict[str, Impact] = {}
    for nid in order:
        result[nid] = Impact(
            cap[nid], status_of(cap[nid]), limits[nid], frozenset(flags[nid])
        )
    return {nid: result[nid] for nid in graph.nodes}


def _limits(
    graph: ImpactGraph,
    order: Sequence[str],
    cap: Mapping[str, float],
    own: Mapping[str, float],
    own_label: Mapping[str, str],
) -> dict[str, tuple[str, str] | None]:
    """The input that limits each node.

    Among inputs that give the minimum, the one closest to a failed part wins
    (distance along limiting inputs), then model order. That keeps a cycle from
    pointing round and round without ever reaching the failure.
    """
    eligible: dict[str, list[tuple[str, str]]] = {}
    dist: dict[str, float] = {}
    for nid in order:
        value = cap[nid]
        if value >= 1 - EPS:
            continue
        cands: list[tuple[float, str, str]] = []
        if nid in own and own[nid] < 1 - EPS:
            cands.append((own[nid], nid, own_label[nid]))
        parent = graph.parent.get(nid)
        if parent is not None:
            cands.append((cap[parent], parent, "contained in"))
        for edge in graph.inputs.get(nid, ()):
            x = cap[edge.source]
            if edge.soft and x < SOFT_FLOOR:
                x = SOFT_FLOOR
            cands.append((x, edge.source, edge.label))
        eligible[nid] = [(src, label) for x, src, label in cands if x <= value + EPS]
        own_limits = bool(eligible[nid]) and eligible[nid][0][0] == nid
        dist[nid] = 0 if own_limits else math.inf
    changed = True
    while changed:
        changed = False
        for nid, cands in eligible.items():
            for src, _ in cands:
                if src != nid and dist.get(src, math.inf) + 1 < dist[nid]:
                    dist[nid] = dist[src] + 1
                    changed = True
    result: dict[str, tuple[str, str] | None] = {}
    for nid in order:
        cands = eligible.get(nid)
        if not cands:
            result[nid] = None
            continue
        best = min(range(len(cands)), key=lambda k: (dist.get(cands[k][0], math.inf), k))
        result[nid] = cands[best]
    return result


def chain(impacts: Mapping[str, Impact], node_id: str) -> list[str]:
    """Causal chain from `node_id` back to the failed part (nodes, excluding itself)."""
    out: list[str] = []
    seen = {node_id}
    current = node_id
    while True:
        limit = impacts[current].limited_by
        if limit is None or limit[0] in seen:
            return out
        out.append(limit[0])
        seen.add(limit[0])
        current = limit[0]


def common_cause_targets(graph: ImpactGraph, part_id: str) -> list[str]:
    """Logical parts implemented by a part and its descendants, in model order."""
    subtree = {part_id}
    grew = True
    while grew:
        grew = False
        for child, parent in graph.parent.items():
            if parent in subtree and child not in subtree:
                subtree.add(child)
                grew = True
    targets = [
        nid
        for nid, edges in graph.inputs.items()
        if graph.nodes[nid].layer is Layer.LOGICAL
        and any(e.label == "implements" and e.source in subtree for e in edges)
    ]
    return [nid for nid in graph.nodes if nid in set(targets)]


def failure_flags(graph: ImpactGraph, failure: Failure) -> frozenset[str]:
    if failure.part_id in graph.nodes and len(common_cause_targets(graph, failure.part_id)) >= 2:
        return frozenset({"common_cause"})
    return frozenset()


def affected_nodes(
    graph: ImpactGraph, impacts: Mapping[str, Impact], layer: Layer
) -> list[str]:
    """Nodes of a layer that are not OK: LOST before DEGRADED, then by id."""
    rank = {Status.LOST: 0, Status.DEGRADED: 1}
    hit = [
        nid
        for nid, node in graph.nodes.items()
        if node.layer is layer and impacts[nid].status in rank
    ]
    return sorted(hit, key=lambda nid: (rank[impacts[nid].status], nid))
