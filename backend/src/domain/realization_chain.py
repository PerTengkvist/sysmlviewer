"""The realization chain of use cases: use case | function | function node | logical part.

`build_chain` turns a `Realization` (domain/realization.py, which does all the deriving)
into the nodes and edges of a column graph, for an `AllocationView` whose root is a use
case, a package with use cases, or a function. Nothing is derived here beyond choosing
what to show:

- `refine`: function -> use case (precision as in the realization), or function node ->
  use case for a node that refines the use case itself;
- `owns`: function -> function node, for the nodes that perform its steps;
- `allocate`: function node -> logical part.

With a function as root the chain runs the other way: the function, the use cases it
realizes, and the nodes and parts it reaches. Pure domain logic: no I/O.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from domain.models import ArtifactKind, SemanticElement
from domain.realization import Precision, Realization, function_ids

_RANK: dict[str, int] = {"step": 0, "coarse": 1, "explicit": 2}
_KIND_ORDER = {"refine": 0, "owns": 1, "allocate": 2}

USE_CASE, FUNCTION, NODE, PART = "useCase", "function", "node", "part"


@dataclass(frozen=True)
class ChainEdge:
    source: str
    target: str
    kind: str  # refine | owns | allocate
    precision: Precision
    via_include: bool
    # Not a link of its own: a function that refines the use case stands for its nodes
    # (and their parts) when none of the nodes serves it (`functionNodes` of the realization).
    projected: bool = False

    def to_dict(self) -> dict:
        return {
            "source": self.source,
            "target": self.target,
            "kind": self.kind,
            "precision": self.precision,
            "viaInclude": self.via_include,
            "projected": self.projected,
        }


@dataclass
class Chain:
    ids: list[str]  # model order
    roles: dict[str, str]
    edges: list[ChainEdge]


def _descendants(semantic: Mapping[str, SemanticElement], root_id: str) -> list[str]:
    out: list[str] = []
    stack = [root_id]
    while stack:
        for cid in semantic[stack.pop()].children:
            if cid in semantic:
                out.append(cid)
                stack.append(cid)
    return out


def realized_functions(semantic: Mapping[str, SemanticElement], realization: Realization) -> set[str]:
    """Functions that take part in the realization: they refine a use case or own a node that does."""
    functions = function_ids(semantic)
    out: set[str] = set()
    for uc in set(realization.uc_functions) | set(realization.uc_nodes):
        out |= set(realization.uc_functions.get(uc, {}))
        for node in realization.uc_nodes.get(uc, {}):
            parent = semantic[node].parent_id if node in semantic else None
            if parent in functions:
                out.add(parent)  # type: ignore[arg-type]
    return out & functions


def _allocates(semantic: Mapping[str, SemanticElement], content: Iterable[str]) -> bool:
    for eid in content:
        el = semantic.get(eid)
        if el is not None and (
            el.kind == ArtifactKind.ALLOCATION
            or (el.kind == ArtifactKind.CONNECTION and el.name.startswith("alloc"))
        ):
            return True
    return False


def is_chain_view(
    semantic: Mapping[str, SemanticElement],
    realization: Realization,
    exposed: Iterable[tuple[str, Iterable[str]]],
) -> bool:
    """Whether an AllocationView draws the realization chain instead of the allocation (B6).

    `exposed` is each exposed root with the ids it puts in the view, after the view's filters
    and whatever the diagram levels. Every root has to vote for the chain, so the order of the
    exposes does not matter: a use case; a function that takes part in the realization; or a
    package whose content has use cases and allocates nothing. Anything else (a part with a
    logical/physical split, a package that allocates, a filter that left no use case) keeps the
    allocation view, which is what an AllocationView was before.
    """
    realized = realized_functions(semantic, realization)
    votes = 0
    for root_id, content in exposed:
        root = semantic.get(root_id)
        ids = set(content)
        if root is None:
            return False
        if root.kind == ArtifactKind.USE_CASE or root.id in realized:
            pass
        elif root.kind == ArtifactKind.PACKAGE and any(
            semantic[i].kind == ArtifactKind.USE_CASE for i in ids if i in semantic
        ) and not _allocates(semantic, ids):
            pass
        else:
            return False
        votes += 1
    return votes > 0


def _use_cases_under(semantic: Mapping[str, SemanticElement], root: SemanticElement) -> list[str]:
    if root.kind == ArtifactKind.USE_CASE:
        return [root.id]
    if root.kind == ArtifactKind.PACKAGE and root.id in semantic:
        return [d for d in _descendants(semantic, root.id) if semantic[d].kind == ArtifactKind.USE_CASE]
    return []


def build_chain(
    semantic: Mapping[str, SemanticElement],
    realization: Realization,
    root_ids: Iterable[str],
) -> Chain:
    r = realization
    functions = function_ids(semantic)
    roots = [semantic[i] for i in root_ids if i in semantic]
    # (use case, function the chain is limited to, or None)
    scopes: list[tuple[str, str | None]] = []
    for root in roots:
        if root.id in functions:
            for uc in semantic:
                nodes_without_function = any(
                    not r.uc_node_functions.get(uc, {}).get(n) and semantic[n].parent_id == root.id
                    for n in r.uc_nodes.get(uc, {})
                )
                if root.id in r.uc_functions.get(uc, {}) or nodes_without_function:
                    scopes.append((uc, root.id))
        else:
            scopes.extend((uc, None) for uc in _use_cases_under(semantic, root))

    roles: dict[str, str] = {}
    best: dict[tuple[str, str, str], tuple[Precision, bool, bool]] = {}
    order: list[tuple[str, str, str]] = []

    def edge(
        src: str, tgt: str, kind: str, precision: Precision, via: bool, projected: bool = False
    ) -> None:
        key = (src, tgt, kind)
        if key not in best:
            order.append(key)
            best[key] = (precision, via, projected)
            return
        old, old_via, old_projected = best[key]
        best[key] = (
            precision if _RANK[precision] < _RANK[old] else old,
            old_via and via,
            old_projected and projected,
        )

    for root in roots:
        if root.id in functions:
            roles[root.id] = FUNCTION
    for uc, only in scopes:
        roles[uc] = USE_CASE
        inherited = r.via_include.get(uc, set())
        node_fns = r.uc_node_functions.get(uc, {})
        for fn, precision in r.uc_functions.get(uc, {}).items():
            if only is None or fn == only:
                roles[fn] = FUNCTION
                edge(fn, uc, "refine", precision, fn in inherited)
        for node, precision in r.uc_nodes.get(uc, {}).items():
            fns = [f for f in node_fns.get(node, []) if only is None or f == only]
            if only is not None and not fns and (
                node_fns.get(node) or semantic[node].parent_id != only
            ):
                continue
            roles[node] = NODE
            via = node in inherited
            if node_fns.get(node):
                for fn in fns:
                    roles.setdefault(fn, FUNCTION)
                    edge(fn, node, "owns", precision, via)
            else:
                edge(node, uc, "refine", precision, via)
            for part in r.node_parts.get(node, []):
                if part in r.uc_parts.get(uc, {}):
                    roles[part] = PART
                    edge(node, part, "allocate", precision, via)

        # A function that refines the use case stands for its nodes and their parts.
        for node, fn in r.uc_function_nodes.get(uc, {}).items():
            if only is not None and fn != only:
                continue
            roles[node] = NODE
            edge(fn, node, "owns", "explicit", fn in inherited, True)
            for part in r.node_parts.get(node, []):
                if part in r.uc_function_parts.get(uc, {}) or part in r.uc_parts.get(uc, {}):
                    roles[part] = PART
                    edge(node, part, "allocate", "explicit", fn in inherited, True)

    rank = {eid: i for i, eid in enumerate(semantic)}
    ids = sorted(roles, key=lambda i: rank.get(i, len(rank)))
    edges = [
        ChainEdge(s, t, k, *best[(s, t, k)])
        for s, t, k in sorted(
            order,
            key=lambda e: (_KIND_ORDER[e[2]], rank.get(e[0], 0), rank.get(e[1], 0)),
        )
    ]
    return Chain(ids, roles, edges)
