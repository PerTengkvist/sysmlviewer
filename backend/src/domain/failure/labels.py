"""Human-readable labels of impact-graph nodes, unambiguous within one graph.

Four styles, each with a plain form that is used as long as it is unique in the graph:

- `name`: the simple name (`authenticate`).
- `label`: `<short name> <name>` for tagged elements (`UC006 Brake`), else the name.
- `short`: the name; a physical part is shown with its physical owners (`batteryPack.modules`).
- `tail`: the id without its first (package) segment (`VehiclePhysical::batteryPack::modules`).

When two or more nodes would get the same plain form, each of them gets the shortest suffix
of its qualified id, in whole `::` segments, that is unique among the colliding nodes
(`Functions::Security::authenticate` and `Functions::Comfort::authenticate` become
`Security::authenticate` and `Comfort::authenticate`). The suffix is added to the name part only:

- `label` keeps the tag in front: `UC006 Driving::Brake`.
- `short` extends from the owner side: for `a.b` (owner `a` in the graph) the suffix is taken from
  the id of the root owner and the owned names follow: `Pkg1::V::a.b` and `Pkg2::V::a.b`. A part
  without a graph owner is qualified like any other node.
- `tail` has one step: the full id.

Different nodes may get suffixes of different length. Ids and JSON keys are never affected.
The maps are built once per graph and style (O(N) over the nodes, extra work only for colliding
groups) and cached on the graph; they are rebuilt if the number of nodes changes.
"""

from __future__ import annotations

from collections.abc import Callable

from domain.failure.model import ImpactGraph

STYLES = ("name", "label", "short", "tail")


def _suffix(nid: str, k: int) -> str:
    """The last k + 1 whole segments of an id."""
    return "::".join(nid.split("::")[-(k + 1):])


def _chain(graph: ImpactGraph, nid: str) -> list[str]:
    """Ids from the root owner down to the node."""
    ids = [nid]
    while ids[-1] in graph.parent and graph.parent[ids[-1]] not in ids:
        ids.append(graph.parent[ids[-1]])
    return list(reversed(ids))


def _tail_id(nid: str) -> str:
    return nid.split("::", 1)[1] if "::" in nid else nid


def _label_base(graph: ImpactGraph, nid: str) -> str:
    node = graph.nodes[nid]
    return f"{node.short_id} {node.name}" if node.short_id else node.name


def _short_base(graph: ImpactGraph, nid: str) -> str:
    return ".".join(graph.nodes[i].name for i in _chain(graph, nid))


def _short_qual(graph: ImpactGraph, nid: str, k: int) -> str:
    chain = _chain(graph, nid)
    rest = "".join("." + graph.nodes[i].name for i in chain[1:])
    return _suffix(chain[0], k) + rest


def _label_qual(graph: ImpactGraph, nid: str, k: int) -> str:
    node = graph.nodes[nid]
    return f"{node.short_id} {_suffix(nid, k)}" if node.short_id else _suffix(nid, k)


def _tail_qual(graph: ImpactGraph, nid: str, k: int) -> str:
    return nid if k >= 1 else _tail_id(nid)


_BASE: dict[str, Callable[[ImpactGraph, str], str]] = {
    "name": lambda g, n: g.nodes[n].name,
    "label": _label_base,
    "short": _short_base,
    "tail": lambda g, n: _tail_id(n),
}
_QUAL: dict[str, Callable[[ImpactGraph, str, int], str]] = {
    "name": lambda g, n, k: _suffix(n, k),
    "label": _label_qual,
    "short": _short_qual,
    "tail": _tail_qual,
}


def _build(graph: ImpactGraph, style: str) -> dict[str, str]:
    base, qual = _BASE[style], _QUAL[style]
    groups: dict[str, list[str]] = {}
    for nid in graph.nodes:
        groups.setdefault(base(graph, nid), []).append(nid)
    out = {nid: text for text, ids in groups.items() for nid in ids}
    for ids in (g for g in groups.values() if len(g) > 1):
        pending = list(ids)
        k = 1
        while pending:
            if k >= max(len(i.split("::")) for i in pending):  # whole id reached: ids are unique
                for nid in pending:
                    out[nid] = qual(graph, nid, k)
                break
            cand = {nid: qual(graph, nid, k) for nid in pending}
            counts: dict[str, int] = {}
            for text in cand.values():
                counts[text] = counts.get(text, 0) + 1
            for nid, text in cand.items():
                if counts[text] == 1:
                    out[nid] = text
            pending = [nid for nid in pending if counts[cand[nid]] > 1]
            k += 1
    return out


def label_map(graph: ImpactGraph, style: str) -> dict[str, str]:
    """Label of every node of the graph in one style, built once per graph."""
    cached = graph._label_cache.get(style)
    if cached is None or cached[0] != len(graph.nodes):
        cached = (len(graph.nodes), _build(graph, style))
        graph._label_cache[style] = cached
    return cached[1]


def display(graph: ImpactGraph, nid: str, style: str) -> str:
    return label_map(graph, style)[nid]


def label(graph: ImpactGraph, nid: str) -> str:
    """`<tag> <name>` when the element has a short name, else the name; see the module doc."""
    return display(graph, nid, "label")


def short_name(graph: ImpactGraph, nid: str) -> str:
    """Name of a node; physical parts are shown with their physical owners (`a.b`)."""
    return display(graph, nid, "short")


def name_of(graph: ImpactGraph, nid: str) -> str:
    """Simple name, qualified only when another node has the same name."""
    return display(graph, nid, "name")


def tail_name(graph: ImpactGraph, nid: str) -> str:
    """Id without its package segment; the full id when two nodes would share it."""
    return display(graph, nid, "tail")
