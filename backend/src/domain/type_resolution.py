"""Helpers for telling part definitions from part usages.

Types themselves are resolved by `NameResolver.resolve_type_def`.
"""

from __future__ import annotations

from collections.abc import Mapping

from domain.models import ArtifactKind, SemanticElement


def specialized_def_ids(elements: Mapping[str, SemanticElement]) -> set[str]:
    """Ids of parts that carry a type ref but are definitions (`part def X :> Base`)."""
    return {
        el.source_id
        for el in elements.values()
        if el.kind == ArtifactKind.SPECIALIZATION and el.source_id
    }


def is_part_def(el: SemanticElement, specialized_ids: set[str]) -> bool:
    """A part definition: a part without a type ref, or a specialized one."""
    return el.kind == ArtifactKind.PART and (
        el.type_ref is None or el.id in specialized_ids
    )
