"""Requirement groups: which group a requirement belongs to, from the model."""

from __future__ import annotations

from collections.abc import Collection, Mapping
from dataclasses import dataclass

from domain.failure.model import ImpactGraph, Layer
from domain.models import ArtifactKind, SemanticElement

# User stories carry Type "UserStory"; they are not a severity group.
IGNORED_TYPES = frozenset({"UserStory"})


def _type_of(semantic: Mapping[str, SemanticElement], req_id: str) -> str | None:
    attr = semantic.get(f"{req_id}::Type")
    if attr is None or attr.kind != ArtifactKind.ATTRIBUTE or attr.default_value is None:
        return None
    return attr.default_value.strip().strip("\"'")


def _refine_parents(semantic: Mapping[str, SemanticElement]) -> dict[str, list[str]]:
    parents: dict[str, list[str]] = {}
    for el in semantic.values():
        if (
            el.kind == ArtifactKind.DEPENDENCY
            and "refine" in (el.metadata_keywords or [])
            and el.source_id
            and el.target_id
        ):
            parents.setdefault(el.source_id, []).append(el.target_id)
    return parents


def model_groups(semantic: Mapping[str, SemanticElement]) -> set[str]:
    """The `Type` values of the requirements in the model, user stories excluded."""
    out = set()
    for eid, el in semantic.items():
        if el.kind == ArtifactKind.REQUIREMENT:
            value = _type_of(semantic, eid)
            if value and value not in IGNORED_TYPES:
                out.add(value)
    return out


def requirement_groups(
    semantic: Mapping[str, SemanticElement], graph: ImpactGraph, groups: Collection[str]
) -> dict[str, list[str]]:
    """Per requirement in the graph: its groups.

    A requirement's own `Type` counts when it is a configured group; otherwise the
    search goes up along `#refine` to the requirements it refines. Empty list = no group.
    """
    parents = _refine_parents(semantic)
    out: dict[str, list[str]] = {}
    for nid, node in graph.nodes.items():
        if node.layer is not Layer.REQUIREMENT:
            continue
        found: list[str] = []
        seen = {nid}
        queue = [nid]
        while queue:
            cur = queue.pop(0)
            own = _type_of(semantic, cur)
            if own in groups:
                if own not in found:
                    found.append(own)
                continue
            for up in parents.get(cur, ()):
                if up not in seen:
                    seen.add(up)
                    queue.append(up)
        out[nid] = found
    return out


@dataclass(frozen=True)
class Downgrade:
    """A requirement whose own group scores lower than a group further up its refine chain."""

    req_id: str
    own_type: str
    own_score: int
    ancestor_id: str
    ancestor_type: str
    ancestor_score: int


def severity_downgrades(
    semantic: Mapping[str, SemanticElement], scores: Mapping[str, int]
) -> list[Downgrade]:
    """Requirements with a configured own `Type` below the best group reachable via `#refine`.

    Only a warning aid: S itself follows the requirement's own `Type`.
    """
    parents = _refine_parents(semantic)
    out = []
    for eid, el in semantic.items():
        if el.kind != ArtifactKind.REQUIREMENT:
            continue
        own = _type_of(semantic, eid)
        if own not in scores:
            continue
        best: tuple[str, str] | None = None
        seen = {eid}
        queue = list(parents.get(eid, ()))
        while queue:  # breadth first, all the way up; `seen` keeps cycles finite
            cur = queue.pop(0)
            if cur in seen:
                continue
            seen.add(cur)
            kind = _type_of(semantic, cur)
            if kind in scores and (best is None or scores[kind] > scores[best[1]]):
                best = (cur, kind)
            queue.extend(parents.get(cur, ()))
        if best is not None and scores[best[1]] > scores[own]:
            out.append(Downgrade(eid, own, scores[own], best[0], best[1], scores[best[1]]))
    return out
