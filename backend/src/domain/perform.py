"""Resolve `perform <ref>;` to the action it names, and who performs it.

`perform securityFlow.checkCredential;` inside part `Security::authenticate`
says that the part performs step `checkCredential` of flow `securityFlow`.
The parser stores it as an ACTION child of the part with
``metadata_keywords == ["perform"]`` and ``type_ref`` the reference as written.
"""

from __future__ import annotations

from domain.models import ArtifactKind, SemanticElement


def is_perform(el: SemanticElement) -> bool:
    return (
        el.kind == ArtifactKind.ACTION
        and "perform" in el.metadata_keywords
        and bool(el.type_ref)
    )


def _segments(ref: str) -> list[str]:
    return [s for s in ref.replace("::", ".").split(".") if s]


def _child_named(
    semantic: dict[str, SemanticElement],
    owner_id: str | None,
    name: str,
    skip: str,
) -> SemanticElement | None:
    if owner_id is None:
        # Top level: a root element (no owner) with that name.
        el = semantic.get(name)
        return el if el is not None and el.parent_id is None else None
    owner = semantic.get(owner_id)
    if owner is None:
        return None
    for cid in owner.children:
        if cid == skip:
            continue
        child = semantic.get(cid)
        if child is not None and child.name == name:
            return child
    return None


def resolve_perform_target(
    semantic: dict[str, SemanticElement], perform: SemanticElement
) -> str | None:
    """Id of the element a perform names, or None when it does not resolve.

    The first segment is looked up in the perform's owner and then in each
    owner above it, up to the top level; the remaining segments follow
    children with the same name.
    """
    segments = _segments(perform.type_ref or "")
    if not segments:
        return None
    first, rest = segments[0], segments[1:]
    owner_id = perform.parent_id
    seen: set[str] = set()
    while True:
        found = _child_named(semantic, owner_id, first, skip=perform.id)
        if found is not None:
            cur: SemanticElement | None = found
            for seg in rest:
                cur = _child_named(semantic, cur.id, seg, skip=perform.id)
                if cur is None:
                    break
            if cur is not None and cur.id != perform.id:
                return cur.id
        if owner_id is None or owner_id in seen:
            return None
        seen.add(owner_id)
        owner = semantic.get(owner_id)
        owner_id = owner.parent_id if owner else None


def resolve_performers(semantic: dict[str, SemanticElement]) -> dict[str, list[str]]:
    """Map each performed action id to the ids of the parts that perform it."""
    out: dict[str, list[str]] = {}
    for el in sorted(semantic.values(), key=lambda e: e.id):
        if not is_perform(el) or not el.parent_id:
            continue
        owner = semantic.get(el.parent_id)
        if owner is None or owner.kind != ArtifactKind.PART:
            continue
        target = resolve_perform_target(semantic, el)
        if target is None:
            continue
        parts = out.setdefault(target, [])
        if owner.id not in parts:
            parts.append(owner.id)
    return out


def unresolved_performs(semantic: dict[str, SemanticElement]) -> list[SemanticElement]:
    """Perform elements whose reference names nothing in the model."""
    return [
        el
        for el in sorted(semantic.values(), key=lambda e: e.id)
        if is_perform(el) and resolve_perform_target(semantic, el) is None
    ]
