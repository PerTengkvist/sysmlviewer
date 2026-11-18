"""Capability propagation (fixpoint of `min`) over the impact graph.

c(x) = min(own(x), c(parent(x)), min over inputs of c(input))

where a soft input contributes max(c, SOFT_FLOOR). Values only decrease and
come from a finite set, so the iteration terminates even with cycles.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence

from domain.failure.model import (
    EPS,
    Failure,
    FailureKind,
    GateKind,
    Impact,
    ImpactGraph,
    Layer,
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


def _gate_value(graph: ImpactGraph, part_id: str, vector: Sequence[float]) -> tuple[float, str, frozenset[str]]:
    """(capability, limiting label, flags) of a part from its instance vector."""
    gate = graph.nodes[part_id].gate
    if gate is None or gate.kind is GateKind.AND:
        return min(vector), "failure", frozenset()
    if gate.kind is GateKind.POOL:
        surviving = sum(c * v for c, v in zip(gate.capacities, vector))
        total = sum(gate.capacities)
        if surviving < gate.required - EPS:
            return 0.0, "pool", frozenset()
        flags = (
            frozenset({"pool_at_minimum"})
            if gate.required > 0 and abs(surviving - gate.required) <= EPS
            else frozenset()
        )
        return (surviving / total if total else 0.0), "pool", flags
    k = int(round(gate.required))
    ordered = sorted(vector, reverse=True)
    if k < 1:
        return 1.0, "kofn", frozenset()
    if k > len(ordered):
        return 0.0, "kofn", frozenset()
    value = ordered[k - 1]
    survivors = sum(1 for v in vector if v > EPS)
    exhausted = survivors == k or (survivors > k and value < 1 - EPS)
    return value, "kofn", frozenset({"redundancy_exhausted"}) if exhausted else frozenset()


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
        value, label, gate_flags = _gate_value(graph, part_id, vector)
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

    result: dict[str, Impact] = {}
    for nid in order:
        result[nid] = Impact(
            cap[nid],
            status_of(cap[nid]),
            _limited_by(graph, nid, cap, own, own_label),
            frozenset(flags[nid]),
        )
    return {nid: result[nid] for nid in graph.nodes}


def _limited_by(
    graph: ImpactGraph,
    nid: str,
    cap: Mapping[str, float],
    own: Mapping[str, float],
    own_label: Mapping[str, str],
) -> tuple[str, str] | None:
    value = cap[nid]
    if value >= 1 - EPS:
        return None
    candidates: list[tuple[float, str, str]] = []
    if nid in own and own[nid] < 1 - EPS:
        candidates.append((own[nid], nid, own_label[nid]))
    parent = graph.parent.get(nid)
    if parent is not None:
        candidates.append((cap[parent], parent, "contained in"))
    for edge in graph.inputs.get(nid, ()):
        x = cap[edge.source]
        if edge.soft and x < SOFT_FLOOR:
            x = SOFT_FLOOR
        candidates.append((x, edge.source, edge.label))
    eligible = [c for c in candidates if c[0] <= value + EPS]
    for _, src, label in eligible:
        if src in own and own[src] < 1 - EPS:
            return (src, label)
    _, src, label = eligible[0]
    return (src, label)


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
