"""Namespace-aware name resolution for references in SysML text.

Pure domain logic. A reference is looked up in the scope it is written in, then
outwards through the enclosing namespaces up to the root namespace (which holds
the top-level elements of every file). Own and inherited members shadow
imported ones on the same level; an inner level always wins over an outer one.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

from domain.models import ArtifactKind, SemanticElement
from domain.type_resolution import specialized_def_ids


@dataclass(frozen=True)
class ImportSpec:
    owner_id: str | None  # None = the file's root namespace
    file_id: str
    path: str  # "Lib::*", "Lib::Sub", "Lib::**", "Lib::*::**"
    visibility: str  # "public" | "private"
    line: int

    @classmethod
    def from_dict(cls, d: Mapping[str, object]) -> ImportSpec:
        """Build from a `ParseResult.imports` entry."""
        return cls(
            owner_id=d.get("ownerId"),  # type: ignore[arg-type]
            file_id=str(d["fileId"]),
            path=str(d["path"]),
            visibility=str(d["visibility"]),
            line=int(d["line"]),  # type: ignore[call-overload]
        )


@dataclass(frozen=True)
class Resolution:
    element_id: str | None  # None = unresolved or ambiguous
    candidates: tuple[tuple[str, int], ...] = ()  # (id, import line) when ambiguous
    pending_path: bool = False  # resolved id does not exist yet (inherited later)


_UNRESOLVED = Resolution(None, (), False)


def is_perform_stub(el: SemanticElement) -> bool:
    """A `perform X;` step only references X; it declares no name.

    The parser gives such a stub the reference as written (`type_ref`) and its
    last segment as the name. A declared action that merely got the `perform`
    keyword added (`then perform pay;` naming an existing `pay`) has no such
    reference and stays a real member.
    """
    if el.kind != ArtifactKind.ACTION or "perform" not in el.metadata_keywords:
        return False
    if not el.type_ref:
        return False
    segments = [x for x in el.type_ref.replace("::", ".").split(".") if x]
    return bool(segments) and segments[-1] == el.name


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
            if is_perform_stub(el):
                continue
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
        self._descending: set[str] = set()
        self._base_cache: dict[ImportSpec, str | None] = {}
        self._resolving: set[ImportSpec] = set()
        self._specialized_defs = specialized_def_ids(elements)
        self._type_defs: dict[str, tuple[SemanticElement | None, Resolution]] = {}
        self._inherited: dict[str, frozenset[str]] = {}
        self._inheriting: set[str] = set()

    # -- public API ---------------------------------------------------------

    def resolve_name(
        self, ref: str, scope_id: str | None, file_id: str, exclude: str | None = None
    ) -> Resolution:
        """Resolve `A::B::c` (or a simple name) written in `scope_id`.

        `exclude` is an element the first segment must not resolve to (the
        declaration that writes the reference, for `part def E :> E`)."""
        segments = [s for s in ref.split("::") if s]
        if not segments:
            return _UNRESOLVED
        result = self._resolve_segments(segments, scope_id, file_id, exclude=exclude)
        return self._finish(result)

    def resolve_feature_ref(
        self,
        ref: str,
        scope_id: str | None,
        file_id: str,
        exclude: str | None = None,
    ) -> Resolution:
        """Resolve `A::b.c.d`: the head `A::b` by name, the tail by ownership."""
        head, *tail = ref.split(".")
        result = self.resolve_name(head, scope_id, file_id, exclude)
        if result.element_id is None or not tail:
            return result
        current = result.element_id
        for seg in (s for s in tail if s):
            nxt = self._own_or_inherited(current, seg)
            current = nxt if nxt else f"{current}::{seg}"
        return self._finish(Resolution(current))

    def resolve_type_def(
        self, usage: SemanticElement
    ) -> tuple[SemanticElement | None, Resolution]:
        """Resolve a usage's `: T` to its definition (same kind as the usage).

        The reference is looked up from the namespace it is written in (the
        parent of `usage`). Only a definition of the same kind counts (declared
        with `def`, or specialized); a candidate that is not one, including the
        usage itself, does not stop a simple name's lookup, which goes on
        outwards. An ambiguous or missing type gives `None`; the Resolution
        carries the ambiguity candidates.
        """
        cached = self._type_defs.get(usage.id)
        if cached is not None:
            return cached
        if not usage.type_ref or is_perform_stub(usage):
            return (None, _UNRESOLVED)

        def accept(eid: str) -> bool:
            el = self._elements.get(eid)
            return (
                el is not None
                and el.id != usage.id
                and el.kind == usage.kind
                and (el.is_definition or el.id in self._specialized_defs)
            )

        segments = [x for x in usage.type_ref.split("::") if x]
        if len(segments) == 1:
            res = self._finish(
                self._lookup_head(
                    segments[0], usage.parent_id, usage.file_id or "", accept=accept
                )
            )
        else:
            res = self.resolve_name(
                usage.type_ref, usage.parent_id, usage.file_id or ""
            )
        hit = self._elements.get(res.element_id) if res.element_id else None
        if hit is not None and not accept(hit.id):
            hit = None
        result = (hit, res)
        self._type_defs[usage.id] = result
        return result

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
        exclude: str | None = None,
    ) -> Resolution:
        accept = (lambda eid: eid != exclude) if exclude is not None else None
        head = self._lookup_head(
            segments[0], scope_id, file_id, skip_imports_of, accept=accept
        )
        if head.element_id is None:
            return head
        current = head.element_id
        for seg in segments[1:]:
            found = self._exported(current, seg, frozenset())
            if len(found) > 1:
                return Resolution(None, self._reexport_candidates(current, seg, found))
            if len(found) != 1:
                return _UNRESOLVED
            (current,) = found
        return Resolution(current)

    def _reexport_candidates(
        self, ns: str, name: str, found: set[str]
    ) -> tuple[tuple[str, int], ...]:
        """Ambiguous tail segment: each candidate with the line of the import that gives it."""
        lines: dict[str, int] = {}
        for spec in self._by_owner.get(ns, ()):
            if spec.visibility != "public":
                continue
            for eid in self._spec_targets(spec, name, frozenset()):
                lines[eid] = min(lines.get(eid, spec.line), spec.line)
        return tuple(sorted((eid, lines.get(eid, 0)) for eid in found))

    def _lookup_head(
        self,
        name: str,
        scope_id: str | None,
        file_id: str,
        skip_imports_of: tuple[str | None] | None = None,
        accept: Callable[[str], bool] | None = None,
    ) -> Resolution:
        """Look `name` up outwards. With `accept`, a candidate it rejects does not
        stop the search: the lookup goes on in the next namespace (KerML: a name
        that cannot be used as the wanted kind is not a hit)."""
        ns = scope_id
        seen: set[str | None] = set()
        while ns not in seen:
            seen.add(ns)
            hit = self._own_or_inherited(ns, name)
            if hit is not None and (accept is None or accept(hit)):
                return Resolution(hit)
            if skip_imports_of is None or skip_imports_of[0] != ns:
                imported = self._imported_at(ns, name, file_id)
                if accept is not None:
                    imported = {k: v for k, v in imported.items() if accept(k)}
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
            type_def, _ = self.resolve_type_def(el)
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
        """Every element below `ns` at any depth, by name, plus what they re-export."""
        cached = self._descendants.get(ns)
        if cached is not None:
            return cached
        if ns in self._descending:
            return {}
        self._descending.add(ns)
        try:
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
                if not is_perform_stub(self._elements[eid]):
                    names.setdefault(eid.rsplit("::", 1)[-1], set()).add(eid)
                stack.extend(self._children.get(eid, ()))
            for namespace in seen:
                for spec in self._by_owner.get(namespace, ()):
                    if spec.visibility == "public":
                        for name, ids in self._spec_names(spec).items():
                            names.setdefault(name, set()).update(ids)
            result = {k: frozenset(v) for k, v in names.items()}
        finally:
            self._descending.discard(ns)
        self._descendants[ns] = result
        return result

    def _spec_names(self, spec: ImportSpec) -> dict[str, set[str]]:
        """Every name (and its ids) this one import makes visible."""
        segs, star, recursive = self._split_path(spec.path)
        base = self._spec_base(spec) if segs else None
        if base is None:
            return {}
        if not star and not recursive:
            return {segs[-1]: {base}}
        if recursive:
            out = {k: set(v) for k, v in self._descendants_of(base).items()}
            if not star:
                out.setdefault(base.rsplit("::", 1)[-1], set()).add(base)
            return out
        return self._exported_names(base, frozenset())

    def _exported_names(self, ns: str, visited: frozenset[str]) -> dict[str, set[str]]:
        """All members others see in `ns`: own, inherited, re-exported."""
        out: dict[str, set[str]] = {
            name: {eid} for name, eid in self._members.get(ns, {}).items()
        }
        for name in self._inherited_names(ns):
            out.setdefault(name, {f"{ns}::{name}"})
        if ns in visited:
            return out
        visited = visited | {ns}
        for spec in self._by_owner.get(ns, ()):
            if spec.visibility != "public":
                continue
            segs, star, recursive = self._split_path(spec.path)
            if not star and not recursive:
                base = self._spec_base(spec)
                if base is not None:
                    out.setdefault(segs[-1], set()).add(base)
                continue
            base = self._spec_base(spec)
            if base is None:
                continue
            if recursive:
                for name, ids in self._descendants_of(base).items():
                    out.setdefault(name, set()).update(ids)
            else:
                for name, ids in self._exported_names(base, visited).items():
                    out.setdefault(name, set()).update(ids)
        return out
