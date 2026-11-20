"""Build the FMEA model from parsed data files and the SysML model.

Takes already parsed mappings; reading YAML is an adapter's job. References that
cannot be resolved are collected in `FmeaModel.unresolved` for `validate`.
"""

from __future__ import annotations

import difflib
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any

from pydantic import ValidationError

from domain.failure.model import FailureKind
from domain.failure.scenarios import AmbiguousName, UnknownName, resolve_failure_target
from domain.fmea.model import FmeaModel, Item, Loc, ModeSpec, ShortRef, Unit, Unresolved
from domain.fmea.schema import (
    FailureMode,
    InstanceEntry,
    ModeOverride,
    PartLibrary,
    SeverityConfig,
    instances_model,
)
from domain.models import ArtifactKind, SemanticElement
from domain.name_resolution import NameResolver
from domain.occurrence import in_occurrence

SEVERITY_FILE = "severity.yaml"
INSTANCES_FILE = "instances.yaml"
RATIO_EPS = 1e-9


@dataclass(frozen=True)
class FmeaSources:
    data: dict[str, Any]  # relative file -> parsed content
    lines: Mapping[tuple[str, str], int]  # (file, json path) -> line


class FmeaLoadError(ValueError):
    def __init__(self, file: str, line: int | None, message: str) -> None:
        where = f"{file}:{line}:" if line is not None else f"{file}:"
        super().__init__(f"{where} {message}")
        self.file = file
        self.line = line


def _path(loc: tuple[Any, ...]) -> str:
    out = ""
    for part in loc:
        out += f"[{part}]" if isinstance(part, int) else (f".{part}" if out else str(part))
    return out


def _validated(sources: FmeaSources, file: str, validate: Any) -> Any:
    try:
        return validate(sources.data[file])
    except ValidationError as exc:
        messages = []
        for err in exc.errors():
            path = _path(err["loc"])
            probe = FmeaModel([], None, lines=sources.lines)  # type: ignore[arg-type]
            line = probe.line(Loc(file, path))
            where = f"{path}: " if path else ""
            messages.append((line, f"{where}{err['msg']}"))
        first_line, first = messages[0]
        error = FmeaLoadError(file, first_line, first)
        for line, text in messages[1:]:
            error.args = (f"{error.args[0]}\n{file}:{line}: {text}",)
        raise error from None


def _spec(mode: FailureMode, loc: Loc) -> ModeSpec:
    detection = mode.detection
    return ModeSpec(
        id=mode.id,
        kind=FailureKind(mode.local_effect.kind),
        fraction=mode.local_effect.fraction,
        description=mode.description,
        mode_ratio=mode.mode_ratio,
        effect_probability=mode.effect_probability,
        occurrence=mode.occurrence,
        detection_score=detection.score if detection else None,
        detection_method=detection.method if detection else None,
        loc=loc,
    )


def _override(spec: ModeSpec, ov: ModeOverride) -> ModeSpec:
    changes: dict[str, Any] = {}
    for name in ("description", "mode_ratio", "effect_probability", "occurrence"):
        if getattr(ov, name) is not None:
            changes[name] = getattr(ov, name)
    if ov.local_effect is not None:
        changes["kind"] = FailureKind(ov.local_effect.kind)
        changes["fraction"] = ov.local_effect.fraction
    if ov.detection is not None:
        if ov.detection.score is not None:
            changes["detection_score"] = ov.detection.score
        if ov.detection.method is not None:
            changes["detection_method"] = ov.detection.method
    return replace(spec, **changes)


def _qty(el: SemanticElement) -> int:
    if el.multiplicity is None:
        return 1
    upper = el.multiplicity.split("..")[-1].strip()
    return int(upper) if upper.isdigit() and int(upper) >= 1 else 1


def _is_part_def(el: SemanticElement) -> bool:
    return el.kind == ArtifactKind.PART and el.is_definition


def _is_part_usage(el: SemanticElement, semantic: Mapping[str, SemanticElement]) -> bool:
    """A part usage of the system, not a lifeline of a scenario (a part of an occurrence)."""
    return (
        el.kind == ArtifactKind.PART
        and not el.is_definition
        and not in_occurrence(semantic, el.id)
    )


def _suggest(ref: str, elements: list[SemanticElement]) -> tuple[str, ...]:
    """Candidates for an unknown part def: first a def of exactly that name in any
    package (the reference names the wrong package), then close names in the named
    package, so that a type of a similar name elsewhere (the logical part types) does
    not crowd the answer, and only then close names anywhere."""
    segments = [s for s in ref.replace(".", "::").split("::") if s] or [ref]
    leaf = segments[-1]
    scope = "::".join(segments[:-1]) + "::" if len(segments) > 1 else ""

    def close(pool: list[SemanticElement]) -> list[SemanticElement]:
        names = sorted({e.name for e in pool})
        found = difflib.get_close_matches(leaf, names, n=3, cutoff=0.6)
        return [e for name in found for e in pool if e.name == name]

    exact = [e for e in elements if e.name == leaf]
    local = close([e for e in elements if scope and e.id.startswith(scope)])
    ordered = exact + (local or close(elements))
    return tuple(dict.fromkeys(e.id for e in ordered))


def load_fmea(
    sources: FmeaSources, semantic: Mapping[str, SemanticElement], resolver: NameResolver
) -> FmeaModel:
    if SEVERITY_FILE not in sources.data:
        raise FmeaLoadError(SEVERITY_FILE, None, "file is missing; it holds requirement_groups and status_factor")
    severity = _validated(sources, SEVERITY_FILE, SeverityConfig.model_validate)
    model = FmeaModel([], severity, lines=sources.lines)
    order = {eid: i for i, eid in enumerate(semantic)}
    defs = [e for e in semantic.values() if _is_part_def(e)]
    usages = [e for e in semantic.values() if _is_part_usage(e, semantic)]

    # library: part def id -> (file, PartLibrary)
    libraries: dict[str, tuple[str, PartLibrary]] = {}
    for file in sorted(f for f in sources.data if f.startswith("library/")):
        lib = _validated(sources, file, PartLibrary.model_validate)
        loc = Loc(file, "part_def")
        res = resolver.resolve_name(lib.part_def, None, "")
        found = semantic.get(res.element_id) if res.element_id else None
        if found is None and not res.candidates:
            found = _resolve_short_def(lib.part_def, defs, loc, model)
            if found is False:
                continue
        if found is None and res.candidates:
            model.unresolved.append(
                Unresolved("ambiguous-part-def", loc, lib.part_def, tuple(sorted(c for c, _ in res.candidates)))
            )
        elif found is None:
            model.unresolved.append(Unresolved("unknown-part-def", loc, lib.part_def, _suggest(lib.part_def, defs)))
        elif not _is_part_def(found):
            model.unresolved.append(Unresolved("not-a-part-def", loc, lib.part_def))
        else:
            libraries[found.id] = (file, lib)

    entries: list[tuple[int, InstanceEntry, str]] = []  # (index, entry, resolved id)
    if INSTANCES_FILE in sources.data:
        parsed = _validated(sources, INSTANCES_FILE, instances_model().validate_python)
        for idx, entry in enumerate(parsed):
            loc = Loc(INSTANCES_FILE, f"[{idx}].part")
            resolved = _resolve_part(entry.part, loc, semantic, resolver, usages, model)
            if resolved:
                entries.append((idx, entry, resolved))

    by_part: dict[str, tuple[int, InstanceEntry]] = {}
    for idx, entry, pid in entries:
        if pid in by_part:
            first = by_part[pid][0]
            here, there = Loc(INSTANCES_FILE, f"[{idx}].part"), Loc(INSTANCES_FILE, f"[{first}].part")
            model.unresolved.append(Unresolved("duplicate-part", here, entry.part, other=there))
            model.unresolved.append(Unresolved("duplicate-part", there, entry.part, other=here))
            continue
        by_part[pid] = (idx, entry)

    items: dict[str, Item] = {}
    for usage in usages:
        lib_entry = libraries.get(usage.type_target_id or "")
        inst = by_part.get(usage.id)
        if lib_entry is None and inst is None:
            continue
        units: list[Unit] = []
        base_rate, base_rate_loc = None, Loc(INSTANCES_FILE, "")
        modes: dict[str, ModeSpec] = {}
        if lib_entry is not None:
            file, lib = lib_entry
            base_rate, base_rate_loc = lib.rate_fit, Loc(file, "part_def")
            for i, mode in enumerate(lib.failure_modes):
                modes[mode.id] = _spec(mode, Loc(file, f"failure_modes[{i}]"))
        if inst is not None:
            idx, entry = inst
            if entry.rate_fit is not None:
                base_rate, base_rate_loc = entry.rate_fit, Loc(INSTANCES_FILE, f"[{idx}].rate_fit")
            elif lib_entry is None:
                base_rate_loc = Loc(INSTANCES_FILE, f"[{idx}].part")
            for i, mode in enumerate(entry.failure_modes):
                modes[mode.id] = _spec(mode, Loc(INSTANCES_FILE, f"[{idx}].failure_modes[{i}]"))
            for i, ov in enumerate(entry.overrides):
                if ov.id in modes:
                    modes[ov.id] = _override(modes[ov.id], ov)
                else:
                    model.unresolved.append(
                        Unresolved("unknown-mode-id", Loc(INSTANCES_FILE, f"[{idx}].overrides[{i}].id"), ov.id,
                                   tuple(difflib.get_close_matches(ov.id, list(modes), n=3, cutoff=0.6)))
                    )
        if modes or base_rate is not None:
            units.append(Unit(None, base_rate, base_rate_loc, tuple(modes.values())))
        if inst is not None:
            idx, entry = inst
            for j, sru in enumerate(entry.srus):
                base = f"[{idx}].srus[{j}]"
                units.append(
                    Unit(
                        sru.id,
                        sru.rate_fit,
                        Loc(INSTANCES_FILE, f"{base}.rate_fit" if sru.rate_fit is not None else base),
                        tuple(_spec(m, Loc(INSTANCES_FILE, f"{base}.failure_modes[{k}]"))
                              for k, m in enumerate(sru.failure_modes)),
                    )
                )
        items[usage.id] = Item(usage.id, _qty(usage), tuple(units))
    model.items = sorted(items.values(), key=lambda i: order[i.part_id])
    typed = {u.type_target_id for u in usages}
    for def_id, (file, lib) in libraries.items():
        if def_id not in typed:
            model.unresolved.append(Unresolved("unused-library", Loc(file, "part_def"), lib.part_def))
    _check_ratio_sums(model)
    return model


def _check_ratio_sums(model: FmeaModel) -> None:
    """Sum of the mode ratios per merged item or SRU: over 1 is an error, under 1 a note."""
    seen: set[tuple[Loc, str]] = set()
    for item in model.items:
        for unit in item.units:
            ratios = [m.mode_ratio for m in unit.modes if m.mode_ratio is not None]
            if not ratios:
                continue
            total = sum(ratios)
            label = f"{item.part_id}/{unit.sru}" if unit.sru else item.part_id
            if total > 1 + RATIO_EPS:
                if (unit.rate_loc, f"{total:g}") not in seen:
                    seen.add((unit.rate_loc, f"{total:g}"))
                    model.unresolved.append(
                        Unresolved("mode-ratio-sum", unit.rate_loc, label, detail=f"{total:g}")
                    )
            elif total < 1 - RATIO_EPS and len(ratios) == len(unit.modes):
                model.notes.append(f"{label}: mode ratios sum to {total:g}")


def _resolve_short_def(ref: str, defs: list[SemanticElement], loc: Loc, model: FmeaModel):
    """A part definition named by a suffix of whole segments. False = reported, None = unknown."""
    segments = [s for s in ref.split("::") if s]
    hits = sorted(d.id for d in defs if segments and d.id.split("::")[-len(segments):] == segments)
    if len(hits) == 1:
        model.short_refs.append(ShortRef(loc, ref, hits[0]))
        return next(d for d in defs if d.id == hits[0])
    if hits:
        model.unresolved.append(Unresolved("ambiguous-part-def", loc, ref, tuple(hits)))
        return False
    return None


def _resolve_part(
    ref: str,
    loc: Loc,
    semantic: Mapping[str, SemanticElement],
    resolver: NameResolver,
    usages: list[SemanticElement],
    model: FmeaModel,
) -> str | None:
    direct = resolver.resolve_feature_ref(ref, None, "")
    found = semantic.get(direct.element_id) if direct.element_id else None
    if found is not None and not _is_part_usage(found, semantic):
        model.unresolved.append(Unresolved("not-a-part-usage", loc, ref))
        return None
    try:
        resolved = resolve_failure_target(ref, semantic, resolver)
    except AmbiguousName as exc:
        model.unresolved.append(Unresolved("ambiguous-part", loc, ref, tuple(exc.candidates)))
        return None
    except UnknownName as exc:
        names = set(exc.suggestions)
        suggestions = tuple(u.id for u in usages if u.name in names)
        model.unresolved.append(Unresolved("unknown-part", loc, ref, suggestions))
        return None
    if resolved != ref:
        model.short_refs.append(ShortRef(loc, ref, resolved))
    return resolved
