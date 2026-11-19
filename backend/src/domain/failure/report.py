"""Text, markdown and JSON reports of an impact evaluation.

Text and markdown use short names; JSON uses full ids.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

from domain.failure.model import Failure, FailureKind, GateKind, Impact, ImpactGraph, Layer, Status
from domain.failure.propagate import (
    affected_nodes,
    chain,
    common_cause_targets,
    failure_flags,
    gate_result,
    instance_vector,
)
from domain.failure.scenarios import SpofRow


# -- names ---------------------------------------------------------------


def short_name(graph: ImpactGraph, nid: str) -> str:
    """Name of a node; physical parts are shown with their physical owners (`a.b`)."""
    names = [graph.nodes[nid].name]
    while nid in graph.parent:
        nid = graph.parent[nid]
        names.append(graph.nodes[nid].name)
    return ".".join(reversed(names))


def _tail_id(nid: str) -> str:
    return nid.split("::", 1)[1] if "::" in nid else nid


def _flag_text(flag: str) -> str:
    return flag.replace("_", " ")


def _percent(capability: float) -> str:
    return f"{round(capability * 100, 1):g} %"


def _num(x: float) -> str:
    return f"{x:g}"


def _failure_text(graph: ImpactGraph, f: Failure) -> str:
    text = f.kind.value
    if f.kind is FailureKind.DEGRADED and f.fraction is not None:
        text += f" {_num(f.fraction)}"
    if f.instances is not None:
        gate = graph.nodes[f.part_id].gate if f.part_id in graph.nodes else None
        text += f" ({f.instances} of {gate.n} instances)" if gate else f" ({f.instances} instances)"
    return text


# -- causal chains -------------------------------------------------------


def _gate_suffix(
    graph: ImpactGraph, failures: Sequence[Failure], impacts: Mapping[str, Impact], nid: str
) -> str:
    limit = impacts[nid].limited_by
    gate = graph.nodes[nid].gate
    if gate is None or limit is None or limit != (nid, limit[1]) or limit[1] not in ("pool", "kofn"):
        return ""
    result = gate_result(graph, nid, instance_vector(graph, failures, nid))
    if gate.kind is GateKind.POOL:
        return (
            f" pool {result.alive}/{gate.n} ({_num(result.surviving)} of "
            f"{_num(sum(gate.capacities))}, required {_num(gate.required)})"
        )
    return f" kofn {result.alive}/{gate.n} (required {_num(gate.required)})"


def _chain_text(
    graph: ImpactGraph, failures: Sequence[Failure], impacts: Mapping[str, Impact], fn: str
) -> str:
    parts: list[str] = []
    cur = fn
    seen = {fn}
    while True:
        limit = impacts[cur].limited_by
        if limit is None or limit[0] in seen:
            break
        src, label = limit
        if label.startswith("#"):
            parts.append(f"{label} {short_name(graph, src)}")
            return " ".join(parts)  # the listed function carries its own chain
        parts.append(short_name(graph, src) if label == "node" else f"«{label}» {short_name(graph, src)}")
        seen.add(src)
        cur = src
    return " ".join(parts) + _gate_suffix(graph, failures, impacts, cur)


# -- summaries -----------------------------------------------------------


def _flag_lines(
    graph: ImpactGraph, failures: Sequence[Failure], impacts: Mapping[str, Impact]
) -> list[str]:
    lines: list[str] = []
    for part in dict.fromkeys(f.part_id for f in failures if f.part_id in graph.nodes):
        gate = graph.nodes[part].gate
        flags = impacts[part].flags
        if gate is None:
            continue
        result = gate_result(graph, part, instance_vector(graph, failures, part))
        alive = result.alive
        if "redundancy_exhausted" in flags:
            lines.append(
                f"FLAGS     redundancy exhausted: {_tail_id(part)} "
                f"({alive} of {gate.n}, required {_num(gate.required)})"
            )
        if "pool_at_minimum" in flags:
            lines.append(
                f"FLAGS     pool at minimum: {_tail_id(part)} "
                f"({alive} of {gate.n}, {_num(result.surviving)} of {_num(sum(gate.capacities))}, "
                f"required {_num(gate.required)})"
            )
    erroneous = [f for f in failures if f.kind is FailureKind.ERRONEOUS]
    if erroneous:
        names = ", ".join(sorted({short_name(graph, f.part_id) for f in erroneous if f.part_id in graph.nodes}))
        lines.append(f"FLAGS     erroneous treated as loss: {names}")
    cyclic = sorted(
        graph.nodes[n].name for n, i in impacts.items() if "cycle" in i.flags and graph.nodes[n].layer is Layer.FUNCTION
    )
    if cyclic:
        lines.append(f"FLAGS     cycle: {', '.join(cyclic)}")
    return lines


def _common_cause_text(graph: ImpactGraph, f: Failure) -> str:
    if "common_cause" not in failure_flags(graph, f):
        return ""
    names = sorted(graph.nodes[t].name for t in common_cause_targets(graph, f.part_id))
    return f"  [common cause: {', '.join(names)}]"


def _listing(graph: ImpactGraph, impacts: Mapping[str, Impact], layer: Layer, status: Status) -> str:
    items = []
    for n in sorted(
        (n for n in affected_nodes(graph, impacts, layer) if impacts[n].status is status),
        key=lambda n: graph.nodes[n].name,
    ):
        name = graph.nodes[n].name
        items.append(name if status is Status.LOST else f"{name} ({_percent(impacts[n].capability)})")
    return ", ".join(items)


# -- text ----------------------------------------------------------------


def to_text(graph: ImpactGraph, failures: Sequence[Failure], impacts: Mapping[str, Impact]) -> str:
    lines = [
        f"FAILURE   {f.part_id}  {_failure_text(graph, f)}{_common_cause_text(graph, f)}"
        for f in failures
    ]
    functions = affected_nodes(graph, impacts, Layer.FUNCTION)
    width = max((len(graph.nodes[f].name) for f in functions), default=0)
    for fn in functions:
        impact = impacts[fn]
        pct = _percent(impact.capability) if impact.status is Status.DEGRADED else ""
        row = f"{impact.status.value:<9} {graph.nodes[fn].name:<{width}}  {pct:<8} ← "
        lines.append(row + _chain_text(graph, failures, impacts, fn))
    if not functions:
        lines.append("RESULT    no function is lost or degraded")
    for status, word in ((Status.LOST, "lost"), (Status.DEGRADED, "degraded")):
        text = _listing(graph, impacts, Layer.USE_CASE, status)
        if text:
            lines.append(f"USE CASES {word}: {text}")
    lost_or_degraded = [
        _listing(graph, impacts, Layer.REQUIREMENT, s) for s in (Status.LOST, Status.DEGRADED)
    ]
    text = ", ".join(t for t in lost_or_degraded if t)
    if text:
        lines.append(f"REQUIREMENTS at risk: {text}")
    lines.extend(_flag_lines(graph, failures, impacts))
    return "\n".join(lines) + "\n"


# -- markdown ------------------------------------------------------------


def _table(header: Sequence[str], rows: Sequence[Sequence[str]]) -> list[str]:
    out = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    out.extend("| " + " | ".join(row) + " |" for row in rows)
    return out


def to_markdown(graph: ImpactGraph, failures: Sequence[Failure], impacts: Mapping[str, Impact]) -> str:
    out = ["# Failure impact", "", "## Failures", ""]
    out += _table(
        ["Part", "Failure", "Flags"],
        [
            [
                f"`{f.part_id}`",
                _failure_text(graph, f),
                ", ".join(_flag_text(x) for x in sorted(_run_flags(graph, impacts, f))),
            ]
            for f in failures
        ],
    )
    sections = (
        ("Functions", "Function", Layer.FUNCTION, True),
        ("Use cases", "Use case", Layer.USE_CASE, False),
        ("Requirements", "Requirement", Layer.REQUIREMENT, False),
    )
    for title, column, layer, with_cause in sections:
        out += ["", f"## {title}", ""]
        nodes = affected_nodes(graph, impacts, layer)
        if with_cause:
            rows = [
                [
                    impacts[n].status.value,
                    graph.nodes[n].name,
                    _percent(impacts[n].capability),
                    _chain_text(graph, failures, impacts, n),
                ]
                for n in nodes
            ]
            out += _table(["Status", column, "Capability", "Cause"], rows)
        else:
            rows = [
                [impacts[n].status.value, graph.nodes[n].name, _percent(impacts[n].capability)]
                for n in nodes
            ]
            out += _table(["Status", column, "Capability"], rows)
    return "\n".join(out) + "\n"


def _run_flags(graph: ImpactGraph, impacts: Mapping[str, Impact], f: Failure) -> frozenset[str]:
    """Flags of a failure: common cause plus the gate flags of the failed part."""
    own = impacts[f.part_id].flags if f.part_id in impacts else frozenset()
    return failure_flags(graph, f) | own


def _no_effect_notes(graph: ImpactGraph, failures: Sequence[Failure]) -> list[str]:
    return [
        f"{f.part_id} implements nothing; it has no effect"
        for f in failures
        if f.part_id not in graph.nodes
    ]


# -- json ----------------------------------------------------------------


def to_json_dict(
    graph: ImpactGraph, failures: Sequence[Failure], impacts: Mapping[str, Impact]
) -> dict[str, Any]:
    nodes = {
        nid: {
            "layer": graph.nodes[nid].layer.value,
            "capability": impact.capability,
            "status": impact.status.value,
            "limitedBy": (
                {"id": impact.limited_by[0], "label": impact.limited_by[1]}
                if impact.limited_by
                else None
            ),
            "flags": sorted(impact.flags),
            "chain": chain(impacts, nid),
        }
        for nid, impact in impacts.items()
    }
    return {
        "failures": [
            {
                "partId": f.part_id,
                "kind": f.kind.value,
                "fraction": f.fraction,
                "instances": f.instances,
                "flags": sorted(_run_flags(graph, impacts, f)),
            }
            for f in failures
        ],
        "nodes": nodes,
        "functions": affected_nodes(graph, impacts, Layer.FUNCTION),
        "useCases": affected_nodes(graph, impacts, Layer.USE_CASE),
        "requirements": affected_nodes(graph, impacts, Layer.REQUIREMENT),
        "warnings": [*graph.warnings, *_no_effect_notes(graph, failures)],
    }


# -- single points of failure ---------------------------------------------

_SPOF_HEADER = ["Part", "Lost functions", "Degraded functions", "Requirements at risk", "Flags"]


def _spof_cells(graph: ImpactGraph, row: SpofRow) -> list[str]:
    def names(ids: Sequence[str]) -> str:
        return ", ".join(graph.nodes[i].name for i in ids)

    return [
        _tail_id(row.part_id),
        names(row.lost_functions),
        names(row.degraded_functions),
        names(row.requirements_at_risk),
        ", ".join(_flag_text(f) for f in sorted(row.flags)),
    ]


def _spof_order(rows: Sequence[SpofRow]) -> list[SpofRow]:
    """Rows that lose a function first; model order within each group."""
    return [r for r in rows if r.lost_functions] + [r for r in rows if not r.lost_functions]


def spof_to_markdown(graph: ImpactGraph, rows: Sequence[SpofRow]) -> str:
    cells = [_spof_cells(graph, r) for r in _spof_order(rows)]
    return "\n".join(_table(_SPOF_HEADER, cells)) + "\n"


def spof_to_text(graph: ImpactGraph, rows: Sequence[SpofRow]) -> str:
    """One line per part; only the part column is aligned, the lists can be long."""
    cells = [_SPOF_HEADER] + [_spof_cells(graph, r) for r in _spof_order(rows)]
    width = max(len(c[0]) for c in cells)
    return "\n".join(
        (row[0].ljust(width) + "  " + " | ".join(row[1:])).rstrip() for row in cells
    ) + "\n"


def spof_to_json_list(graph: ImpactGraph, rows: Sequence[SpofRow]) -> list[dict[str, Any]]:
    return [
        {
            "partId": r.part_id,
            "failure": {
                "kind": r.failure.kind.value,
                "fraction": r.failure.fraction,
                "instances": r.failure.instances,
            },
            "lostFunctions": list(r.lost_functions),
            "degradedFunctions": list(r.degraded_functions),
            "requirementsAtRisk": list(r.requirements_at_risk),
            "flags": sorted(r.flags),
        }
        for r in rows
    ]
