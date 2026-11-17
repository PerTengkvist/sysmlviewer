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
        self._by_owner: dict[str | None, list[ImportSpec]] = {}
        for spec in self._imports:
            self._by_owner.setdefault(spec.owner_id, []).append(spec)
        self._children: dict[str | None, list[str]] | None = None
        self._descendants: dict[str, dict[str, frozenset[str]]] = {}
        self._base_cache: dict[ImportSpec, str | None] = {}
        self._resolving: set[ImportSpec] = set()
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
        self,
        segments: list[str],
        scope_id: str | None,
        file_id: str,
        skip_imports_of: tuple[str | None] | None = None,
    ) -> Resolution:
        head = self._lookup_head(segments[0], scope_id, file_id, skip_imports_of)
        if head.element_id is None:
            return head
        current = head.element_id
        for seg in segments[1:]:
            found = self._exported(current, seg, frozenset())
            if len(found) != 1:
                return _UNRESOLVED
            (current,) = found
        return Resolution(current)

    def _lookup_head(
        self,
        name: str,
        scope_id: str | None,
        file_id: str,
        skip_imports_of: tuple[str | None] | None = None,
    ) -> Resolution:
        ns = scope_id
        seen: set[str | None] = set()
        while ns not in seen:
            seen.add(ns)
            hit = self._own_or_inherited(ns, name)
            if hit is not None:
                return Resolution(hit)
            if skip_imports_of is None or skip_imports_of[0] != ns:
                imported = self._imported_at(ns, name, file_id)
                if len(imported) == 1:
                    return Resolution(next(iter(imported)))
                if len(imported) > 1:
                    return Resolution(None, tuple(sorted(imported.items())))
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

    # -- imports ------------------------------------------------------------

    def _imported_at(self, ns: str | None, name: str, file_id: str) -> dict[str, int]:
        """Elements called `name` that the imports of `ns` make visible: id -> import line."""
        found: dict[str, int] = {}
        for spec in self._by_owner.get(ns, ()):
            if ns is None and spec.file_id != file_id:
                continue
            for eid in self._spec_targets(spec, name, frozenset()):
                found[eid] = min(found.get(eid, spec.line), spec.line)
        return found

    def _exported(self, ns: str, name: str, visited: frozenset[str]) -> set[str]:
        """Members called `name` that others see in `ns`: own, inherited, re-exported."""
        own = self._own_or_inherited(ns, name)
        if own is not None:
            return {own}
        if ns in visited:
            return set()
        visited = visited | {ns}
        out: set[str] = set()
        for spec in self._by_owner.get(ns, ()):
            if spec.visibility == "public":
                out |= self._spec_targets(spec, name, visited)
        return out

    @staticmethod
    def _split_path(path: str) -> tuple[list[str], bool, bool]:
        """Return (base segments, star, recursive) for an import path."""
        segs = [s for s in path.replace(".", "::").split("::") if s]
        recursive = bool(segs) and segs[-1] == "**"
        if recursive:
            segs.pop()
        star = bool(segs) and segs[-1] == "*"
        if star:
            segs.pop()
        return segs, star, recursive

    def _spec_base(self, spec: ImportSpec) -> str | None:
        if spec in self._base_cache:
            return self._base_cache[spec]
        if spec in self._resolving:
            return None
        segs, _, _ = self._split_path(spec.path)
        self._resolving.add(spec)
        try:
            base = None
            if segs:
                res = self._resolve_segments(
                    segs, spec.owner_id, spec.file_id, skip_imports_of=(spec.owner_id,)
                )
                base = res.element_id
        finally:
            self._resolving.discard(spec)
        self._base_cache[spec] = base
        return base

    def _spec_targets(
        self, spec: ImportSpec, name: str, visited: frozenset[str]
    ) -> set[str]:
        """Ids named `name` that this one import makes visible."""
        segs, star, recursive = self._split_path(spec.path)
        if not segs:
            return set()
        if not star and not recursive:
            # Member import `X::Name`: only the last segment is visible.
            if segs[-1] != name:
                return set()
            base = self._spec_base(spec)
            return {base} if base is not None else set()
        base = self._spec_base(spec)
        if base is None:
            return set()
        if recursive:
            out = set(self._descendants_of(base).get(name, ()))
            if not star and base.rsplit("::", 1)[-1] == name:
                out.add(base)
            return out
        return self._exported(base, name, visited)

    def _descendants_of(self, ns: str) -> dict[str, frozenset[str]]:
        """Every element below `ns` at any depth, by name."""
        cached = self._descendants.get(ns)
        if cached is not None:
            return cached
        if self._children is None:
            self._children = {}
            for eid, el in self._elements.items():
                self._children.setdefault(el.parent_id, []).append(eid)
        names: dict[str, set[str]] = {}
        stack = list(self._children.get(ns, ()))
        seen = {ns}
        while stack:
            eid = stack.pop()
            if eid in seen:
                continue
            seen.add(eid)
            names.setdefault(eid.rsplit("::", 1)[-1], set()).add(eid)
            stack.extend(self._children.get(eid, ()))
        result = {k: frozenset(v) for k, v in names.items()}
        self._descendants[ns] = result
        return result
