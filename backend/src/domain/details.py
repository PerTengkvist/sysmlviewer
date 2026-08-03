"""Classify children for Details panel and collect artifacts by hierarchy depth."""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement


def classify_children(
    semantic: dict[str, SemanticElement], element_id: str
) -> dict[str, list[SemanticElement]]:
    el = semantic.get(element_id)
    ports: list[SemanticElement] = []
    attributes: list[SemanticElement] = []
    sub_parts: list[SemanticElement] = []
    relations: list[SemanticElement] = []

    if not el:
        return {
            "ports": ports,
            "attributes": attributes,
            "subParts": sub_parts,
            "relations": relations,
        }

    port_ids = set()
    for cid in el.children:
        child = semantic.get(cid)
        if not child:
            continue
        if child.kind == ArtifactKind.PORT:
            ports.append(child)
            port_ids.add(child.id)
        elif child.kind == ArtifactKind.ATTRIBUTE:
            attributes.append(child)
        elif child.kind == ArtifactKind.PART:
            sub_parts.append(child)
        elif child.kind == ArtifactKind.CONNECTION:
            relations.append(child)

    # Connections that touch this element's ports but live elsewhere
    for other in semantic.values():
        if other.kind != ArtifactKind.CONNECTION:
            continue
        if other.id in {r.id for r in relations}:
            continue
        if other.source_id in port_ids or other.target_id in port_ids:
            relations.append(other)
        elif other.parent_id == element_id:
            relations.append(other)

    return {
        "ports": ports,
        "attributes": attributes,
        "subParts": sub_parts,
        "relations": relations,
    }


def collect_artifacts_to_depth(
    semantic: dict[str, SemanticElement],
    root_id: str,
    depth: int,
) -> set[str]:
    """
    Collect root + part/package descendants up to `depth` levels.
    depth=1 → only root; depth=2 → root + direct child parts (current whitebox).
    Always include ports/connections/attributes/views under included parts.
    """
    if depth < 1:
        depth = 1
    included: set[str] = {root_id}
    # BFS on parts/packages only for depth
    frontier = [root_id]
    for level in range(1, depth):
        nxt: list[str] = []
        for pid in frontier:
            parent = semantic.get(pid)
            if not parent:
                continue
            for cid in parent.children:
                child = semantic.get(cid)
                if not child:
                    continue
                if child.kind in {ArtifactKind.PART, ArtifactKind.PACKAGE}:
                    included.add(cid)
                    nxt.append(cid)
        frontier = nxt

    # Expand: include non-part children of every included part/package
    extra: set[str] = set()
    for aid in list(included):
        el = semantic.get(aid)
        if not el:
            continue
        for cid in el.children:
            child = semantic.get(cid)
            if not child:
                continue
            if child.kind in {
                ArtifactKind.PORT,
                ArtifactKind.CONNECTION,
                ArtifactKind.ATTRIBUTE,
                ArtifactKind.VIEW,
            }:
                extra.add(cid)
            # nested parts beyond depth already excluded
    included |= extra
    return included
