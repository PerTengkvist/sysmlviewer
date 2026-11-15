"""Dependency tree of an element.

Every edge runs from an upper (more abstract) element to a lower one:

| relation                                   | upper            | lower  | label              |
|--------------------------------------------|------------------|--------|--------------------|
| dependency (`#kw`, objective, refine, …)   | target           | source | keyword/dependency |
| satisfy                                    | target (req.)    | source | satisfy            |
| specialization / subsetting / redefinition | target           | source | kind               |
| typing `: T`                               | definition       | usage  | typed by           |
| include                                    | source           | target | include            |
| allocation                                 | source           | target | allocate           |
| ownership (owner is not a package)         | owner            | child  | owned by / owns    |
| connection / interface / binding / flow    | symmetric, only shown downwards from both ends   |

Ports are lifted to the part that owns them. Successions, transitions and
messages are not relation elements and are left out.

Upwards there is one chain, picked by priority (see `_PRIORITY_*`); the
other candidates at a level are counted as `alternatives`. Downwards every
edge where the element is the upper end, plus the symmetric edges, form a
tree in which each element is expanded once.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from domain.models import ArtifactKind, SemanticElement
from domain.relationships import is_relation_element
from domain.type_resolution import part_def_resolver

# Upward chain priority (lower wins).
_PRIORITY_TRACE = 1  # satisfy, dependency family
_PRIORITY_OWNER = 2
_PRIORITY_TYPE = 3  # specialization family, typing
_PRIORITY_USAGE = 4  # allocate, include — and perform (see `_collect_edges`)
_PRIORITY_SYMMETRIC = 5  # never used upwards

_TRACE_KINDS = {ArtifactKind.DEPENDENCY, ArtifactKind.SATISFY}
_SPECIALIZATION_KINDS = {
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
}
_SYMMETRIC_KINDS = {
    ArtifactKind.CONNECTION,
    ArtifactKind.INTERFACE,
    ArtifactKind.BINDING,
    ArtifactKind.FLOW,
}
_OWNED_KINDS = {
    ArtifactKind.PART,
    ArtifactKind.REQUIREMENT,
    ArtifactKind.USE_CASE,
    ArtifactKind.ACTOR,
    ArtifactKind.ACTION,
}

LABEL_OWNED_BY = "owned by"
LABEL_OWNS = "owns"
LABEL_TYPED_BY = "typed by"


@dataclass(frozen=True)
class _Edge:
    upper: str
    lower: str
    relation_id: str | None
    label: str
    priority: int
    symmetric: bool = False
    # Label read from the lower end (ownership: "owned by" vs "owns").
    up_label: str | None = None


def build_dependency_tree(
    semantic: Mapping[str, SemanticElement],
    root_id: str,
    *,
    max_depth: int = 8,
    max_nodes: int = 400,
) -> dict[str, Any]:
    """Build `{root, up, down, truncated}` for `root_id`.

    `up` lists the chain top (most abstract) first; each entry's
    `relationId`/`label` is the edge to the element below it. `down` is the
    root with nested `children`. Raises `KeyError` for an unknown id.
    """
    root = semantic[root_id]
    edges = _collect_edges(semantic, root_id)
    ups: dict[str, list[_Edge]] = {}
    downs: dict[str, list[_Edge]] = {}
    for edge in edges:
        if edge.symmetric:
            downs.setdefault(edge.upper, []).append(edge)
            downs.setdefault(edge.lower, []).append(
                _Edge(edge.lower, edge.upper, edge.relation_id, edge.label,
                      edge.priority, True)
            )
        else:
            ups.setdefault(edge.lower, []).append(edge)
            downs.setdefault(edge.upper, []).append(edge)

    up = _up_chain(semantic, root_id, ups)
    visited = {root_id, *(n["id"] for n in up)}
    down = _node(root, None, None)
    truncated = _expand_down(semantic, down, downs, visited, max_depth, max_nodes)
    return {
        "root": _summary(root),
        "up": up,
        "down": down,
        "truncated": truncated,
    }


def _summary(el: SemanticElement) -> dict[str, Any]:
    return {
        "id": el.id,
        "name": el.name,
        "kind": el.kind.value,
        "shortId": el.short_id,
    }


def _node(
    el: SemanticElement, relation_id: str | None, label: str | None
) -> dict[str, Any]:
    return {
        **_summary(el),
        "relationId": relation_id,
        "label": label,
        "alternatives": 0,
        "repeated": False,
        "truncated": False,
        "children": [],
    }


def _sorted(edges: list[_Edge]) -> list[_Edge]:
    """Priority first, model order within a priority (stable sort)."""
    return sorted(edges, key=lambda e: e.priority)


def _up_chain(
    semantic: Mapping[str, SemanticElement],
    root_id: str,
    ups: dict[str, list[_Edge]],
) -> list[dict[str, Any]]:
    chain: list[dict[str, Any]] = []
    seen = {root_id}
    current = root_id
    while True:
        candidates = _sorted(ups.get(current, []))
        if not candidates:
            break
        best = candidates[0]
        if best.upper in seen:
            break  # cycle
        others = {e.upper for e in candidates if e.upper != best.upper}
        node = _node(semantic[best.upper], best.relation_id, best.up_label or best.label)
        node["alternatives"] = len(others)
        chain.append(node)
        seen.add(best.upper)
        current = best.upper
    chain.reverse()
    return chain


def _expand_down(
    semantic: Mapping[str, SemanticElement],
    root: dict[str, Any],
    downs: dict[str, list[_Edge]],
    visited: set[str],
    max_depth: int,
    max_nodes: int,
) -> bool:
    """Breadth first, so an element shows up at its shallowest place."""
    truncated = False
    count = 1
    queue: deque[tuple[dict[str, Any], int]] = deque([(root, 0)])
    while queue:
        node, depth = queue.popleft()
        edges = _sorted(downs.get(node["id"], []))
        if not edges:
            continue
        if depth >= max_depth:
            node["truncated"] = True
            truncated = True
            continue
        for edge in edges:
            if count >= max_nodes:
                node["truncated"] = True
                truncated = True
                break
            child = _node(semantic[edge.lower], edge.relation_id, edge.label)
            count += 1
            node["children"].append(child)
            if edge.lower in visited:
                child["repeated"] = True
                continue
            visited.add(edge.lower)
            queue.append((child, depth + 1))
    return truncated


def _lift(
    semantic: Mapping[str, SemanticElement], endpoint: str | None, root_id: str
) -> str | None:
    """A port stands for the part that owns it (unless it is the root)."""
    cur = semantic.get(endpoint) if endpoint else None
    while (
        cur is not None
        and cur.kind == ArtifactKind.PORT
        and cur.id != root_id
        and cur.parent_id
    ):
        cur = semantic.get(cur.parent_id)
    return cur.id if cur is not None else None


def _relation_label(rel: SemanticElement) -> str:
    if rel.kind == ArtifactKind.DEPENDENCY and rel.metadata_keywords:
        return rel.metadata_keywords[0]
    if rel.kind == ArtifactKind.ALLOCATION:
        return "allocate"
    return rel.kind.value


def _resolve_type(
    semantic: Mapping[str, SemanticElement],
    usage: SemanticElement,
    resolve_part_def,
) -> SemanticElement | None:
    ref = usage.type_ref
    if not ref:
        return None
    direct = semantic.get(ref)
    if direct is not None and direct.kind == usage.kind:
        return direct
    if usage.kind == ArtifactKind.PART:
        return resolve_part_def(ref)
    simple = ref.split("::")[-1]
    for el in semantic.values():
        if el.kind == usage.kind and el.name == simple and el.type_ref is None:
            return el
    return None


def _collect_edges(
    semantic: Mapping[str, SemanticElement], root_id: str
) -> list[_Edge]:
    edges: list[_Edge] = []
    specialized: set[tuple[str, str]] = set()

    def add(edge: _Edge) -> None:
        if edge.upper == edge.lower:
            return
        if edge.upper not in semantic or edge.lower not in semantic:
            return
        edges.append(edge)

    for rel in semantic.values():
        if not is_relation_element(rel):
            continue
        src = _lift(semantic, rel.source_id, root_id)
        tgt = _lift(semantic, rel.target_id, root_id)
        if not src or not tgt:
            continue
        label = _relation_label(rel)
        if rel.kind in _TRACE_KINDS:
            add(_Edge(tgt, src, rel.id, label, _PRIORITY_TRACE))
        elif rel.kind in _SPECIALIZATION_KINDS:
            specialized.add((tgt, src))
            add(_Edge(tgt, src, rel.id, label, _PRIORITY_TYPE))
        elif rel.kind in (ArtifactKind.INCLUDE, ArtifactKind.ALLOCATION):
            add(_Edge(src, tgt, rel.id, label, _PRIORITY_USAGE))
        elif rel.kind in _SYMMETRIC_KINDS:
            add(_Edge(src, tgt, rel.id, label, _PRIORITY_SYMMETRIC, symmetric=True))

    # perform (PR A): the performing part is upper, the action lower, label
    # "perform", priority `_PRIORITY_USAGE`. Add the edges here from
    # `domain.perform.resolve_performers` once that module exists.

    resolve_part_def = part_def_resolver(semantic)
    for el in semantic.values():
        if el.kind == ArtifactKind.PACKAGE or is_relation_element(el):
            continue
        parent = semantic.get(el.parent_id) if el.parent_id else None
        if (
            el.kind in _OWNED_KINDS
            and parent is not None
            and parent.kind != ArtifactKind.PACKAGE
        ):
            add(_Edge(parent.id, el.id, None, LABEL_OWNS, _PRIORITY_OWNER,
                      up_label=LABEL_OWNED_BY))
        type_def = _resolve_type(semantic, el, resolve_part_def)
        if type_def is not None and (type_def.id, el.id) not in specialized:
            add(_Edge(type_def.id, el.id, None, LABEL_TYPED_BY, _PRIORITY_TYPE))
    return edges
