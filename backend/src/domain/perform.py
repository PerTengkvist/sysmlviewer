"""Resolve `perform <ref>;` to the action it names, and who performs it.

`perform securityFlow.checkCredential;` inside part `Security::authenticate`
says that the part performs step `checkCredential` of flow `securityFlow`.
The parser stores it as an ACTION child of the part with
``metadata_keywords == ["perform"]``, ``type_ref`` the reference as written,
and ``perform_target_id`` the element it resolves to.
"""

from __future__ import annotations

from collections.abc import Sequence

from domain.models import ArtifactKind, SemanticElement


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


def _follow(
    semantic: dict[str, SemanticElement],
    start: SemanticElement,
    rest: list[str],
    skip: str,
) -> str | None:
    cur: SemanticElement | None = start
    for seg in rest:
        cur = _child_named(semantic, cur.id, seg, skip=skip)
        if cur is None:
            return None
    return cur.id if cur.id != skip else None


def _find_namespace(semantic: dict[str, SemanticElement], path: str) -> SemanticElement | None:
    """Element for an import path: exact id, else a unique id ending in it."""
    if path in semantic:
        return semantic[path]
    matches = [e for e in semantic.values() if e.id.endswith(f"::{path}")]
    return matches[0] if len(matches) == 1 else None


def resolve_perform_target(
    semantic: dict[str, SemanticElement],
    perform: SemanticElement,
    imports: Sequence[str] = (),
) -> str | None:
    """Id of the element a perform names, or None when it does not resolve.

    The first segment is looked up in the perform's owner and then in each
    owner above it, up to the top level, and then in the imported
    namespaces (`Lib::*`, `Lib::**`) and members (`Lib::name`); the
    remaining segments follow children with the same name.
    """
    segments = ref_segments(perform.type_ref or "")
    if not segments:
        return None
    first, rest = segments[0], segments[1:]
    skip = perform.id
    owner_id = perform.parent_id
    seen: set[str] = set()
    while True:
        found = _child_named(semantic, owner_id, first, skip=skip)
        if found is not None:
            target = _follow(semantic, found, rest, skip)
            if target is not None:
                return target
        if owner_id is None or owner_id in seen:
            break
        seen.add(owner_id)
        owner = semantic.get(owner_id)
        owner_id = owner.parent_id if owner else None

    for path in imports:
        path = path.replace(".", "::")
        if path.endswith("::**") or path.endswith("::*"):
            ns = _find_namespace(semantic, path.rsplit("::", 1)[0])
            found = _child_named(semantic, ns.id, first, skip=skip) if ns else None
        elif path.split("::")[-1] == first:
            found = _find_namespace(semantic, path)
        else:
            found = None
        if found is not None:
            target = _follow(semantic, found, rest, skip)
            if target is not None:
                return target
    return None


def resolve_performers(semantic: dict[str, SemanticElement]) -> dict[str, list[str]]:
    """Map each performed action id to the ids of the parts that perform it."""
    out: dict[str, list[str]] = {}
    for el in sorted(semantic.values(), key=lambda e: e.id):
        if not is_perform(el) or not el.parent_id:
            continue
        owner = semantic.get(el.parent_id)
        if owner is None or owner.kind != ArtifactKind.PART:
            continue
        target = el.perform_target_id
        if target not in semantic:
            target = resolve_perform_target(semantic, el)
        if target is None:
            continue
        parts = out.setdefault(target, [])
        if owner.id not in parts:
            parts.append(owner.id)
    return out
