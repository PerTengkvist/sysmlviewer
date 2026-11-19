"""Drift between the FMEA data and the model, per-mode field requirements, coverage."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from domain.failure.model import ImpactGraph, Layer
from domain.fmea.model import FmeaModel, Loc
from domain.fmea.severity import model_groups, requirement_groups, severity_downgrades
from domain.models import SemanticElement

MODES = ("fmea", "fmeca", "both")

_DEF_FIX = "update 'part_def' in {file} to the new name, or rename the part definition back in the SysML model."
_PART_FIX = "update 'part' in {file} to the new name, or rename the part back in the SysML model."
_LONGER_FIX = "use a longer qualified name in {path} of {file}."

_DRIFT = {
    "unknown-part-def": ("The model has no part definition '{ref}'.", _DEF_FIX),
    "not-a-part-def": ("'{ref}' is not a part definition in the model.", _DEF_FIX),
    "ambiguous-part-def": ("'{ref}' matches several part definitions; use the qualified name.", _LONGER_FIX),
    "unknown-part": ("The model has no part '{ref}'.", _PART_FIX),
    "not-a-part-usage": ("'{ref}' is not a part usage in the model.", _PART_FIX),
    "ambiguous-part": ("'{ref}' matches several parts; use the qualified name.", _LONGER_FIX),
    "duplicate-part": (
        "'{ref}' is also described at {other}.",
        "keep one entry for the part in {file} and merge the failure modes into it.",
    ),
    "mode-ratio-sum": (
        "The mode ratios of '{ref}' sum to {detail}, which is more than 1.",
        "lower a 'mode_ratio' (or an override) in {file} so that one item or SRU sums to at most 1.",
    ),
    "unused-library": (
        "No part usage in the model is typed by '{ref}', so its failure modes apply to nothing.",
        "retype the parts that should use it to '{ref}', or update 'part_def' in {file}.",
    ),
    "unknown-mode-id": (
        "The library has no failure mode '{ref}' to override.",
        "use the id of a mode of the library, in {path} of {file}.",
    ),
}


@dataclass(frozen=True)
class Finding:
    code: str
    file: str
    path: str
    line: int | None
    message: str
    ref: str | None = None
    suggestions: tuple[str, ...] = ()
    fix: str | None = None  # may contain {file}


@dataclass
class Findings:
    errors: list[Finding] = field(default_factory=list)
    warnings: list[Finding] = field(default_factory=list)


class FmeaValidationError(ValueError):
    def __init__(self, findings: Findings) -> None:
        super().__init__(f"{len(findings.errors)} validation error(s)")
        self.findings = findings


_WARNING_CODES = {"unused-library"}


def reference_findings(fmea: FmeaModel) -> Findings:
    out = Findings()
    seen: set[tuple[str, str, str]] = set()
    for u in fmea.unresolved:
        message, fix = _DRIFT[u.code]
        other = ""
        if u.other is not None:
            other = f"{u.other.file}:{fmea.line(u.other) or 1}"
        finding = Finding(
            u.code, u.loc.file, u.loc.path, fmea.line(u.loc),
            message.format(ref=u.ref, other=other, detail=u.detail), u.ref, u.suggestions,
            fix.format(file="{file}", path=u.loc.path, ref=u.ref),
        )
        key = (u.code, u.loc.file, u.loc.path)
        if key in seen:
            continue
        seen.add(key)
        (out.warnings if u.code in _WARNING_CODES else out.errors).append(finding)
    for s in fmea.short_refs:
        out.warnings.append(
            Finding(
                "short-reference", s.loc.file, s.loc.path, fmea.line(s.loc),
                f"use the qualified name {s.resolved}", s.ref, (s.resolved,),
            )
        )
    return out


def mode_findings(fmea: FmeaModel, mode: str) -> list[Finding]:
    """Fields that are missing for the mode(s); one finding per place and field."""
    if mode not in MODES:
        raise ValueError(f"unknown mode {mode!r}")
    found: dict[tuple[str, str, str], Finding] = {}

    def missing(loc: Loc, message: str) -> None:
        key = (loc.file, loc.path, message)
        if key not in found:
            found[key] = Finding("missing-field", loc.file, loc.path, fmea.line(loc), message)

    want_fmea, want_fmeca = mode in ("fmea", "both"), mode in ("fmeca", "both")
    scale = fmea.severity.occurrence_scale
    for item in fmea.items:
        for unit in item.units:
            if not unit.modes:
                continue
            if want_fmeca and unit.rate_fit is None:
                missing(unit.rate_loc, "'rate_fit' is required for --mode fmeca")
            for m in unit.modes:
                if want_fmea:
                    derivable = unit.rate_fit is not None and m.mode_ratio is not None and scale
                    if m.occurrence is None and not derivable:
                        missing(
                            m.loc,
                            f"failure mode '{m.id}' needs 'occurrence' (1-10), or 'rate_fit' + "
                            "'mode_ratio' with an 'occurrence_scale' in severity.yaml "
                            "(needed for --mode fmea)",
                        )
                    if m.detection_score is None:
                        missing(m.loc, "'detection.score' is required for --mode fmea")
                if want_fmeca:
                    if m.mode_ratio is None:
                        missing(m.loc, "'mode_ratio' is required for --mode fmeca")
                    if m.effect_probability is None:
                        missing(m.loc, "'effect_probability' is required for --mode fmeca")
    if want_fmeca and fmea.severity.mission_time_h is None:
        missing(Loc(fmea.severity_file, "mission_time_h"), "'mission_time_h' is required for --mode fmeca")
    return list(found.values())


def group_findings(fmea: FmeaModel, semantic: Mapping[str, SemanticElement]) -> list[Finding]:
    configured = set(fmea.severity.requirement_groups)
    in_model = model_groups(semantic)
    out = []
    for name in sorted(configured - in_model):
        loc = Loc(fmea.severity_file, f"requirement_groups.{name}")
        out.append(
            Finding(
                "unknown-group", loc.file, loc.path, fmea.line(loc),
                f"no requirement in the model has Type '{name}'", name,
            )
        )
    for name in sorted(in_model - configured):
        loc = Loc(fmea.severity_file, "requirement_groups")
        out.append(
            Finding(
                "unknown-group", loc.file, loc.path, fmea.line(loc),
                f"requirements of group '{name}' are not scored; default_group_score applies", name,
            )
        )
    for d in severity_downgrades(semantic, fmea.severity.requirement_groups):
        out.append(
            Finding(
                "severity-downgrade", "", d.req_id, None,
                f"requirement '{d.req_id}' has Type '{d.own_type}' (score {d.own_score}), but "
                f"'{d.ancestor_id}' higher up its #refine chain has Type '{d.ancestor_type}' "
                f"(score {d.ancestor_score}). S follows the requirement's own Type, so it is "
                f"scored {d.own_score}. Check whether mixing requirement levels in one chain is intended.",
            )
        )
    return out


def validate(
    fmea: FmeaModel,
    semantic: Mapping[str, SemanticElement],
    mode: str = "both",
) -> Findings:
    findings = reference_findings(fmea)
    findings.errors += mode_findings(fmea, mode)
    findings.warnings += group_findings(fmea, semantic)
    return findings


@dataclass
class Coverage:
    parts_without_modes: list[str]
    modes_without_trace: list[str]
    requirements_without_group: list[str]


def coverage(
    fmea: FmeaModel, semantic: Mapping[str, SemanticElement], graph: ImpactGraph
) -> Coverage:
    with_modes = {i.part_id for i in fmea.items if any(u.modes for u in i.units)}
    parts = [
        nid for nid, node in graph.nodes.items()
        if node.layer is Layer.PHYSICAL and nid not in with_modes
    ]
    untraced = []
    for item in fmea.items:
        node = graph.nodes.get(item.part_id)
        if node is not None and node.layer is Layer.PHYSICAL:
            continue
        for unit in item.units:
            for m in unit.modes:
                untraced.append("/".join(p for p in (item.part_id, unit.sru, m.id) if p))
    groups = requirement_groups(semantic, graph, fmea.severity.requirement_groups)
    return Coverage(parts, untraced, [rid for rid, g in groups.items() if not g])
