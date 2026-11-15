"""Resolve a usage's `: T` type reference to its definition by name."""

from __future__ import annotations

from collections.abc import Callable, Mapping

from domain.models import ArtifactKind, SemanticElement

TypeDefResolver = Callable[[str | None], SemanticElement | None]


def part_def_resolver(elements: Mapping[str, SemanticElement]) -> TypeDefResolver:
    """Return a resolver from a part `typeRef` name to its part definition.

    A definition is a part without a type ref, or a `part def X :> Base`
    (which keeps a type ref but is still a definition). The resolver reads
    `elements` live, so parts added later are found too.
    """
    defs_by_name: dict[str, SemanticElement] = {}
    for el in elements.values():
        if el.kind == ArtifactKind.PART and el.type_ref is None:
            defs_by_name[el.name] = el
    # `part def X :> Base` keeps type_ref but remains a type definition.
    specialized_def_ids = {
        el.source_id
        for el in elements.values()
        if el.kind == ArtifactKind.SPECIALIZATION and el.source_id
    }

    def resolve_type_def(type_ref: str | None) -> SemanticElement | None:
        if not type_ref:
            return None
        for el in elements.values():
            if el.kind == ArtifactKind.PART and el.name == type_ref and el.type_ref is None:
                return el
        for el in elements.values():
            if (
                el.kind == ArtifactKind.PART
                and el.name == type_ref
                and el.id in specialized_def_ids
            ):
                return el
        return defs_by_name.get(type_ref)

    return resolve_type_def
