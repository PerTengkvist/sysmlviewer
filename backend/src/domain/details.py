"""Classify children for Details panel and collect artifacts by hierarchy depth."""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement

RELATION_KINDS = {
    ArtifactKind.CONNECTION,
    ArtifactKind.DEPENDENCY,
    ArtifactKind.ALLOCATION,
    ArtifactKind.BINDING,
    ArtifactKind.FLOW,
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
    ArtifactKind.INCLUDE,
    ArtifactKind.SATISFY,
}


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
        elif child.kind in RELATION_KINDS:
            relations.append(child)

    # Relationships that touch this element's ports/features but live elsewhere
    for other in semantic.values():
        if other.kind not in RELATION_KINDS:
            continue
        if other.id in {r.id for r in relations}:
            continue
        if other.source_id in port_ids or other.target_id in port_ids:
            relations.append(other)
        elif other.parent_id == element_id:
            relations.append(other)
        elif other.source_id == element_id or other.target_id == element_id:
            relations.append(other)

    return {
        "ports": ports,
        "attributes": attributes,
        "subParts": sub_parts,
        "relations": relations,
    }


# Structural nodes that count toward hierarchical depth
_DEPTH_KINDS = {
    ArtifactKind.PART,
    ArtifactKind.PACKAGE,
    ArtifactKind.REQUIREMENT,
    ArtifactKind.USE_CASE,
}

# Always attached under an included structural node (not depth-limited)
_ATTACHED_KINDS = {
    ArtifactKind.PORT,
    ArtifactKind.ATTRIBUTE,
    ArtifactKind.VIEW,
    ArtifactKind.ACTOR,
    *RELATION_KINDS,
}


def collect_artifacts_to_depth(
    semantic: dict[str, SemanticElement],
    root_id: str,
    depth: int,
) -> set[str]:
    """
    Collect root + structural descendants up to `depth` levels.
    depth=1 → only root; depth=2 → root + direct children (parts/packages/
    requirements/use cases).
    Always include ports/connections/attributes/views/actors under included nodes.
    """
    if depth < 1:
        depth = 1
    included: set[str] = {root_id}
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
                if child.kind in _DEPTH_KINDS:
                    included.add(cid)
                    nxt.append(cid)
        frontier = nxt

    extra: set[str] = set()
    for aid in list(included):
        el = semantic.get(aid)
        if not el:
            continue
        for cid in el.children:
            child = semantic.get(cid)
            if not child:
                continue
            if child.kind in _ATTACHED_KINDS:
                extra.add(cid)
            # nested structural nodes beyond depth already excluded
    included |= extra
    from domain.relationships import collect_related_edges

    included |= collect_related_edges(semantic, included)
    return included
