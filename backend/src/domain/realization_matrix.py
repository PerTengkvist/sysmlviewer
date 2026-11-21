"""Columns of the realization matrix: every function node of the model.

The matrix lists function nodes and logical parts also when no use case reaches them, so
gaps show. Roles come from relations, never from names: a function node is a part that
performs a function step (`perform flow.step;`). A part that is only an `allocate` source
(`allocate logical to physical;`) is not a function node.
Pure domain logic.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from domain.models import SemanticElement
from domain.perform import is_perform, resolve_performers
from domain.realization import _Deriver


@dataclass(frozen=True)
class MatrixNode:
    id: str
    function_id: str | None  # the function part that owns the node, if it is one
    part_ids: list[str] = field(default_factory=list)  # `allocate` targets, declaration order


def matrix_nodes(
    semantic: Mapping[str, SemanticElement],
    performers: Mapping[str, list[str]] | None = None,
) -> list[MatrixNode]:
    """All function nodes in model order."""
    if performers is None:
        performers = resolve_performers(dict(semantic))
    deriver = _Deriver(semantic, performers)
    nodes: list[MatrixNode] = []
    for eid, el in semantic.items():
        if not deriver._is_node(el) or not any(
            is_perform(semantic[c]) for c in deriver.children.get(eid, [])
        ):
            continue
        owner = deriver._owner(el)
        function = owner.id if owner is not None and deriver._is_function(owner) else None
        nodes.append(MatrixNode(eid, function, list(deriver.allocated_to.get(eid, []))))
    return nodes
