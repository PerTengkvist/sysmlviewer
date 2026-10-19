"""SysML view filter (alpha subset): @metaclass and name.startsWith."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from domain.models import ArtifactKind, SemanticElement


@dataclass(frozen=True)
class MetaclassFilter:
    ref: str

    def to_stored(self) -> dict:
        return {"op": "metaclass", "ref": self.ref}


@dataclass(frozen=True)
class MetaclassAnyFilter:
    """Keep if element matches any listed metaclass (`filter @A or @B;`)."""

    refs: tuple[str, ...]

    def to_stored(self) -> dict:
        return {"op": "metaclassAny", "refs": list(self.refs)}


@dataclass(frozen=True)
class NameStartsWithFilter:
    prefix: str

    def to_stored(self) -> dict:
        return {"op": "nameStartsWith", "prefix": self.prefix}


ViewFilter = MetaclassFilter | MetaclassAnyFilter | NameStartsWithFilter

# Last-segment / short names → ArtifactKind
_METACLASS_SUFFIX: dict[str, ArtifactKind] = {
    "ConnectionUsage": ArtifactKind.CONNECTION,
    "ConnectionDefinition": ArtifactKind.CONNECTION,
    "Dependency": ArtifactKind.DEPENDENCY,
    "PartUsage": ArtifactKind.PART,
    "PartDefinition": ArtifactKind.PART,
    "PortUsage": ArtifactKind.PORT,
    "PortDefinition": ArtifactKind.PORT,
    "AllocationUsage": ArtifactKind.ALLOCATION,
    "BindingConnectorAsUsage": ArtifactKind.BINDING,
    "FlowConnectionUsage": ArtifactKind.FLOW,
    "AttributeUsage": ArtifactKind.ATTRIBUTE,
    "RequirementUsage": ArtifactKind.REQUIREMENT,
    "UseCaseUsage": ArtifactKind.USE_CASE,
    "SatisfyRequirementUsage": ArtifactKind.SATISFY,
    "InterfaceUsage": ArtifactKind.INTERFACE,
    "IncludeUseCaseUsage": ArtifactKind.INCLUDE,
}

_STRUCTURE_EDGE_KINDS = {
    ArtifactKind.CONNECTION,
    ArtifactKind.DEPENDENCY,
    ArtifactKind.ALLOCATION,
    ArtifactKind.BINDING,
    ArtifactKind.FLOW,
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
    ArtifactKind.SATISFY,
    ArtifactKind.INCLUDE,
}


def metaclass_to_kind(ref: str) -> ArtifactKind | None:
    """Map SysML/KerML metaclass ref to ArtifactKind; unknown → None."""
    text = (ref or "").strip()
    if not text:
        return None
    # Strip leading @ if present
    if text.startswith("@"):
        text = text[1:]
    suffix = text.split("::")[-1]
    return _METACLASS_SUFFIX.get(suffix)


def parse_stored_filters(raw: list[dict] | None) -> list[ViewFilter]:
    out: list[ViewFilter] = []
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        op = item.get("op")
        if op == "metaclass" and item.get("ref"):
            out.append(MetaclassFilter(str(item["ref"])))
        elif op == "metaclassAny" and item.get("refs"):
            refs = tuple(str(r) for r in item["refs"] if r)
            if refs:
                out.append(MetaclassAnyFilter(refs))
        elif op == "nameStartsWith" and "prefix" in item:
            out.append(NameStartsWithFilter(str(item["prefix"])))
    return out


def filters_to_stored(filters: Iterable[ViewFilter]) -> list[dict]:
    return [f.to_stored() for f in filters]


def _matches_metaclass(el: SemanticElement, ref: str) -> bool:
    kind = metaclass_to_kind(ref)
    return kind is not None and el.kind == kind


def element_matches_filters(
    el: SemanticElement,
    filters: list[ViewFilter],
) -> bool:
    """True = keep. Empty filter list matches everything. Multiple = AND."""
    if not filters:
        return True
    for f in filters:
        if isinstance(f, MetaclassFilter):
            if not _matches_metaclass(el, f.ref):
                return False
        elif isinstance(f, MetaclassAnyFilter):
            if not any(_matches_metaclass(el, ref) for ref in f.refs):
                return False
        elif isinstance(f, NameStartsWithFilter):
            if not el.name.startswith(f.prefix):
                return False
        else:
            return False
    return True


def apply_view_filters(
    semantic: dict[str, SemanticElement],
    artifact_ids: set[str],
    filters: list[ViewFilter],
    *,
    root_id: str | None = None,
    root_ids: set[str] | None = None,
) -> set[str]:
    """
    Keep elements that match all filters (AND). Always keep expose roots.
    Re-add endpoints of kept structure edges so connections remain visible.
    """
    if not filters:
        return set(artifact_ids)

    always = set(root_ids or ())
    if root_id:
        always.add(root_id)

    kept: set[str] = {rid for rid in always if rid in artifact_ids}

    for aid in artifact_ids:
        if aid in always:
            continue
        el = semantic.get(aid)
        if el is None:
            continue
        if element_matches_filters(el, filters):
            kept.add(aid)

    # Promote endpoints of kept relations so diagrams stay usable.
    for aid in list(kept):
        el = semantic.get(aid)
        if el is None or el.kind not in _STRUCTURE_EDGE_KINDS:
            continue
        if el.source_id and el.source_id in semantic:
            kept.add(el.source_id)
        if el.target_id and el.target_id in semantic:
            kept.add(el.target_id)

    return kept
