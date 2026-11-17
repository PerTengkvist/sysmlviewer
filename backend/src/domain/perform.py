"""Resolve `perform <ref>;` to the action it names, and who performs it.

`perform securityFlow.checkCredential;` inside part `Security::authenticate`
says that the part performs step `checkCredential` of flow `securityFlow`.
The parser stores it as an ACTION child of the part with
``metadata_keywords == ["perform"]``, ``type_ref`` the reference as written,
and ``perform_target_id`` the element it resolves to.
"""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement
from domain.name_resolution import NameResolver


def is_perform(el: SemanticElement) -> bool:
    return (
        el.kind == ArtifactKind.ACTION
        and "perform" in el.metadata_keywords
        and bool(el.type_ref)
    )


def ref_segments(ref: str) -> list[str]:
    """``Pkg::Fn::flow.step`` → ``["Pkg", "Fn", "flow", "step"]``."""
    return [s for s in ref.replace("::", ".").split(".") if s]


def ref_leaf(ref: str) -> str:
    """Last segment of ``flow.step`` / ``Pkg::flow.step``."""
    segments = ref_segments(ref)
    return segments[-1] if segments else ref


def resolve_perform_target(
    semantic: dict[str, SemanticElement],
    perform: SemanticElement,
    resolver: NameResolver | None = None,
) -> str | None:
    """Id of the element a perform names, or None when it does not resolve.

    The reference is resolved from the perform's owner with the namespace and
    import rules of `NameResolver`; the result must be an existing element
    other than the perform itself.
    """
    ref = perform.type_ref or ""
    if not ref_segments(ref):
        return None
    if resolver is None:
        resolver = NameResolver(semantic, ())
    res = resolver.resolve_feature_ref(ref, perform.parent_id, perform.file_id or "")
    target = res.element_id
    if target is None or target == perform.id or target not in semantic:
        return None
    return target


def resolve_performers(semantic: dict[str, SemanticElement]) -> dict[str, list[str]]:
    """Map each performed action id to the ids of the parts that perform it."""
    out: dict[str, list[str]] = {}
    resolver: NameResolver | None = None
    for el in sorted(semantic.values(), key=lambda e: e.id):
        if not is_perform(el) or not el.parent_id:
            continue
        owner = semantic.get(el.parent_id)
        if owner is None or owner.kind != ArtifactKind.PART:
            continue
        target = el.perform_target_id
        if target not in semantic:
            if resolver is None:
                resolver = NameResolver(semantic, ())
            target = resolve_perform_target(semantic, el, resolver)
        if target is None:
            continue
        parts = out.setdefault(target, [])
        if owner.id not in parts:
            parts.append(owner.id)
    return out
