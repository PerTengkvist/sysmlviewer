"""Failure targets by name, and the single-point-of-failure table."""

from __future__ import annotations

import difflib
from collections.abc import Mapping
from dataclasses import dataclass

from domain.failure.model import Failure, FailureKind, ImpactGraph, Layer, Status
from domain.failure.propagate import affected_nodes, evaluate, failure_flags
from domain.models import ArtifactKind, SemanticElement
from domain.name_resolution import NameResolver


class AmbiguousName(ValueError):
    def __init__(self, ref: str, candidates: list[str]) -> None:
        super().__init__(f"ambiguous part {ref!r}: {', '.join(candidates)}")
        self.ref = ref
        self.candidates = candidates


class UnknownName(ValueError):
    def __init__(self, ref: str, suggestions: list[str]) -> None:
        super().__init__(f"unknown part {ref!r}")
        self.ref = ref
        self.suggestions = suggestions


def _is_candidate(el: SemanticElement) -> bool:
    return (
        el.kind == ArtifactKind.PART
        and not el.is_definition
        and "subject" not in (el.metadata_keywords or [])
    )


def resolve_failure_target(
    ref: str, semantic: Mapping[str, SemanticElement], resolver: NameResolver
) -> str:
    """Resolve a part name from `--fail` to a part usage id.

    First as a name from the root namespace (fully qualified names, `Pkg::X::a.b`),
    then as a suffix of whole segments, where `.` counts as `::`.
    """
    res = resolver.resolve_feature_ref(ref, None, "")
    found = semantic.get(res.element_id) if res.element_id else None
    if found is not None and _is_candidate(found):
        return found.id
    segments = [s for s in ref.replace(".", "::").split("::") if s]
    candidates = {eid: el for eid, el in semantic.items() if _is_candidate(el)}
    hits = sorted(
        eid for eid in candidates if segments and eid.split("::")[-len(segments):] == segments
    )
    if len(hits) == 1:
        return hits[0]
    if hits:
        raise AmbiguousName(ref, hits)
    names = sorted({el.name for el in candidates.values()})
    last = segments[-1] if segments else ref
    raise UnknownName(ref, difflib.get_close_matches(last, names, n=3, cutoff=0.6))


@dataclass(frozen=True)
class SpofRow:
    part_id: str
    failure: Failure
    lost_functions: tuple[str, ...]
    degraded_functions: tuple[str, ...]
    requirements_at_risk: tuple[str, ...]
    flags: frozenset[str]


def spof_failure(graph: ImpactGraph, part_id: str) -> Failure:
    """Loss of one instance of a group usage, loss of the whole part otherwise."""
    node = graph.nodes[part_id]
    return Failure(part_id, FailureKind.LOSS, None, 1 if node.gate else None)


def spof(graph: ImpactGraph) -> list[SpofRow]:
    """One row per physical part (model order): what its loss does."""
    rows = []
    for part_id, node in graph.nodes.items():
        if node.layer is not Layer.PHYSICAL:
            continue
        failure = spof_failure(graph, part_id)
        impacts = evaluate(graph, [failure])
        affected = affected_nodes(graph, impacts, Layer.FUNCTION)
        rows.append(
            SpofRow(
                part_id,
                failure,
                tuple(f for f in affected if impacts[f].status is Status.LOST),
                tuple(f for f in affected if impacts[f].status is Status.DEGRADED),
                tuple(affected_nodes(graph, impacts, Layer.REQUIREMENT)),
                failure_flags(graph, failure) | impacts[part_id].flags,
            )
        )
    return rows
