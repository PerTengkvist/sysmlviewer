"""Use case realization: how functions, function nodes and logical parts realize a use case.

The one link written by hand is a `#refine` dependency from a function step to a
use case step. Everything else is derived from it through ownership, `perform`
and `allocate`. Roles come from relations, never from names:

- use case step (UC step): an action directly in a use case, other than the
  `start` / `done` markers and `then perform X` include steps;
- actor step: a UC step that an actor performs (`actor X { perform step; }`);
  system step: a UC step no actor performs;
- function flow: an action owned by a part that has steps of its own; function
  step: an action directly in such a flow; function: the part that owns the flow;
- function node: a part that performs a function step (or is allocated to a logical
  part); logical part: the target of a function node's `allocate`.

Allowed `#refine` ends: a function step or a flow refines a UC step or a use case; a
function or function node refines a use case (the form models used before steps).
Precision: `step` (function step -> UC step), `coarse` (a flow, or a function step
towards a use case, or a flow towards a UC step) and `explicit` (function or function
node -> use case). The best precision wins when several links reach the same element.

A use case is in scope (opt-in) as soon as one of its steps is the target of a step
link; coverage findings are only reported for use cases and flows in scope, so a model
without step links behaves as before. Pure domain logic: no I/O.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Literal

from domain.models import ArtifactKind, SemanticElement
from domain.occurrence import in_occurrence
from domain.perform import is_perform, resolve_performers

Precision = Literal["step", "coarse", "explicit"]
_RANK: dict[str, int] = {"step": 0, "coarse": 1, "explicit": 2}
_MARKERS = frozenset({"start", "done"})

UNREALIZED_SYSTEM_STEP = "unrealized-system-step"
UNTRACED_FUNCTION_STEP = "untraced-function-step"
REFINE_WITHOUT_STEP = "refine-without-step"
EXPLICIT_MISMATCH = "explicit-mismatch"
BAD_REALIZATION_END = "bad-realization-end"


@dataclass(frozen=True)
class RealizationLink:
    refine_id: str  # dependency id
    source_id: str  # function step | flow | function | function node
    target_id: str  # UC step | use case
    precision: Precision


@dataclass(frozen=True)
class Finding:
    code: str
    element_id: str
    message: str


@dataclass
class Realization:
    links: list[RealizationLink] = field(default_factory=list)  # declaration order
    actor_steps: dict[str, dict[str, str]] = field(default_factory=dict)  # uc -> {step: actor}
    system_steps: dict[str, list[str]] = field(default_factory=dict)  # uc -> [step]
    step_realizers: dict[str, list[str]] = field(default_factory=dict)  # UC step -> [function step]
    coarse_realizers: dict[str, list[str]] = field(default_factory=dict)  # UC (step) -> [flow | function step]
    uc_functions: dict[str, dict[str, Precision]] = field(default_factory=dict)
    uc_nodes: dict[str, dict[str, Precision]] = field(default_factory=dict)
    uc_parts: dict[str, dict[str, Precision]] = field(default_factory=dict)
    # uc -> ids that reach it only through `include` (also present in the uc_* maps)
    via_include: dict[str, set[str]] = field(default_factory=dict)
    # (uc, function | node | part) pairs a `#refine` declares directly, whatever wins
    declared: set[tuple[str, str]] = field(default_factory=set)
    in_scope: set[str] = field(default_factory=set)
    findings: list[Finding] = field(default_factory=list)


def derive_realization(
    semantic: Mapping[str, SemanticElement],
    performers: Mapping[str, list[str]] | None = None,
) -> Realization:
    if performers is None:
        performers = resolve_performers(dict(semantic))
    return _Deriver(semantic, performers).run()


def _put(target: dict[str, Precision], key: str, precision: Precision) -> None:
    current = target.get(key)
    if current is None or _RANK[precision] < _RANK[current]:
        target[key] = precision


class _Deriver:
    def __init__(
        self, semantic: Mapping[str, SemanticElement], performers: Mapping[str, list[str]]
    ) -> None:
        self.sem = semantic
        self.out = Realization()
        order = {eid: i for i, eid in enumerate(semantic)}
        self.performers: dict[str, list[str]] = {
            action: sorted(owners, key=lambda o: order.get(o, 0))
            for action, owners in performers.items()
        }
        self.children: dict[str, list[str]] = {}
        for eid, el in semantic.items():
            if el.parent_id:
                self.children.setdefault(el.parent_id, []).append(eid)
        self.allocated_to: dict[str, list[str]] = {}
        self.alloc_sources: set[str] = set()
        for el in semantic.values():
            if el.kind == ArtifactKind.ALLOCATION and el.source_id in semantic and el.target_id in semantic:
                if semantic[el.target_id].kind == ArtifactKind.PART:
                    self.allocated_to.setdefault(el.source_id, []).append(el.target_id)
                    self.alloc_sources.add(el.source_id)

    # -- roles ---------------------------------------------------------

    def _is_step(self, el: SemanticElement) -> bool:
        return (
            el.kind == ArtifactKind.ACTION
            and not is_perform(el)
            and (el.type_ref or "") not in _MARKERS
        )

    def _steps_of(self, owner_id: str) -> list[str]:
        return [c for c in self.children.get(owner_id, []) if self._is_step(self.sem[c])]

    def _owner(self, el: SemanticElement) -> SemanticElement | None:
        return self.sem.get(el.parent_id) if el.parent_id else None

    def _is_use_case(self, el: SemanticElement) -> bool:
        return el.kind == ArtifactKind.USE_CASE

    def _is_uc_step(self, el: SemanticElement) -> bool:
        owner = self._owner(el)
        return self._is_step(el) and owner is not None and self._is_use_case(owner)

    def _is_flow(self, el: SemanticElement) -> bool:
        owner = self._owner(el)
        return (
            self._is_step(el)
            and owner is not None
            and owner.kind == ArtifactKind.PART
            and not in_occurrence(self.sem, el.id)
            and bool(self._steps_of(el.id))
        )

    def _is_function_step(self, el: SemanticElement) -> bool:
        owner = self._owner(el)
        return owner is not None and self._is_step(el) and self._is_flow(owner)

    def _is_function(self, el: SemanticElement) -> bool:
        return (
            el.kind == ArtifactKind.PART
            and not in_occurrence(self.sem, el.id)
            and any(self._is_flow(self.sem[c]) for c in self.children.get(el.id, []))
        )

    def _is_node(self, el: SemanticElement) -> bool:
        if el.kind != ArtifactKind.PART or in_occurrence(self.sem, el.id) or self._is_function(el):
            return False
        return el.id in self.alloc_sources or any(
            is_perform(self.sem[c]) for c in self.children.get(el.id, [])
        )

    def _role(self, eid: str) -> str | None:
        el = self.sem.get(eid)
        if el is None:
            return None
        if self._is_use_case(el):
            return "uc"
        if self._is_uc_step(el):
            return "uc_step"
        if self._is_function_step(el):
            return "f_step"
        if self._is_flow(el):
            return "flow"
        if self._is_function(el):
            return "function"
        if self._is_node(el):
            return "node"
        return None

    def _function_nodes(self, action_id: str) -> list[str]:
        return [
            p
            for p in self.performers.get(action_id, [])
            if self.sem[p].kind == ArtifactKind.PART and not in_occurrence(self.sem, p)
        ]

    # -- derivation ----------------------------------------------------

    def run(self) -> Realization:
        out = self.out
        self._steps()
        for rel in self.sem.values():
            if (
                rel.kind == ArtifactKind.DEPENDENCY
                and "refine" in (rel.metadata_keywords or [])
                and rel.source_id in self.sem
                and rel.target_id in self.sem
            ):
                self._link(rel)
        self._include_union()
        self._findings()
        return out

    def _steps(self) -> None:
        for uc in self.sem.values():
            if not self._is_use_case(uc):
                continue
            actors: dict[str, str] = {}
            system: list[str] = []
            for sid in self._steps_of(uc.id):
                actor = next(
                    (p for p in self.performers.get(sid, []) if self.sem[p].kind == ArtifactKind.ACTOR),
                    None,
                )
                if actor:
                    actors[sid] = actor
                else:
                    system.append(sid)
            if actors:
                self.out.actor_steps[uc.id] = actors
            if system:
                self.out.system_steps[uc.id] = system

    def _bad(self, rel: SemanticElement, src_role: str | None, tgt_role: str | None) -> None:
        self.out.findings.append(
            Finding(
                BAD_REALIZATION_END,
                rel.id,
                f"#refine from {src_role or 'an element'} {rel.source_id!r} to "
                f"{tgt_role or 'an element'} {rel.target_id!r} is not a realization: a function "
                "step or flow refines a use case step or use case; a function or function node "
                "refines a use case",
            )
        )

    def _link(self, rel: SemanticElement) -> None:
        src, tgt = rel.source_id or "", rel.target_id or ""
        s_role, t_role = self._role(src), self._role(tgt)
        if "f_step" in (s_role, t_role) or "uc_step" in (s_role, t_role):
            if not (
                (s_role in ("f_step", "flow") and t_role in ("uc_step", "uc"))
                or (s_role in ("function", "node") and t_role == "uc")
            ):
                self._bad(rel, s_role, t_role)
                return
        if t_role not in ("uc_step", "uc") or s_role not in ("f_step", "flow", "function", "node"):
            return  # ordinary traceability, not a realization
        uc = tgt if t_role == "uc" else self.sem[tgt].parent_id or ""
        if s_role in ("function", "node"):
            precision: Precision = "explicit"
        elif s_role == "f_step" and t_role == "uc_step":
            precision = "step"
        else:
            precision = "coarse"
        self.out.links.append(RealizationLink(rel.id, src, tgt, precision))
        out = self.out
        if s_role == "function":
            _put(out.uc_functions.setdefault(uc, {}), src, precision)
            out.declared.add((uc, src))
        elif s_role == "node":
            self._add_node(uc, src, precision)
            out.declared.add((uc, src))
            for part in self.allocated_to.get(src, []):
                out.declared.add((uc, part))
        else:
            steps = [src] if s_role == "f_step" else self._steps_of(src)
            flow = self.sem[src].parent_id if s_role == "f_step" else src
            function = self.sem[flow or ""].parent_id if flow in self.sem else None
            if precision == "step":
                realizers = out.step_realizers.setdefault(tgt, [])
            else:
                realizers = out.coarse_realizers.setdefault(tgt, [])
            if src not in realizers:
                realizers.append(src)
            if function:
                _put(out.uc_functions.setdefault(uc, {}), function, precision)
            for step in steps:
                for node in self._function_nodes(step):
                    self._add_node(uc, node, precision)

    def _add_node(self, uc: str, node: str, precision: Precision) -> None:
        _put(self.out.uc_nodes.setdefault(uc, {}), node, precision)
        for part in self.allocated_to.get(node, []):
            _put(self.out.uc_parts.setdefault(uc, {}), part, precision)

    def _include_union(self) -> None:
        out = self.out
        includes: dict[str, list[str]] = {}
        for el in self.sem.values():
            if (
                el.kind == ArtifactKind.INCLUDE
                and el.source_id in self.sem
                and el.target_id in self.sem
                and self._is_use_case(self.sem[el.source_id])
                and self._is_use_case(self.sem[el.target_id])
            ):
                includes.setdefault(el.source_id, []).append(el.target_id)  # type: ignore[arg-type]
        direct = (
            {k: dict(v) for k, v in out.uc_functions.items()},
            {k: dict(v) for k, v in out.uc_nodes.items()},
            {k: dict(v) for k, v in out.uc_parts.items()},
        )
        targets = (out.uc_functions, out.uc_nodes, out.uc_parts)
        for uc in includes:
            reached: list[str] = []
            queue = list(includes[uc])
            while queue:
                inc = queue.pop(0)
                if inc == uc or inc in reached:
                    continue
                reached.append(inc)
                queue.extend(includes.get(inc, []))
            for direct_map, target in zip(direct, targets):
                for inc in reached:
                    for key, precision in direct_map.get(inc, {}).items():
                        if key not in direct_map.get(uc, {}):
                            out.via_include.setdefault(uc, set()).add(key)
                        _put(target.setdefault(uc, {}), key, precision)

    # -- findings ------------------------------------------------------

    def _findings(self) -> None:
        out = self.out
        stepped_flows: set[str] = set()
        for link in out.links:
            if link.precision == "step":
                uc = self.sem[link.target_id].parent_id
                if uc:
                    out.in_scope.add(uc)
                stepped_flows.add(self.sem[link.source_id].parent_id or "")
        linked_sources = {link.source_id for link in out.links}

        for uc in self.sem:
            if uc not in out.in_scope:
                continue
            for step in out.system_steps.get(uc, []):
                if step in out.step_realizers or step in out.coarse_realizers or uc in out.coarse_realizers:
                    continue
                out.findings.append(
                    Finding(
                        UNREALIZED_SYSTEM_STEP,
                        step,
                        f"system step {step!r} of use case {uc!r} is not realized by any function step",
                    )
                )
        for flow in sorted(stepped_flows, key=list(self.sem).index):
            for step in self._steps_of(flow):
                if step not in linked_sources:
                    out.findings.append(
                        Finding(
                            UNTRACED_FUNCTION_STEP,
                            step,
                            f"function step {step!r} has no #refine to a use case step, "
                            f"although other steps of {flow!r} do",
                        )
                    )
        for uc in self.sem:
            if uc not in out.in_scope:
                continue
            for function, precision in out.uc_functions.get(uc, {}).items():
                if precision == "explicit":
                    out.findings.append(
                        Finding(
                            REFINE_WITHOUT_STEP,
                            function,
                            f"function {function!r} refines use case {uc!r}, but none of its "
                            "steps realizes a step of the use case",
                        )
                    )
            nodes = out.uc_nodes.get(uc, {})
            declared_nodes = {n for u, n in out.declared if u == uc and self._is_node(self.sem[n])}
            if not declared_nodes:
                continue
            for node in declared_nodes:
                if nodes.get(node) == "explicit":
                    out.findings.append(
                        Finding(
                            EXPLICIT_MISMATCH,
                            node,
                            f"function node {node!r} refines use case {uc!r}, but none of the "
                            "steps it performs realizes a step of the use case",
                        )
                    )
            for node, precision in nodes.items():
                if precision == "step" and node not in declared_nodes:
                    out.findings.append(
                        Finding(
                            EXPLICIT_MISMATCH,
                            node,
                            f"function node {node!r} realizes steps of use case {uc!r}, but has "
                            "no #refine to it, although other function nodes do",
                        )
                    )
        out.findings.sort(key=lambda f: (f.code, f.element_id))
