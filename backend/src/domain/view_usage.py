"""SysML v2 views: a `view def` defines a kind of view, a `view` usage is a diagram.

Models written for earlier versions of sysmlviewer declare diagrams as
`view def X : GeneralView { expose … }`. A definition that no usage refers to
is therefore still shown as a diagram, with a warning.
"""

from __future__ import annotations

from typing import Any

from domain.diagram_mode import TYPE_REF_TO_MODE
from domain.models import ArtifactKind, SemanticElement


def _find_definition(
    name: str, scope: str | None, semantic: dict[str, SemanticElement]
) -> SemanticElement | None:
    """The `view def` called ``name``, nearest the given scope first."""
    walk = scope
    while walk:
        candidate = semantic.get(f"{walk}::{name}")
        if candidate is not None and _is_view_definition(candidate):
            return candidate
        parent = semantic.get(walk)
        walk = parent.parent_id if parent else None
    matches = sorted(
        (e for e in semantic.values() if _is_view_definition(e) and e.name == name),
        key=lambda e: e.id,
    )
    return matches[0] if matches else None


def _is_view_definition(element: SemanticElement) -> bool:
    return element.kind == ArtifactKind.VIEW and element.is_definition


def view_definition_chain(
    element: SemanticElement, semantic: dict[str, SemanticElement]
) -> tuple[list[SemanticElement], str | None]:
    """The view and the definitions it is typed by, nearest first, and its view type.

    The type is a standard view name such as GeneralView, the last name the
    chain reached when it is not a known view, or None for a cycle.
    """
    chain = [element]
    seen = {element.id}
    current = element
    while True:
        type_ref = current.type_ref
        if not type_ref or type_ref in TYPE_REF_TO_MODE:
            return chain, type_ref
        definition = _find_definition(type_ref, current.parent_id, semantic)
        if definition is None:
            return chain, type_ref
        if definition.id in seen:
            return chain, None
        seen.add(definition.id)
        chain.append(definition)
        current = definition


def effective_view(
    element: SemanticElement, semantic: dict[str, SemanticElement]
) -> tuple[str | None, list[str], list[dict[str, Any]]]:
    """View type, exposed roots and filters, taking what the view lacks from its definitions."""
    chain, view_type = view_definition_chain(element, semantic)
    exposed: list[str] = []
    filters: list[dict[str, Any]] = []
    for link in chain:
        if not exposed:
            exposed = list(link.expose_refs) or (
                [link.expose_ref] if link.expose_ref else []
            )
        if not filters:
            filters = list(link.view_filters)
    return view_type, exposed, filters


def used_definition_ids(semantic: dict[str, SemanticElement]) -> set[str]:
    """Definitions that some view usage is typed by, directly or through another definition."""
    used: set[str] = set()
    for element in semantic.values():
        if element.kind != ArtifactKind.VIEW or element.is_definition:
            continue
        chain, _ = view_definition_chain(element, semantic)
        used.update(link.id for link in chain[1:])
    return used


def is_diagram_view(
    element: SemanticElement,
    semantic: dict[str, SemanticElement],
    used: set[str] | None = None,
) -> bool:
    if element.kind != ArtifactKind.VIEW:
        return False
    if not element.is_definition:
        return True
    return element.id not in (used if used is not None else used_definition_ids(semantic))


def legacy_definition_warnings(
    semantic: dict[str, SemanticElement],
) -> list[tuple[str | None, str]]:
    """One warning per `view def` that is shown as a diagram because no usage refers to it."""
    used = used_definition_ids(semantic)
    out: list[tuple[str | None, str]] = []
    for element in sorted(semantic.values(), key=lambda e: e.id):
        if not _is_view_definition(element) or element.id in used:
            continue
        view_type = element.type_ref or "GeneralView"
        out.append(
            (
                element.file_id,
                f"view def '{element.name}' is shown as a diagram; in SysML v2 a "
                f"diagram is a view usage: view {element.name} : {view_type} {{ … }}",
            )
        )
    return out
