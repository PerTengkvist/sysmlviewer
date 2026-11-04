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

    Also pulls **nested port** endpoint ids into the set (for diagram handle
    resolution). Depth-excluded parts/packages are never pulled in — edges
    that only touch them via a parent walk are still added here, then dropped
    by the view's hidden-relation filter when the ends are absent.
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
        for endpoint in (src, tgt):
            if endpoint in included or endpoint in extra:
                continue
            end_el = semantic.get(endpoint)
            # Only nested ports — never reintroduce hidden structural nodes.
            if end_el and end_el.kind == ArtifactKind.PORT:
                extra.add(endpoint)
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
