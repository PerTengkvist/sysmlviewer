"""Classify children for Details panel and collect artifacts by hierarchy depth."""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement
from domain.relationships import is_relation_element

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
    ArtifactKind.INTERFACE,
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
        elif is_relation_element(child):
            relations.append(child)

    # Relationships that touch this element's ports/features but live elsewhere
    for other in semantic.values():
        if not is_relation_element(other):
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
    ArtifactKind.INTERFACE,
    *{k for k in RELATION_KINDS if k != ArtifactKind.INTERFACE},
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

    def _attach_port_tree(port_id: str) -> None:
        """Include a port and all nested ports under it (hierarchical faces)."""
        port = semantic.get(port_id)
        if not port or port.kind != ArtifactKind.PORT:
            return
        extra.add(port_id)
        for cid in port.children:
            child = semantic.get(cid)
            if child and child.kind == ArtifactKind.PORT:
                _attach_port_tree(cid)

    for aid in list(included):
        el = semantic.get(aid)
        if not el:
            continue
        for cid in el.children:
            child = semantic.get(cid)
            if not child:
                continue
            if child.kind == ArtifactKind.PORT:
                _attach_port_tree(cid)
            elif child.kind in _ATTACHED_KINDS:
                extra.add(cid)
            # nested structural nodes beyond depth already excluded
    included |= extra
    from domain.relationships import collect_related_edges

    included |= collect_related_edges(semantic, included)
    return included


def _is_member_node(el: SemanticElement) -> bool:
    """A member an `expose P::*;` shows: a structural node, not a port or feature."""
    if el.kind in _DEPTH_KINDS or el.kind == ArtifactKind.ACTOR:
        return True
    return el.kind == ArtifactKind.INTERFACE and not (el.source_id and el.target_id)


def structural_depth(semantic: dict[str, SemanticElement], root_id: str) -> int:
    """Levels of structural nodes from root (root alone = 1)."""
    root = semantic.get(root_id)
    if root is None:
        return 1
    best = 1
    stack = [(root, 1)]
    seen: set[str] = set()
    while stack:
        el, depth = stack.pop()
        if el.id in seen:
            continue
        seen.add(el.id)
        best = max(best, depth)
        for cid in el.children:
            child = semantic.get(cid)
            if child is not None and child.kind in _DEPTH_KINDS:
                stack.append((child, depth + 1))
    return best


def collect_exposed(
    semantic: dict[str, SemanticElement],
    root_id: str,
    kind: str,
    levels: int,
) -> set[str]:
    """What one expose of `root_id` puts in a view, by expose kind.

    member: root with contents to `levels` (as before); members: the root's
    direct members only; recursive: root and everything under it;
    membersRecursive: everything under the root, without it.
    """
    from domain.expose import MEMBER, MEMBERS, MEMBERS_RECURSIVE, RECURSIVE
    from domain.relationships import collect_related_edges

    if kind == RECURSIVE:
        return collect_artifacts_to_depth(
            semantic, root_id, structural_depth(semantic, root_id)
        )
    if kind not in (MEMBERS, MEMBERS_RECURSIVE):
        if kind != MEMBER:
            kind = MEMBER
        return collect_artifacts_to_depth(semantic, root_id, levels)

    root = semantic.get(root_id)
    if root is None:
        return set()
    included: set[str] = set()
    for cid in root.children:
        child = semantic.get(cid)
        if child is None or not _is_member_node(child):
            continue
        depth = 1 if kind == MEMBERS else structural_depth(semantic, cid)
        included |= collect_artifacts_to_depth(semantic, cid, depth)
    # Relations the root owns between its members (e.g. a package's
    # `dependency from A to B;`).
    included |= collect_related_edges(semantic, included)
    included.discard(root_id)
    return included
