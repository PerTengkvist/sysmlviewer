"""FMEA (S, O, D, RPN) and FMECA (C_m, class, level) per failure mode.

The data gives the local effect; everything above it comes from the trace engine.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from domain.failure.model import Failure, FailureKind, Impact, ImpactGraph, Layer, Status
from domain.failure.report import _tag_key, label, short_name
from domain.failure.propagate import affected_nodes, chain, common_cause_targets, evaluate, failure_flags
from domain.fmea.model import FmeaModel, ModeSpec, Unit
from domain.fmea.severity import requirement_groups
from domain.fmea.validate import FmeaValidationError, Findings, mode_findings, reference_findings
from domain.models import SemanticElement

FIT = 1e-9


@dataclass(frozen=True)
class Effect:
    id: str
    label: str
    layer: str  # Layer value
    status: Status
    short_id: str | None = None

    @property
    def text(self) -> str:
        return f"{self.label} {self.status.value}"


@dataclass(frozen=True)
class Row:
    item_id: str
    item_name: str
    qty: int
    sru: str | None
    mode_id: str
    description: str | None
    local_effect: str
    functions: tuple[str, ...]
    next_higher: tuple[Effect, ...]
    end_effect: tuple[Effect, ...]
    chain: tuple[str, ...]
    lost_functions: tuple[str, ...]
    requirements_at_risk: tuple[str, ...]
    flags: frozenset[str]
    detection_method: str | None
    severity: int
    rate_fit: float | None
    mode_ratio: float | None
    effect_probability: float | None
    lambda_m: float | None  # FIT
    occurrence: int | None = None
    detection: int | None = None
    rpn: int | None = None
    c_m: float | None = None
    severity_class: str | None = None
    probability_level: str | None = None
    mission_time_h: float | None = None
    chain_status: tuple[str, ...] = ()  # status of every node in `chain`, same order

    @property
    def key(self) -> tuple[str, str, str]:
        return (self.item_id, self.sru or "", self.mode_id)


@dataclass
class Analysis:
    mode: str
    rows: list[Row]  # model order
    ranking: list[Row]
    matrix: dict[tuple[str, str], list[Row]] = field(default_factory=dict)
    item_criticality: dict[str, float] = field(default_factory=dict)
    mission_time_h: float | None = None


def round_half_up(x: float) -> int:
    return math.floor(x + 0.5 + 1e-9)


def _local_effect(m: ModeSpec) -> str:
    if m.kind is FailureKind.DEGRADED:
        return f"degraded {m.fraction:g}"
    return m.kind.value


def derived_occurrence(lambda_m: float, scale: Sequence) -> int:
    for step in scale:
        if lambda_m <= step.max_fit:
            return step.score
    return 10


def _effects(graph: ImpactGraph, impacts: Mapping[str, Impact], layers: Sequence[Layer]) -> tuple[Effect, ...]:
    """Affected nodes by layer. Use cases and requirements carry their tag (as in the failure
    report) and are sorted by it; the other layers keep the engine's order."""
    out = []
    for layer in layers:
        nodes = affected_nodes(graph, impacts, layer)
        if layer in (Layer.USE_CASE, Layer.REQUIREMENT):
            nodes = sorted(nodes, key=lambda n: _tag_key(graph, n))
        for nid in nodes:
            node = graph.nodes[nid]
            tagged = layer in (Layer.USE_CASE, Layer.REQUIREMENT)
            out.append(
                Effect(
                    nid, label(graph, nid) if tagged else node.name, layer.value,
                    impacts[nid].status, node.short_id if tagged else None,
                )
            )
    return tuple(out)


def _item_name(graph: ImpactGraph, part_id: str) -> str:
    if part_id in graph.nodes:
        return short_name(graph, part_id)
    return ".".join(part_id.split("::")[-2:])


def _functions_of(graph: ImpactGraph, part_id: str) -> tuple[str, ...]:
    logical = set(common_cause_targets(graph, part_id)) if part_id in graph.nodes else set()
    names: list[str] = []
    for nid, node in graph.nodes.items():
        if node.layer is Layer.FUNCTION_NODE and any(
            e.label == "allocate" and e.source in logical for e in graph.inputs.get(nid, ())
        ):
            if node.name not in names:
                names.append(node.name)
    return tuple(names)


def analyze(
    fmea: FmeaModel,
    semantic: Mapping[str, SemanticElement],
    graph: ImpactGraph,
    mode: str,
) -> Analysis:
    if mode not in ("fmea", "fmeca"):
        raise ValueError(f"unknown mode {mode!r}: expected fmea or fmeca")
    problems = reference_findings(fmea).errors + mode_findings(fmea, mode)
    if problems:
        raise FmeaValidationError(Findings(errors=problems))
    cfg = fmea.severity
    groups = requirement_groups(semantic, graph, cfg.requirement_groups)
    mission = cfg.mission_time_h
    cache: dict[Failure, dict[str, Impact]] = {}
    rows: list[Row] = []
    for item in fmea.items:
        node = graph.nodes.get(item.part_id)
        functions = _functions_of(graph, item.part_id)
        name = _item_name(graph, item.part_id)
        for unit in item.units:
            for m in unit.modes:
                failure = Failure(
                    item.part_id, m.kind, m.fraction,
                    1 if node is not None and node.gate is not None else None,
                )
                if failure not in cache:
                    cache[failure] = evaluate(graph, [failure])
                impacts = cache[failure]
                rows.append(_row(fmea, graph, groups, item.part_id, name, item.qty, unit, m,
                                 failure, impacts, functions, mode, mission))
    ranking = sorted(rows, key=_fmea_rank if mode == "fmea" else _fmeca_rank(cfg))
    matrix: dict[tuple[str, str], list[Row]] = {}
    criticality: dict[str, float] = {}
    if mode == "fmeca":
        for r in ranking:
            matrix.setdefault((r.severity_class, r.probability_level), []).append(r)  # type: ignore[arg-type]
        for r in rows:
            criticality[r.item_id] = criticality.get(r.item_id, 0.0) + (r.c_m or 0.0)
    return Analysis(mode, rows, ranking, matrix, criticality, mission if mode == "fmeca" else None)


def _fmea_rank(r: Row) -> tuple:
    return (-(r.rpn or 0), *r.key)


def _fmeca_rank(cfg):
    order = {c.label: i for i, c in enumerate(cfg.severity_classes)}
    return lambda r: (order[r.severity_class], -(r.c_m or 0.0), *r.key)


def _row(fmea, graph, groups, part_id, name, qty, unit: Unit, m: ModeSpec, failure, impacts,
         functions, mode, mission) -> Row:
    cfg = fmea.severity
    next_higher = _effects(graph, impacts, [Layer.LOGICAL, Layer.FUNCTION])
    end_effect = _effects(graph, impacts, [Layer.USE_CASE, Layer.REQUIREMENT])
    best, target = 0, None
    for e in end_effect:
        if e.layer != Layer.REQUIREMENT.value:
            continue
        score = max((cfg.requirement_groups[g] for g in groups.get(e.id, ())), default=cfg.default_group_score)
        value = round_half_up(score * getattr(cfg.status_factor, e.status.value))
        if value > best:
            best, target = value, e.id
    severity = min(10, max(1, best))
    if target is None:
        fns = [e for e in next_higher if e.layer == Layer.FUNCTION.value]
        target = fns[0].id if fns else None
    path = (target, *chain(impacts, target)) if target else ()
    path_status = tuple(impacts[n].status.value for n in path)
    flags = failure_flags(graph, failure)
    if part_id in impacts:
        flags = flags | impacts[part_id].flags
    lost = tuple(e.id for e in next_higher if e.layer == Layer.FUNCTION.value and e.status is Status.LOST)
    lam = unit.rate_fit * m.mode_ratio if unit.rate_fit is not None and m.mode_ratio is not None else None
    base = dict(
        item_id=part_id, item_name=name, qty=qty, sru=unit.sru, mode_id=m.id, description=m.description,
        local_effect=_local_effect(m), functions=functions, next_higher=next_higher, end_effect=end_effect,
        chain=path, chain_status=path_status, lost_functions=lost,
        requirements_at_risk=tuple(e.id for e in end_effect if e.layer == Layer.REQUIREMENT.value),
        flags=frozenset(flags), detection_method=m.detection_method, severity=severity,
        rate_fit=unit.rate_fit, mode_ratio=m.mode_ratio, effect_probability=m.effect_probability,
        lambda_m=lam,
    )
    if mode == "fmea":
        o = m.occurrence if m.occurrence is not None else derived_occurrence(lam, cfg.occurrence_scale)
        return Row(**base, occurrence=o, detection=m.detection_score, rpn=severity * o * m.detection_score)
    c_m = lam * FIT * m.effect_probability * mission
    cls = next(c.label for c in cfg.severity_classes if severity >= c.min_severity)
    level = next(p.label for p in cfg.probability_levels if c_m >= p.min_cm)
    return Row(**base, c_m=c_m, severity_class=cls, probability_level=level, mission_time_h=mission)


def spof_modes(rows: Sequence[Row], threshold: int) -> list[Row]:
    """Modes that alone lose at least one function and have S at or above the threshold."""
    return [r for r in rows if r.lost_functions and r.severity >= threshold]
