"""Shared helpers for part relationship edges."""

from __future__ import annotations

from domain.merge import STRUCTURE_EDGE_KINDS
from domain.models import ArtifactKind, SemanticElement

RELATION_EDGE_KINDS = STRUCTURE_EDGE_KINDS


def is_relation_edge(kind: ArtifactKind) -> bool:
    return kind in RELATION_EDGE_KINDS


def is_relation_element(el: SemanticElement) -> bool:
    """True for structure relations. Interface usages need both ends; defs do not count."""
    if el.kind == ArtifactKind.INTERFACE:
        return bool(el.source_id and el.target_id)
    return is_relation_edge(el.kind)


def collect_related_edges(
    semantic: dict[str, SemanticElement], included: set[str]
) -> set[str]:
    """Include relationship edges whose endpoints fall within `included`.

    Also pulls the endpoint ids themselves into the set so nested port ends
    (under a composite port usage) are present in the view semantic — needed
    for diagram handle resolution.
    """
    extra: set[str] = set()
    for el in semantic.values():
        if not is_relation_element(el):
            continue
        src = el.source_id
        tgt = el.target_id
        if not src or not tgt:
            continue
        if not (
            _endpoint_included(src, included, semantic)
            and _endpoint_included(tgt, included, semantic)
        ):
            continue
        if el.id not in included:
            extra.add(el.id)
        if src not in included:
            extra.add(src)
        if tgt not in included:
            extra.add(tgt)
    return extra


def _endpoint_included(
    endpoint_id: str, included: set[str], semantic: dict[str, SemanticElement]
) -> bool:
    if endpoint_id in included:
        return True
    cur = semantic.get(endpoint_id)
    while cur and cur.parent_id:
        if cur.parent_id in included:
            return True
        cur = semantic.get(cur.parent_id)
    return False
