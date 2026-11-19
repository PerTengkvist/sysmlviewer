"""Requirement groups: which group a requirement belongs to, from the model."""

from __future__ import annotations

from collections.abc import Collection, Mapping

from domain.failure.model import ImpactGraph, Layer
from domain.models import ArtifactKind, SemanticElement

# User stories carry Type "UserStory"; they are not a severity group.
IGNORED_TYPES = frozenset({"UserStory"})


def _type_of(semantic: Mapping[str, SemanticElement], req_id: str) -> str | None:
    attr = semantic.get(f"{req_id}::Type")
    if attr is None or attr.kind != ArtifactKind.ATTRIBUTE or attr.default_value is None:
        return None
    return attr.default_value.strip().strip("\"'")


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
    parents: dict[str, list[str]] = {}
    for el in semantic.values():
        if (
            el.kind == ArtifactKind.DEPENDENCY
            and "refine" in (el.metadata_keywords or [])
            and el.source_id
            and el.target_id
        ):
            parents.setdefault(el.source_id, []).append(el.target_id)
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
