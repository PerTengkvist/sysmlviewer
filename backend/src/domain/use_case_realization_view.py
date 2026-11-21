"""What the white-box activity of a use case (`ActionFlowView` on a use case) needs to draw.

`build_realization_flow` slices a `Realization` (domain/realization.py, which does all the
deriving) down to one use case and lists the model elements the client needs to draw it:

- the use case with its own steps, markers, decisions and successions, its actors and the
  steps they perform, its subject and the use cases it includes (call nodes);
- for each step that a function step or flow realizes: the realizer, its flow (the
  successions give the order of the steps), the function and the function nodes that perform
  it, and the logical parts those nodes are allocated to.

Nothing is derived here beyond choosing what to show; the client only reads the slice.
Pure domain logic: no I/O.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from domain.models import ArtifactKind, SemanticElement, ViewDef
from domain.perform import is_perform, resolve_perform_target
from domain.realization import Realization
from domain.realization_labels import unambiguous_labels

_MARKERS = frozenset({"start", "done", "decide", "decision", "condition"})


@dataclass
class RealizationFlow:
    use_case_id: str
    ids: list[str] = field(default_factory=list)  # semantic ids to send, unordered
    realization: dict[str, Any] = field(default_factory=dict)
    lane_targets: dict[str, list[str]] = field(default_factory=dict)  # node -> logical parts
    labels: dict[str, str] = field(default_factory=dict)


def _is_step(el: SemanticElement) -> bool:
    return el.kind == ArtifactKind.ACTION and not is_perform(el) and (el.type_ref or "") not in _MARKERS


def _unique(items: list[str]) -> list[str]:
    return list(dict.fromkeys(items))


def _view_of(views: Sequence[ViewDef], use_case_id: str) -> str | None:
    """The view to open for a use case: its activity view, else the first view that exposes it."""
    exposing = [v for v in views if v.root_artifact_id == use_case_id]
    activity = [v for v in exposing if v.type_ref == "ActionFlowView"]
    chosen = (activity or exposing or [None])[0]
    return chosen.id if chosen else None


def _calls(
    semantic: Mapping[str, SemanticElement], uc: SemanticElement, views: Sequence[ViewDef]
) -> list[dict[str, str | None]]:
    """`then perform X;` and `include use case X;` where X is a use case, in declaration order."""
    calls: list[dict[str, str | None]] = []
    performed: set[str] = set()
    for cid in uc.children:
        el = semantic.get(cid)
        if el is None or el.kind != ArtifactKind.ACTION or not is_perform(el):
            continue
        target = el.perform_target_id
        if target not in semantic:
            target = resolve_perform_target(dict(semantic), el)
        if target and semantic[target].kind == ArtifactKind.USE_CASE:
            calls.append({"id": cid, "calledUseCaseId": target, "viewId": _view_of(views, target)})
            performed.add(target)
    for cid in uc.children:
        el = semantic.get(cid)
        if (
            el is not None
            and el.kind == ArtifactKind.INCLUDE
            and el.target_id in semantic
            and semantic[el.target_id].kind == ArtifactKind.USE_CASE
            and el.target_id not in performed
        ):
            calls.append(
                {"id": cid, "calledUseCaseId": el.target_id, "viewId": _view_of(views, el.target_id)}
            )
    rank = {cid: i for i, cid in enumerate(uc.children)}
    calls.sort(key=lambda c: rank.get(str(c["id"]), 0))
    return calls


def _flow_of(semantic: Mapping[str, SemanticElement], realizer: str) -> str | None:
    """The flow of a realizer: the realizer itself when a part owns it, else its owner."""
    owner = semantic.get(semantic[realizer].parent_id or "")
    if owner is None:
        return None
    return realizer if owner.kind == ArtifactKind.PART else owner.id


def _function_of(semantic: Mapping[str, SemanticElement], realizer: str) -> str | None:
    """The part that owns the flow of a realizer (a flow, or a step of a flow)."""
    flow = _flow_of(semantic, realizer)
    owner = semantic.get(semantic[flow].parent_id or "") if flow else None
    return owner.id if owner is not None and owner.kind == ArtifactKind.PART else None


def build_realization_flow(
    semantic: Mapping[str, SemanticElement],
    realization: Realization,
    use_case_id: str,
    views: Sequence[ViewDef] = (),
) -> RealizationFlow:
    r = realization
    uc = semantic[use_case_id]
    out = RealizationFlow(use_case_id)
    ids: list[str] = [use_case_id]

    children = [semantic[c] for c in uc.children if c in semantic]
    for child in children:
        ids.append(child.id)
        if child.kind == ArtifactKind.ACTOR:
            ids.extend(g for g in child.children if g in semantic)
    subject = next(
        (c.id for c in children if c.kind == ArtifactKind.PART and "subject" in c.metadata_keywords),
        None,
    )

    actor_steps = dict(r.actor_steps.get(use_case_id, {}))
    system_steps = list(r.system_steps.get(use_case_id, []))
    rank = {eid: i for i, eid in enumerate(semantic)}
    actors = sorted(set(actor_steps.values()), key=lambda a: rank.get(a, 0))

    step_realizers: dict[str, list[str]] = {}
    coarse_steps: dict[str, list[str]] = {}
    unrealized: list[str] = []
    uc_coarse = r.coarse_realizers.get(use_case_id, [])
    for step in system_steps:
        stepwise = r.step_realizers.get(step, [])
        coarse = r.coarse_realizers.get(step, []) or uc_coarse
        if stepwise:
            step_realizers[step] = list(stepwise)
        elif coarse:
            coarse_steps[step] = list(coarse)
        elif use_case_id in r.in_scope:
            unrealized.append(step)

    realizers = _unique([f for fs in step_realizers.values() for f in fs]
                        + [f for fs in coarse_steps.values() for f in fs])
    realizer_nodes = {f: list(r.realizer_nodes.get(f, [])) for f in realizers}
    nodes = _unique([n for ns in realizer_nodes.values() for n in ns])
    node_functions = {
        n: list(fns)
        for n, fns in r.uc_node_functions.get(use_case_id, {}).items()
        if n in nodes
    }
    realizer_functions: dict[str, str] = {}
    for realizer in realizers:
        function = _function_of(semantic, realizer)
        if function:
            realizer_functions[realizer] = function

    functions = _unique(list(realizer_functions.values()) + [f for fs in node_functions.values() for f in fs])
    for realizer in realizers:
        ids.append(realizer)
        flow = _flow_of(semantic, realizer)
        if flow in semantic:
            ids.append(flow)  # type: ignore[arg-type]
            ids.extend(c for c in semantic[flow].children if c in semantic)  # type: ignore[index]
    ids.extend(functions)
    ids.extend(nodes)
    lane_targets = {n: list(r.node_parts.get(n, [])) for n in nodes if r.node_parts.get(n)}
    ids.extend(p for ps in lane_targets.values() for p in ps)
    ids.extend(actors)

    calls = _calls(semantic, uc, views)
    for call in calls:
        ids.append(call["calledUseCaseId"])

    out.ids = _unique([i for i in ids if i in semantic])
    out.lane_targets = lane_targets
    out.realization = {
        "useCaseId": use_case_id,
        "subject": subject,
        "inScope": use_case_id in r.in_scope,
        "actors": actors,
        "actorSteps": actor_steps,
        "systemSteps": system_steps,
        "unrealizedSteps": unrealized,
        "coarseSteps": coarse_steps,
        "stepRealizers": step_realizers,
        "realizerNodes": realizer_nodes,
        "realizerFunctions": realizer_functions,
        "nodeFunctions": node_functions,
        "calls": calls,
    }
    labelled = _unique(actors + nodes + functions + realizers + [p for ps in lane_targets.values() for p in ps])
    out.labels = unambiguous_labels(semantic, labelled)
    return out

