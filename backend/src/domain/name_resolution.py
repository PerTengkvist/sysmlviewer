"""Namespace-aware name resolution for references in SysML text.

Pure domain logic. A reference is looked up in the scope it is written in, then
outwards through the enclosing namespaces up to the root namespace (which holds
the top-level elements of every file). Own and inherited members shadow
imported ones on the same level; an inner level always wins over an outer one.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from domain.models import ArtifactKind, SemanticElement
from domain.type_resolution import part_def_resolver


@dataclass(frozen=True)
class ImportSpec:
    owner_id: str | None  # None = the file's root namespace
    file_id: str
    path: str  # "Lib::*", "Lib::Sub", "Lib::**", "Lib::*::**"
    visibility: str  # "public" | "private"
    line: int


@dataclass(frozen=True)
class Resolution:
    element_id: str | None  # None = unresolved or ambiguous
    candidates: tuple[tuple[str, int], ...] = ()  # (id, import line) when ambiguous
    pending_path: bool = False  # resolved id does not exist yet (inherited later)


_UNRESOLVED = Resolution(None, (), False)


class NameResolver:
    def __init__(
        self,
        elements: Mapping[str, SemanticElement],
        imports: Sequence[ImportSpec] = (),
    ) -> None:
        self._elements = elements
        self._imports = tuple(imports)
        self._members: dict[str | None, dict[str, str]] = {}
        for eid, el in elements.items():
            owner = el.parent_id
            if owner and eid.startswith(f"{owner}::"):
                name = eid[len(owner) + 2 :]
            else:
                name = el.name
            self._members.setdefault(owner, {})[name] = eid
        self._resolve_type_def = part_def_resolver(elements)
        self._inherited: dict[str, frozenset[str]] = {}
        self._inheriting: set[str] = set()

    # -- public API ---------------------------------------------------------

    def resolve_name(self, ref: str, scope_id: str | None, file_id: str) -> Resolution:
        """Resolve `A::B::c` (or a simple name) written in `scope_id`."""
        segments = [s for s in ref.split("::") if s]
        if not segments:
            return _UNRESOLVED
        result = self._resolve_segments(segments, scope_id, file_id)
        return self._finish(result)

    def resolve_feature_ref(
        self, ref: str, scope_id: str | None, file_id: str
    ) -> Resolution:
        """Resolve `A::b.c.d`: the head `A::b` by name, the tail by ownership."""
        head, *tail = ref.split(".")
        result = self.resolve_name(head, scope_id, file_id)
        if result.element_id is None or not tail:
            return result
        current = result.element_id
        for seg in (s for s in tail if s):
            nxt = self._own_or_inherited(current, seg)
            current = nxt if nxt else f"{current}::{seg}"
        return self._finish(Resolution(current))

    # -- internals ----------------------------------------------------------

    def _finish(self, res: Resolution) -> Resolution:
        if res.element_id is not None and res.element_id not in self._elements:
            return Resolution(res.element_id, res.candidates, True)
        return res

    def _resolve_segments(
        self, segments: list[str], scope_id: str | None, file_id: str
    ) -> Resolution:
        head = self._lookup_head(segments[0], scope_id, file_id)
        if head.element_id is None:
            return head
        current = head.element_id
        for seg in segments[1:]:
            nxt = self._own_or_inherited(current, seg)
            if nxt is None:
                return _UNRESOLVED
            current = nxt
        return Resolution(current)

    def _lookup_head(self, name: str, scope_id: str | None, file_id: str) -> Resolution:
        ns = scope_id
        seen: set[str | None] = set()
        while ns not in seen:
            seen.add(ns)
            hit = self._own_or_inherited(ns, name)
            if hit is not None:
                return Resolution(hit)
            if ns is None:
                break
            owner = self._elements.get(ns)
            ns = owner.parent_id if owner else None
        return _UNRESOLVED

    def _own_or_inherited(self, ns: str | None, name: str) -> str | None:
        own = self._members.get(ns, {}).get(name)
        if own is not None:
            return own
        if ns is not None and name in self._inherited_names(ns):
            return f"{ns}::{name}"
        return None

    def _inherited_names(self, ns: str) -> frozenset[str]:
        """Names of members a typed part gets from its definition (pre-inheritance)."""
        cached = self._inherited.get(ns)
        if cached is not None:
            return cached
        el = self._elements.get(ns)
        if el is None or el.kind != ArtifactKind.PART or not el.type_ref:
            return frozenset()
        if ns in self._inheriting:
            return frozenset()
        self._inheriting.add(ns)
        try:
            type_def = self._resolve_type_def(el.type_ref)
            names: frozenset[str] = frozenset()
            if type_def is not None and type_def.id != ns:
                names = frozenset(self._members.get(type_def.id, {})) | self._inherited_names(
                    type_def.id
                )
        finally:
            self._inheriting.discard(ns)
        self._inherited[ns] = names
        return names
