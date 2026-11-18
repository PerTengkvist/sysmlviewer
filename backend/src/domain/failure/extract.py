"""Build the impact graph from the semantic model.

Roles are derived from relations, not from names:

- physical part: part usage that implements (directly, or through an ancestor);
- logical part: target of `#implements` or `allocate`, or satisfier of a requirement;
- function node: source of an `allocate` whose target is a logical part;
- function: owner of a function node;
- use case: refined by a function (node), an objective source, or an end of `include`;
- requirement: objective of a use case, or satisfied by a logical part.

`inputs[x]` lists what `x` depends on, in model order.
"""

from __future__ import annotations

from collections.abc import Mapping

from domain.dependency_tree import lift_port_to_part
from domain.failure.model import Edge, Gate, GateKind, ImpactGraph, Layer, Node
from domain.models import ArtifactKind, SemanticElement

_TRACE_KEYWORDS = {"refine", "derive", "objective", "implements", "extend"}
_RELATION_KINDS = {
    ArtifactKind.DEPENDENCY,
    ArtifactKind.ALLOCATION,
    ArtifactKind.INCLUDE,
    ArtifactKind.SATISFY,
}


def build_impact_graph(semantic: Mapping[str, SemanticElement]) -> ImpactGraph:
    return _Extractor(semantic).build()


def _number(text: str | None) -> float | None:
    if text is None:
        return None
    try:
        return float(text.strip().strip("\"'"))
    except ValueError:
        return None


class _Extractor:
    def __init__(self, semantic: Mapping[str, SemanticElement]) -> None:
        self.sem = semantic
        self.layers: dict[str, Layer] = {}
        self.inputs: dict[str, list[Edge]] = {}
        self.warnings: list[str] = []
        self.children: dict[str, list[str]] = {}
        for eid, el in semantic.items():
            if el.parent_id:
                self.children.setdefault(el.parent_id, []).append(eid)
        self.relations = [
            el
            for el in semantic.values()
            if el.source_id and el.target_id and el.kind in _RELATION_KINDS
        ]

    # -- helpers -------------------------------------------------------

    def _lift(self, endpoint: str | None) -> str | None:
        eid = lift_port_to_part(self.sem, endpoint, "")
        return eid if eid in self.sem else None

    def _kind(self, eid: str) -> ArtifactKind:
        return self.sem[eid].kind

    def _add(self, target: str, edge: Edge) -> None:
        edges = self.inputs.setdefault(target, [])
        if edge not in edges:
            edges.append(edge)

    def _is_usage(self, eid: str) -> bool:
        el = self.sem[eid]
        return el.kind == ArtifactKind.PART and not el.is_definition

    def _descendant_usages(self, eid: str) -> list[str]:
        out: list[str] = []
        for child in self.children.get(eid, []):
            if self._is_usage(child):
                out.append(child)
            out.extend(self._descendant_usages(child))
        return out

    # -- build ---------------------------------------------------------

    def build(self) -> ImpactGraph:
        self._roles()
        for rel in self.relations:
            self._edges(rel)
        return self._finish()

    def _roles(self) -> None:
        """Physical parts, function nodes, functions and logical parts."""
        self._implemented: dict[str, list[str]] = {}  # relation id -> edge sources
        for rel in self.relations:
            kws = rel.metadata_keywords or []
            if rel.kind == ArtifactKind.DEPENDENCY and "implements" in kws:
                src, tgt = self._lift(rel.source_id), self._lift(rel.target_id)
                if not src or not tgt:
                    continue
                if self._is_usage(src):
                    descendants, sources = self._descendant_usages(src), [src]
                elif self.sem[src].is_definition and self.sem[src].kind == ArtifactKind.PART:
                    descendants = sources = self._descendant_usages(src)
                else:
                    continue
                for pid in (*sources, *descendants):
                    self.layers[pid] = Layer.PHYSICAL
                if sources:
                    self._implemented[rel.id] = sources
                    self.layers.setdefault(tgt, Layer.LOGICAL)
            elif rel.kind == ArtifactKind.ALLOCATION:
                src, tgt = self._lift(rel.source_id), self._lift(rel.target_id)
                if not src or not tgt:
                    continue
                if self._kind(src) != ArtifactKind.PART or self._kind(tgt) != ArtifactKind.PART:
                    continue
                self.layers[src] = Layer.FUNCTION_NODE
                self.layers.setdefault(tgt, Layer.LOGICAL)
                owner = self.sem[src].parent_id
                if owner in self.sem:
                    self.layers[owner] = Layer.FUNCTION

    def _edges(self, rel: SemanticElement) -> None:
        layers = self.layers
        kws = set(rel.metadata_keywords or [])
        src, tgt = self._lift(rel.source_id), self._lift(rel.target_id)
        if not src or not tgt:
            return
        if rel.id in self._implemented:
            for s in self._implemented[rel.id]:
                self._add(tgt, Edge(s, "implements"))
        elif rel.kind == ArtifactKind.ALLOCATION:
            if layers.get(src) == Layer.FUNCTION_NODE:
                self._add(src, Edge(tgt, "allocate"))
                owner = self.sem[src].parent_id
                if layers.get(owner) == Layer.FUNCTION:
                    self._add(owner, Edge(src, "node"))
        elif rel.kind == ArtifactKind.INCLUDE:
            if self._kind(src) == ArtifactKind.USE_CASE and self._kind(tgt) == ArtifactKind.USE_CASE:
                layers.setdefault(src, Layer.USE_CASE)
                layers.setdefault(tgt, Layer.USE_CASE)
                self._add(src, Edge(tgt, "include"))
        elif rel.kind == ArtifactKind.SATISFY:
            if self._kind(tgt) == ArtifactKind.REQUIREMENT and self._kind(src) == ArtifactKind.PART:
                layers.setdefault(src, Layer.LOGICAL)
                layers[tgt] = Layer.REQUIREMENT
                self._add(tgt, Edge(src, "satisfy"))
        elif rel.kind == ArtifactKind.DEPENDENCY:
            if "refine" in kws:
                if layers.get(src) in (Layer.FUNCTION, Layer.FUNCTION_NODE) and (
                    self._kind(tgt) == ArtifactKind.USE_CASE
                ):
                    layers[tgt] = Layer.USE_CASE
                    self._add(tgt, Edge(src, "refine"))
            elif "objective" in kws:
                if self._kind(src) == ArtifactKind.USE_CASE and self._kind(tgt) == ArtifactKind.REQUIREMENT:
                    layers.setdefault(src, Layer.USE_CASE)
                    layers[tgt] = Layer.REQUIREMENT
                    self._add(tgt, Edge(src, "objective"))
            elif layers.get(src) == Layer.FUNCTION and layers.get(tgt) == Layer.FUNCTION:
                labels = [k for k in rel.metadata_keywords if k != "Soft" and k not in _TRACE_KEYWORDS]
                if labels:
                    self._add(src, Edge(tgt, f"#{labels[0]}", soft="Soft" in kws))

    # -- gates ---------------------------------------------------------

    def _gate(self, eid: str) -> Gate | None:
        el = self.sem[eid]
        kws = set(el.metadata_keywords or [])
        group = "Pool" if "Pool" in kws else "Redundant" if "Redundant" in kws else None
        if el.multiplicity is None and group is None:
            return None
        n = 1
        if el.multiplicity is not None:
            upper = el.multiplicity.split("..")[-1].strip()
            if not upper.isdigit() or int(upper) < 1:
                self.warnings.append(
                    f"cannot evaluate multiplicity {el.multiplicity!r} of {eid!r}; "
                    "treated as one instance"
                )
                return None
            n = int(upper)
        capacity = self._capacity(eid)
        capacities = (capacity,) * n
        if group == "Pool":
            return Gate(GateKind.POOL, n, self._required(eid) or 0.0, capacities)
        if group == "Redundant":
            k = self._required(eid)
            if k is None:
                self.warnings.append(
                    f"redundant {eid!r} has no required attribute; using 1"
                )
                k = 1.0
            return Gate(GateKind.KOFN, n, k, capacities)
        return Gate(GateKind.AND, n, float(n), capacities)

    def _capacity(self, eid: str) -> float:
        for child in self.children.get(eid, []):
            c = self.sem[child]
            if c.kind == ArtifactKind.ATTRIBUTE and c.name.startswith("capacity"):
                value = _number(c.default_value)
                if value is not None:
                    return value
        return 1.0

    def _required(self, eid: str) -> float | None:
        el = self.sem[eid]
        owner = el.parent_id
        if not owner:
            return None
        named = self.sem.get(f"{owner}::{el.name}Required")
        if named is not None:
            return _number(named.default_value)
        groups = [
            c for c in self.children.get(owner, [])
            if self._is_usage(c) and {"Pool", "Redundant"} & set(self.sem[c].metadata_keywords or [])
        ]
        plain = self.sem.get(f"{owner}::required")
        if len(groups) == 1 and plain is not None:
            return _number(plain.default_value)
        return None

    # -- result --------------------------------------------------------

    def _finish(self) -> ImpactGraph:
        nodes: dict[str, Node] = {}
        for eid, el in self.sem.items():
            layer = self.layers.get(eid)
            if layer is None:
                continue
            gate = self._gate(eid) if layer == Layer.PHYSICAL else None
            nodes[eid] = Node(eid, el.name, layer, gate)
        parent = {
            eid: self.sem[eid].parent_id
            for eid, node in nodes.items()
            if node.layer == Layer.PHYSICAL
            and self.sem[eid].parent_id in nodes
            and nodes[self.sem[eid].parent_id].layer == Layer.PHYSICAL
        }
        inputs = {eid: list(edges) for eid, edges in self.inputs.items() if eid in nodes}
        return ImpactGraph(nodes, inputs, parent, self.warnings)
