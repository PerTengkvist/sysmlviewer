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
groups) and cached on the graph. An `ImpactGraph` must not be changed after it is built (it is
not, once `build_impact_graph` returns); `dataclasses.replace` gives the copy an empty cache.

A label is unique graph-wide, across layers: a function `Funcs::Brake` and a logical part
`Log::Brake` are both qualified, and a plain label is qualified too when a qualified one would
otherwise equal it.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping

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


def short_qual(graph: ImpactGraph, nid: str, k: int) -> str:
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
    "short": short_qual,
    "tail": _tail_qual,
}


def disambiguate(base: Mapping[str, str], qual: Callable[[str, int], str]) -> dict[str, str]:
    """Make the texts of `base` (key -> plain text) unique among all keys.

    A key whose text is shared with another key is shown as `qual(key, k)`, with k growing one
    step at a time until the text is unique graph-wide: also against texts that were unique
    before. Keys of different depth may end at different k; a key that cannot grow further stays.
    """
    out = dict(base)
    level = dict.fromkeys(base, 0)
    while True:
        by_text: dict[str, list[str]] = {}
        for key, text in out.items():
            by_text.setdefault(text, []).append(key)
        grew = False
        for keys in (g for g in by_text.values() if len(g) > 1):
            for key in keys:
                for k in range(level[key] + 1, level[key] + 2 + len(key.split("::"))):
                    text = qual(key, k)
                    if text != out[key]:
                        level[key], out[key], grew = k, text, True
                        break
        if not grew:
            return out


def _build(graph: ImpactGraph, style: str) -> dict[str, str]:
    base, qual = _BASE[style], _QUAL[style]
    return disambiguate(
        {nid: base(graph, nid) for nid in graph.nodes}, lambda nid, k: qual(graph, nid, k)
    )


def tail_names(ids: Iterable[str]) -> dict[str, str]:
    """Ids without their package segment; the full id where two of `ids` would look alike."""
    return disambiguate({i: _tail_id(i) for i in ids}, lambda i, k: i if k >= 1 else _tail_id(i))


def tag_key(graph: ImpactGraph, nid: str) -> tuple[int, str, str, str]:
    """Sort key: tagged elements by tag, untagged ones after them by name; the id breaks ties."""
    node = graph.nodes[nid]
    return (0, node.short_id, node.name, nid) if node.short_id else (1, "", node.name, nid)


def label_map(graph: ImpactGraph, style: str) -> dict[str, str]:
    """Label of every node of the graph in one style, built once per graph."""
    cache = graph._label_cache
    if style not in cache:
        cache[style] = _build(graph, style)
    return cache[style]


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
