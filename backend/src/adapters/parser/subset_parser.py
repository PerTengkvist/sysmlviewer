"""Tolerant SysML v2 textual subset parser for package/part/port/connection/requirement."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from domain.models import ArtifactKind, SemanticElement
from domain.name_resolution import ImportSpec, NameResolver, is_perform_stub
from domain.occurrence import MATERIALIZED, FeatureIndex, in_occurrence, resolve_message_end
from domain.perform import ref_leaf, resolve_perform_target
from domain.type_resolution import specialized_def_ids
from domain.expose import MEMBER as EXPOSE_MEMBER
from domain.expose import MEMBERS as EXPOSE_MEMBERS
from domain.expose import MEMBERS_RECURSIVE as EXPOSE_MEMBERS_RECURSIVE
from domain.expose import RECURSIVE as EXPOSE_RECURSIVE
from domain.expose import kind_of as kind_of_expose
from domain.expose import set_kind as set_expose_kind
from domain.view_filter import (
    MetaclassAnyFilter,
    MetaclassFilter,
    NameStartsWithFilter,
    metaclass_to_kind,
)
from ports import ParseResult


_TOKEN_RE = re.compile(
    r"""
    (?P<comment>//[^\n]*)|
    (?P<block_comment>/\*[\s\S]*?\*/)|
    (?P<string>'[^']*'|"[^"]*")|
    (?P<number>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|
    (?P<ident>[A-Za-z_][\w]*)|
    (?P<punct>:>>|:>|::|[{}:;=,<\>]|\.|~|@)|
    (?P<ws>\s+)|
    (?P<other>.)
    """,
    re.VERBOSE,
)


@dataclass
class _Token:
    kind: str
    value: str
    line: int


@dataclass
class _Scope:
    element_id: str | None
    kind: ArtifactKind | None = None
    brace_depth: int = 0
    last_flow_step: str | None = None  # unqualified name of last flow occurrence
    branch_ends: list[str] | None = None  # open if/else branch tips awaiting merge


@dataclass
class _ImportDecl:
    file_id: str
    visibility: str  # private | public
    path: str  # e.g. Types::* or Types::Box
    line: int
    owner_id: str | None = None  # namespace the import stands in (None = file root)


class _TrackedElements(dict):
    """Element map that remembers the source line each id was first added on."""

    def __init__(self) -> None:
        super().__init__()
        self.lines: dict[str, int] = {}
        self.line = 0
        # Called with a message of an occurrence that another kind of member is
        # about to replace; it must move the message to another id.
        self.on_message_clash = None

    def __setitem__(self, key: str, value: SemanticElement) -> None:
        old = dict.get(self, key)
        if (
            old is not None
            and self.on_message_clash is not None
            and old is not value
            and old.kind == ArtifactKind.MESSAGE
            and value.kind != ArtifactKind.MESSAGE
        ):
            owner = dict.get(self, old.parent_id) if old.parent_id else None
            if owner is not None and owner.kind == ArtifactKind.OCCURRENCE:
                self.on_message_clash(old)
        if key not in self:
            self.lines[key] = self.line
        super().__setitem__(key, value)


def _free_id(candidates: list[str], taken) -> str:
    """First candidate that names no element; else the last with a numeric suffix."""
    for cand in candidates:
        if cand not in taken:
            return cand
    base, n = candidates[-1], 2
    while f"{base}#{n}" in taken:
        n += 1
    return f"{base}#{n}"


@dataclass
class _PendingRef:
    """A relationship end whose reference is resolved after all files are parsed."""

    element_id: str
    role: str  # "source" | "target"
    ref: str  # as written, e.g. "engine.powerIn" or "Lib::Sub::p"
    scope_id: str | None  # namespace the reference is written in
    file_id: str
    line: int
    label: str  # "dependency", "satisfy", ...
    resolved_id: str | None = None  # set by _link_references (None = unresolved)
    ambiguous: bool = False
    skipped: bool = False  # the element belongs to another file: not ours to write


@dataclass
class _PendingMessageEnd:
    """An end of an occurrence-form message, resolved once every file is parsed."""

    message_id: str
    role: str  # "source" | "target"
    path: str  # as written: `a`, `a.sent`, `car.keyFob.pressed`
    occurrence_id: str
    file_id: str
    line: int


def _ref_name(ref: str) -> str:
    """A reference as part of a relationship's name: no `::` or `.`."""
    return ref.replace("::", "_").replace(".", "_")


def _legacy_ref(ref: str, scope: str | None) -> str:
    """Provisional/unresolved value of an end: the reference as the parser always stored it."""
    if "::" in ref or not scope:
        return ref
    return f"{scope}::{ref.replace('.', '::')}"


_LOCAL_RELATION_KINDS = {
    ArtifactKind.SPECIALIZATION,
    ArtifactKind.SUBSETTING,
    ArtifactKind.REDEFINITION,
}

_RELATION_LABELS = {
    ArtifactKind.SPECIALIZATION: "specialization",
    ArtifactKind.SUBSETTING: "subsetting",
    ArtifactKind.REDEFINITION: "redefinition",
    ArtifactKind.DEPENDENCY: "dependency",
    ArtifactKind.ALLOCATION: "allocation",
    ArtifactKind.BINDING: "binding",
    ArtifactKind.FLOW: "flow",
}

# Unresolved targets of these stay silent (library types are not modelled), as before.
_SILENT_WHEN_UNRESOLVED = {"specialization", "subsetting", "redefinition"}

_EXPOSE_SUFFIX_KINDS = {
    "": EXPOSE_MEMBER,
    "::*": EXPOSE_MEMBERS,
    ".*": EXPOSE_MEMBERS,
    "::**": EXPOSE_RECURSIVE,
    ".**": EXPOSE_RECURSIVE,
    "::*::**": EXPOSE_MEMBERS_RECURSIVE,
}


def _resolve_expose_ref(
    ref: str,
    scope: str | None,
    elements: dict[str, SemanticElement],
    *,
    allow_leaf: bool = True,
    prefer_file: str | None = None,
) -> str | None:
    """Find the element an `expose ref;` names, seen from the view's package.

    Tries the ref as written, then relative to each enclosing package, then
    (if allowed) any non-view element with the same last name segment.
    """
    if ref in elements:
        return ref
    walk = scope
    while walk:
        candidate = f"{walk}::{ref}"
        if candidate in elements:
            return candidate
        el = elements.get(walk)
        walk = el.parent_id if el else None
    if not allow_leaf:
        return None
    leaf = ref.split("::")[-1]
    matches = [
        e
        for e in elements.values()
        if e.name == leaf and e.kind != ArtifactKind.VIEW
    ]
    # A same-name element in the view's own file wins, as in a one-file parse.
    same_file = [e for e in matches if prefer_file and e.file_id == prefer_file]
    best = same_file or matches
    return best[0].id if best else None


@dataclass
class _ParserState:
    elements: dict[str, SemanticElement] = field(default_factory=_TrackedElements)
    warnings: list[str] = field(default_factory=list)
    scopes: list[_Scope] = field(default_factory=list)
    file_id: str = ""
    anon_conn: int = 0
    # Anonymous successions, messages and transitions are numbered per owner and
    # prefix (`<owner>::succN`), so a flow's ids do not shift when another flow in
    # the same file changes. The ids are artifact ids that view layouts key on.
    anon_per_owner: dict[tuple[str | None, str], int] = field(default_factory=dict)
    anon_dependency: int = 0
    anon_allocation: int = 0
    anon_binding: int = 0
    anon_flow: int = 0
    imports: list[_ImportDecl] = field(default_factory=list)
    # When True, skip inheritance/type-warn (deferred to project link pass)
    defer_link: bool = False
    # Exposes not found in this file: (view id, placeholder id, ref, scope),
    # resolved against every file in parse_project.
    pending_exposes: list[tuple[str, str, str, str | None]] = field(
        default_factory=list
    )
    # True for the link pass over all files (a single-file parse cannot tell what
    # another file declares, so it does not warn about types it cannot see).
    is_project: bool = False
    # Source line each element was declared on (per file; merged by parse_project).
    element_lines: dict[str, int] = field(default_factory=dict)
    # (file id, text) of warnings about type references, filed under the usage's file.
    type_warnings: list[tuple[str, str]] = field(default_factory=list)
    # (file id, text) for import checks in project mode, filed under the importing file.
    import_warnings: list[tuple[str, str]] = field(default_factory=list)
    # Usages that already got an ambiguity or visibility warning.
    type_warned: set[str] = field(default_factory=set)
    # Source line of each `perform` element, for warnings after linking.
    perform_lines: dict[str, int] = field(default_factory=dict)
    # Relationship ends resolved by `_link_references` once every file is parsed.
    pending_refs: list[_PendingRef] = field(default_factory=list)
    # (file id, text) of warnings produced while linking references.
    ref_warnings: list[tuple[str, str]] = field(default_factory=list)
    # Ends of occurrence-form messages, resolved by `_link_message_ends`.
    pending_message_ends: list[_PendingMessageEnd] = field(default_factory=list)
    # Parts `_link_occurrences` made for features a message end passes through.
    materialized_ids: set[str] = field(default_factory=set)
    # Messages declared without a name (numbered by the parser).
    anonymous_messages: set[str] = field(default_factory=set)

    def current_parent(self) -> str | None:
        for scope in reversed(self.scopes):
            if scope.element_id:
                return scope.element_id
        return None

    def next_anon_name(self, prefix: str) -> str:
        key = (self.current_parent(), prefix)
        n = self.anon_per_owner.get(key, 0) + 1
        self.anon_per_owner[key] = n
        return f"{prefix}{n}"

    def qualify(self, name: str) -> str:
        parent = self.current_parent()
        return f"{parent}::{name}" if parent else name

    def add_child(self, parent_id: str | None, child_id: str) -> None:
        if parent_id and parent_id in self.elements:
            if child_id not in self.elements[parent_id].children:
                self.elements[parent_id].children.append(child_id)


def _tokenize(content: str) -> list[_Token]:
    tokens: list[_Token] = []
    line = 1
    for match in _TOKEN_RE.finditer(content):
        kind = match.lastgroup or "other"
        value = match.group(0)
        if kind == "ws":
            line += value.count("\n")
            continue
        if kind == "comment":
            continue
        tokens.append(_Token(kind=kind, value=value, line=line))
        line += value.count("\n")
    return tokens


def _strip_quotes(name: str) -> str:
    if len(name) >= 2 and name[0] in "'\"" and name[-1] == name[0]:
        return name[1:-1]
    return name


def _block_comment_text(value: str) -> str:
    """Extract inner text from a `/* … */` token."""
    if value.startswith("/*") and value.endswith("*/"):
        return value[2:-2].strip()
    return value.strip()


class SubsetSysmlParser:
    def parse(self, content: str, file_id: str) -> ParseResult:
        state = self._parse_declarations(content, file_id, defer_link=False)
        return ParseResult(
            elements=dict(state.elements),
            warnings=state.warnings,
            file_warnings={file_id: list(state.warnings)},
            imports=[
                {
                    "fileId": imp.file_id,
                    "visibility": imp.visibility,
                    "path": imp.path,
                    "line": imp.line,
                    "ownerId": imp.owner_id,
                }
                for imp in state.imports
            ],
        )

    def parse_project(self, files: list) -> ParseResult:
        """Parse all project files, then link imports / inheritance / type refs."""
        from domain.models import SysmlFile

        merged: dict[str, SemanticElement] = {}
        all_imports: list[_ImportDecl] = []
        pending_exposes: list[tuple[str, str, str, str | None]] = []
        pending_refs: list[_PendingRef] = []
        pending_message_ends: list[_PendingMessageEnd] = []
        perform_lines: dict[str, int] = {}
        element_lines: dict[str, int] = {}
        file_warnings: dict[str, list[str]] = {}
        warnings: list[str] = []

        for sysml_file in files:
            assert isinstance(sysml_file, SysmlFile)
            state = self._parse_declarations(
                sysml_file.content, sysml_file.id, defer_link=True
            )
            file_warnings[sysml_file.id] = list(state.warnings)
            warnings.extend(state.warnings)
            all_imports.extend(state.imports)
            pending_exposes.extend(state.pending_exposes)
            pending_refs.extend(state.pending_refs)
            pending_message_ends.extend(state.pending_message_ends)
            perform_lines.update(state.perform_lines)
            element_lines.update(state.element_lines)
            for eid, element in state.elements.items():
                merged[eid] = element

        self._link_expose_refs(merged, pending_exposes)

        link_state = _ParserState(elements=merged, file_id="")
        link_state.is_project = True
        link_state.imports = all_imports
        link_state.perform_lines = perform_lines
        link_state.element_lines = element_lines
        link_state.pending_refs = pending_refs
        link_state.pending_message_ends = pending_message_ends
        self._link_references(link_state)
        self._link_occurrences(link_state)
        for fid, text in link_state.ref_warnings:
            warnings.append(text)
            file_warnings.setdefault(fid, []).append(text)
        self._apply_import_visibility(link_state)
        for fid, text in link_state.import_warnings:
            warnings.append(text)
            file_warnings.setdefault(fid, []).append(text)
        self._inherit_features_onto_usages(link_state)
        for fid, text in link_state.type_warnings:
            warnings.append(text)
            file_warnings.setdefault(fid, []).append(text)
        self._warn_unresolved_type_refs(link_state)
        self._link_performs(link_state)
        link_state.ref_warnings.clear()
        self._warn_unresolved_references(link_state)
        for fid, text in link_state.ref_warnings:
            warnings.append(text)
            file_warnings.setdefault(fid, []).append(text)
        warnings.extend(link_state.warnings)
        # Attach link warnings to first file for visibility
        if link_state.warnings and files:
            fid = files[0].id
            file_warnings.setdefault(fid, []).extend(link_state.warnings)

        return ParseResult(
            elements=merged,
            warnings=warnings,
            file_warnings=file_warnings,
            imports=[
                {
                    "fileId": imp.file_id,
                    "visibility": imp.visibility,
                    "path": imp.path,
                    "line": imp.line,
                    "ownerId": imp.owner_id,
                }
                for imp in all_imports
            ],
        )

    @staticmethod
    def _link_expose_refs(
        elements: dict[str, SemanticElement],
        pending: list[tuple[str, str, str, str | None]],
    ) -> None:
        """Point exposes that named another file's element at that element."""
        for view_id, placeholder, ref, scope in pending:
            view = elements.get(view_id)
            if view is None or placeholder in elements:
                continue
            resolved = _resolve_expose_ref(
                ref, scope, elements, prefer_file=view.file_id
            )
            if resolved is None:
                continue
            seen = resolved in view.expose_refs
            refs: list[str] = []
            for existing in view.expose_refs:
                target = resolved if existing == placeholder else existing
                if target not in refs:
                    refs.append(target)
            view.expose_refs = refs
            moved = kind_of_expose(view.expose_kinds, placeholder)
            view.expose_kinds.pop(placeholder, None)
            set_expose_kind(view.expose_kinds, resolved, moved, seen=seen)
            if view.expose_ref == placeholder:
                view.expose_ref = resolved

    def _parse_declarations(
        self, content: str, file_id: str, *, defer_link: bool
    ) -> _ParserState:
        state = _ParserState(file_id=file_id, defer_link=defer_link)
        # `abstract part def X`: the prefix applies to the declaration whose
        # keyword starts at token index `abstract_decl_at`.
        pending_abstract = False
        abstract_decl_at = -1
        tokens = _tokenize(content)
        i = 0
        n = len(tokens)

        def peek(offset: int = 0) -> _Token | None:
            j = i + offset
            return tokens[j] if j < n else None

        def take() -> _Token | None:
            nonlocal i
            if i >= n:
                return None
            tok = tokens[i]
            i += 1
            return tok

        def expect_ident() -> str | None:
            tok = peek()
            if not tok:
                return None
            if tok.kind == "ident":
                take()
                return tok.value
            if tok.kind == "string":
                take()
                return _strip_quotes(tok.value)
            return None

        def expect_qualified_name() -> str | None:
            """Read ``Name`` or ``A::B::c`` (not dotted port paths)."""
            name = expect_ident()
            if not name:
                return None
            parts = [name]
            while peek() and peek().value == "::":
                take()
                nxt = expect_ident()
                if not nxt:
                    break
                parts.append(nxt)
            return "::".join(parts)

        def expect_feature_ref() -> str | None:
            """Read ``name``, ``flow.step`` or ``Pkg::Fn::flow.step`` as written."""
            name = expect_ident()
            if not name:
                return None
            ref = name
            while peek() and peek().value in {"::", "."}:
                sep = peek().value
                nxt = peek(1)
                if not nxt or nxt.kind not in {"ident", "string"}:
                    break
                take()
                ref += sep + (expect_ident() or "")
            return ref

        def read_multiplicity() -> str | None:
            if not (peek() and peek().value == "["):
                return None
            take()
            mult_parts: list[str] = []
            while peek() and peek().value != "]":
                mult_parts.append(peek().value)
                take()
            if peek() and peek().value == "]":
                take()
            return "".join(mult_parts).strip() or None

        def read_short_id() -> str | None:
            """Parse optional short name `<'R-01'>` or `<R-01>` before a declaration name."""
            if not (peek() and peek().value == "<"):
                return None
            take()  # <
            short: str | None = None
            if peek() and peek().kind in {"string", "ident"}:
                tok = take()
                assert tok is not None
                short = _strip_quotes(tok.value) if tok.kind == "string" else tok.value
            if peek() and peek().value == ">":
                take()
            return short or None

        def read_default_value() -> str | None:
            """Parse optional `= <literal>` after a feature declaration."""
            if not (peek() and peek().value == "="):
                return None
            take()  # =
            parts: list[str] = []
            while peek() and peek().value not in {";", "{"}:
                tok = take()
                if not tok:
                    break
                if tok.kind == "string":
                    parts.append(tok.value)
                else:
                    parts.append(tok.value)
            text = "".join(parts).strip()
            return text or None

        def skip_until_semicolon_or_brace() -> None:
            """Skip one statement: either through ';' or a matched '{...}' block."""
            nonlocal i, pending_abstract
            pending_abstract = False
            depth = 0
            seen_brace = False
            while i < n:
                tok = take()
                if not tok:
                    break
                if tok.value == "{":
                    depth += 1
                    seen_brace = True
                elif tok.value == "}":
                    if depth == 0:
                        # Closing brace belongs to outer scope — put it back
                        i -= 1
                        break
                    depth -= 1
                    if seen_brace and depth == 0:
                        break
                elif tok.value == ";" and depth == 0:
                    break

        def resolve_local_ref(ref: str) -> str:
            """Resolve flow-local names (successions, messages, transitions, :>) in the file so far."""
            if "::" in ref:
                if ref in state.elements:
                    return ref
                parent = state.current_parent()
                while parent:
                    candidate = f"{parent}::{ref}"
                    if candidate in state.elements:
                        return candidate
                    el = state.elements.get(parent)
                    parent = el.parent_id if el else None
                # Prefer package-root qualification when unique-looking
                root = None
                if state.scopes:
                    for sc in state.scopes:
                        if sc.element_id and sc.kind == ArtifactKind.PACKAGE:
                            root = sc.element_id
                            break
                    if not root:
                        for sc in state.scopes:
                            if sc.element_id:
                                root = sc.element_id
                                break
                if root:
                    candidate = f"{root}::{ref}"
                    if candidate in state.elements:
                        return candidate
                return ref
            parent = state.current_parent()
            if not parent:
                return ref
            # Try parent::ref, then walk up for simple names
            candidate = f"{parent}::{ref.replace('.', '::')}"
            if candidate in state.elements:
                return candidate
            # Dotted path relative to parent: engine.powerIn -> parent::engine::powerIn
            parts = ref.split(".")
            if len(parts) > 1:
                built = parent
                for part in parts:
                    built = f"{built}::{part}"
                if built in state.elements:
                    return built
            # Walk ancestors for a simple-name match (sibling under package, etc.)
            walk = parent
            while walk:
                sibling = f"{walk}::{ref}"
                if sibling in state.elements:
                    return sibling
                el = state.elements.get(walk)
                walk = el.parent_id if el else None
            return f"{parent}::{ref.replace('.', '::')}"

        def add_pending(
            element_id: str, role: str, ref: str, line: int, label: str
        ) -> None:
            if not ref:
                return
            state.pending_refs.append(
                _PendingRef(
                    element_id=element_id,
                    role=role,
                    ref=ref,
                    scope_id=state.current_parent(),
                    file_id=file_id,
                    line=line,
                    label=label,
                )
            )

        def read_endpoint() -> str | None:
            parts: list[str] = []
            name = expect_qualified_name()
            if not name:
                return None
            parts.append(name)
            while peek() and peek().value == ".":
                take()
                nxt_name = expect_ident()
                if not nxt_name:
                    break
                parts.append(nxt_name)
            return ".".join(parts)

        def current_scope() -> _Scope | None:
            return state.scopes[-1] if state.scopes else None

        def ensure_flow_action(
            name: str,
            *,
            type_ref: str | None = None,
            metadata_keywords: list[str] | None = None,
        ) -> str:
            element_id = state.qualify(name)
            if element_id not in state.elements:
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.ACTION,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                    metadata_keywords=list(metadata_keywords or []),
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
            elif metadata_keywords:
                existing = state.elements[element_id]
                for kw in metadata_keywords:
                    if kw not in existing.metadata_keywords:
                        existing.metadata_keywords.append(kw)
            return element_id

        def add_flow_succession(
            source_name: str,
            target_name: str,
            *,
            succ_name: str | None = None,
        ) -> None:
            parent = state.current_parent()

            def resolve_step(name: str) -> str:
                if parent:
                    cand = f"{parent}::{name}"
                    if cand in state.elements:
                        return cand
                return resolve_local_ref(name)

            if not succ_name:
                succ_name = state.next_anon_name("succ")
            element_id = state.qualify(succ_name)
            el = SemanticElement(
                id=element_id,
                kind=ArtifactKind.SUCCESSION,
                name=succ_name,
                parent_id=parent,
                source_id=resolve_step(source_name),
                target_id=resolve_step(target_name),
                file_id=file_id,
            )
            state.add_child(parent, element_id)
            state.elements[element_id] = el

        def link_from_previous(target_name: str) -> None:
            scope = current_scope()
            if not scope:
                return
            if scope.branch_ends:
                for end in scope.branch_ends:
                    add_flow_succession(end, target_name)
                scope.branch_ends = None
            elif scope.last_flow_step:
                add_flow_succession(scope.last_flow_step, target_name)
            scope.last_flow_step = target_name

        def add_relationship(
            kind: ArtifactKind,
            source_ref: str,
            target_ref: str,
            line: int,
            name: str | None = None,
            *,
            counter_attr: str,
            default_prefix: str,
            metadata_keywords: list[str] | None = None,
            written_ref: str | None = None,
        ) -> None:
            local = kind in _LOCAL_RELATION_KINDS
            scope = state.current_parent()
            # For `:>` / `:>>` the source is the declaration itself.
            source_id = state.qualify(source_ref) if local else _legacy_ref(source_ref, scope)
            target_id = _legacy_ref(target_ref, scope)
            if not name:
                current = getattr(state, counter_attr) + 1
                setattr(state, counter_attr, current)
                name = f"{default_prefix}{current}"
            element_id = state.qualify(name)
            if element_id in state.elements:
                suffix = getattr(state, counter_attr) + 1
                setattr(state, counter_attr, suffix)
                name = f"{name}_{suffix}"
                element_id = state.qualify(name)
            el = SemanticElement(
                id=element_id,
                kind=kind,
                name=name,
                parent_id=state.current_parent(),
                source_id=source_id,
                target_id=target_id,
                file_id=file_id,
                metadata_keywords=list(metadata_keywords or []),
            )
            # A feature chain (`car.keyFob`) is kept as written, for the serializer.
            if written_ref and "." in written_ref:
                el.type_ref = written_ref
            state.add_child(el.parent_id, element_id)
            state.elements[element_id] = el
            label = _RELATION_LABELS[kind]
            if not local:
                add_pending(element_id, "source", source_ref, line, label)
            add_pending(element_id, "target", target_ref, line, label)

        def take_prefix_metadata_keywords() -> list[str]:
            """Consume zero or more `#Keyword` prefixes (SysML user-defined keywords)."""
            keywords: list[str] = []
            while peek() and peek().value == "#":
                hash_tok = take()
                nxt = peek()
                if not nxt or nxt.kind != "ident":
                    line = hash_tok.line if hash_tok else "?"
                    state.warnings.append(f"line {line}: '#' without metadata name")
                    break
                keywords.append(expect_ident())
            return keywords

        def peek_is_part_declaration() -> bool:
            nxt = peek()
            if not nxt or nxt.kind != "ident":
                return False
            if nxt.value == "part":
                return True
            if nxt.value == "ref":
                nxt2 = tokens[i + 1] if i + 1 < n else None
                return bool(
                    nxt2 and nxt2.kind == "ident" and nxt2.value == "part"
                )
            return False

        def displace_message(old: SemanticElement) -> None:
            """Another member took the name of a message in an occurrence: the
            message moves to a free id and keeps its ends. A named message becomes
            `<occ>::a#2` (several of them keep their declaration order, with a
            warning); one the parser numbered itself gets the next free `msgN`."""
            elements = state.elements
            assert old.parent_id is not None
            owner = elements[old.parent_id]
            if old.id in state.anonymous_messages:
                n = state.anon_per_owner.get((owner.id, "msg"), 0)
                while f"{owner.id}::msg{n + 1}" in elements:
                    n += 1
                n += 1
                state.anon_per_owner[(owner.id, "msg")] = n
                mapping = {old.id: f"{owner.id}::msg{n}"}
                old.name = f"msg{n}"
            else:
                key = old.id
                pattern = re.compile(re.escape(key) + r"#\d+")
                group = [
                    cid
                    for cid in owner.children
                    if cid == key or (pattern.fullmatch(cid) and elements[cid].kind == ArtifactKind.MESSAGE)
                ]
                mapping = {cid: f"{key}#{i + 2}" for i, cid in enumerate(group)}
                state.warnings.append(
                    f"line {getattr(elements, 'line', 0)}: message name '{old.name}' "
                    f"already names a member of '{owner.id}'"
                )
            moved = {cid: dict.pop(elements, cid) for cid in mapping}
            for cid, msg in moved.items():
                new_id = mapping[cid]
                msg.id = new_id
                dict.__setitem__(elements, new_id, msg)
                if isinstance(elements, _TrackedElements):
                    elements.lines[new_id] = elements.lines.get(cid, elements.line)
                if cid in state.anonymous_messages:
                    state.anonymous_messages.discard(cid)
                    state.anonymous_messages.add(new_id)
            owner.children = [mapping.get(c, c) for c in owner.children]
            # The new member was already listed under the old id; list it again.
            owner.children.append(next(iter(moved)))
            for pending in state.pending_message_ends:
                pending.message_id = mapping.get(pending.message_id, pending.message_id)

        if isinstance(state.elements, _TrackedElements):
            state.elements.on_message_clash = displace_message

        def parse_occurrence_message(
            line: int, metadata_keywords: list[str]
        ) -> None:
            """`[name] [of Type] from <end> to <end>;` in an occurrence def.

            The ends are resolved after parsing (`_link_message_ends`); until
            then they point at the head part of each path.
            """
            occurrence_id = state.current_parent()
            assert occurrence_id is not None
            declared: str | None = None
            if peek() and peek().kind == "ident" and peek().value not in {"from", "of"}:
                declared = expect_ident()
            type_ref: str | None = None
            if peek() and peek().kind == "ident" and peek().value == "of":
                take()
                type_ref = expect_qualified_name()
            if not (peek() and peek().value == "from"):
                state.warnings.append(f"line {line}: message expected 'from'")
                skip_until_semicolon_or_brace()
                return
            take()  # from
            source_path = read_endpoint()
            if not (peek() and peek().value == "to"):
                state.warnings.append(f"line {line}: message expected 'to'")
                skip_until_semicolon_or_brace()
                return
            take()  # to
            target_path = read_endpoint()
            if peek() and peek().value == ";":
                take()
            if declared:
                name = declared
                element_id = state.qualify(name)
                if element_id in state.elements:
                    state.warnings.append(
                        f"line {line}: message name '{name}' already names a "
                        f"member of '{occurrence_id}'"
                    )
                    element_id = _free_id([element_id], state.elements)
            else:
                name = state.next_anon_name("msg")
                while state.qualify(name) in state.elements:
                    name = state.next_anon_name("msg")
                element_id = state.qualify(name)
                state.anonymous_messages.add(element_id)

            def head(path: str | None) -> str | None:
                return f"{occurrence_id}::{path.split('.')[0]}" if path else None

            el = SemanticElement(
                id=element_id,
                kind=ArtifactKind.MESSAGE,
                name=name,
                parent_id=occurrence_id,
                type_ref=type_ref,
                source_id=head(source_path),
                target_id=head(target_path),
                file_id=file_id,
                metadata_keywords=list(metadata_keywords),
            )
            state.add_child(occurrence_id, element_id)
            state.elements[element_id] = el
            for role, path in (("source", source_path), ("target", target_path)):
                if path:
                    state.pending_message_ends.append(
                        _PendingMessageEnd(
                            message_id=element_id,
                            role=role,
                            path=path,
                            occurrence_id=occurrence_id,
                            file_id=file_id,
                            line=line,
                        )
                    )

        def parse_message_statement(
            line: int, metadata_keywords: list[str]
        ) -> None:
            """Parse `[payload] from A to B;` after the `message` keyword.

            Shared by `message …`, `then message …` and `#reply message …`.
            """
            scope_el = next(
                (sc for sc in reversed(state.scopes) if sc.element_id), None
            )
            if scope_el is not None and scope_el.kind == ArtifactKind.OCCURRENCE:
                parse_occurrence_message(line, metadata_keywords)
                return
            payload_parts: list[str] = []
            if peek() and peek().kind == "ident" and peek().value != "from":
                payload_parts.append(expect_ident() or "")
                while peek() and peek().value == ".":
                    take()
                    nxt = expect_ident()
                    if nxt:
                        payload_parts.append(nxt)
            if not (peek() and peek().value == "from"):
                state.warnings.append(f"line {line}: message expected 'from'")
                skip_until_semicolon_or_brace()
                return
            take()  # from
            source_name = expect_ident()
            if not (peek() and peek().value == "to"):
                state.warnings.append(f"line {line}: message expected 'to'")
                skip_until_semicolon_or_brace()
                return
            take()  # to
            target_name = expect_ident()
            if peek() and peek().value == ";":
                take()

            def resolve_participant(name: str | None) -> str | None:
                if not name:
                    return None
                parent = state.current_parent()
                if parent:
                    cand = f"{parent}::{name}"
                    if cand in state.elements:
                        return cand
                # search lifelines under parent by name
                if parent and parent in state.elements:
                    for cid in state.elements[parent].children:
                        child = state.elements.get(cid)
                        if (
                            child
                            and child.kind == ArtifactKind.LIFELINE
                            and child.name == name
                        ):
                            return child.id
                return resolve_local_ref(name)

            msg_name = state.next_anon_name("msg")
            element_id = state.qualify(msg_name)
            payload = ".".join(p for p in payload_parts if p) or msg_name
            el = SemanticElement(
                id=element_id,
                kind=ArtifactKind.MESSAGE,
                name=payload,
                parent_id=state.current_parent(),
                type_ref=payload,
                source_id=resolve_participant(source_name),
                target_id=resolve_participant(target_name),
                file_id=file_id,
                metadata_keywords=list(metadata_keywords),
            )
            state.add_child(el.parent_id, element_id)
            state.elements[element_id] = el

        def parse_dependency_statement(metadata_keywords: list[str]) -> None:
            line = peek().line if peek() else 0
            take()  # dependency
            dep_name: str | None = None
            # Forms: `dependency from A to B` or `dependency A to B` or `dependency name from A to B`
            if peek() and peek().value != "from" and peek().value != "to":
                # optional name, or source of shorthand `dependency A to B`
                maybe = expect_ident()
                if peek() and peek().value == "to":
                    # shorthand: dependency Source to Target
                    source_ref = maybe
                    take()  # to
                    targets: list[str] = []
                    while True:
                        target_ref = read_endpoint()
                        if target_ref:
                            targets.append(target_ref)
                        if peek() and peek().value == ",":
                            take()
                            continue
                        break
                    if peek() and peek().value == ";":
                        take()
                    for idx, target_ref in enumerate(targets):
                        add_relationship(
                            ArtifactKind.DEPENDENCY,
                            source_ref or "",
                            target_ref,
                            line,
                            name=None,
                            counter_attr="anon_dependency",
                            default_prefix="dep",
                            metadata_keywords=metadata_keywords,
                        )
                    return
                dep_name = maybe
            if not (peek() and peek().value == "from"):
                state.warnings.append(f"line {line}: dependency missing 'from'")
                skip_until_semicolon_or_brace()
                return
            take()  # from
            source_ref = read_endpoint()
            if not source_ref:
                state.warnings.append(f"line {line}: dependency missing source")
                skip_until_semicolon_or_brace()
                return
            if not (peek() and peek().value == "to"):
                state.warnings.append(f"line {line}: dependency missing 'to'")
                skip_until_semicolon_or_brace()
                return
            take()  # to
            targets: list[str] = []
            while True:
                target_ref = read_endpoint()
                if target_ref:
                    targets.append(target_ref)
                if peek() and peek().value == ",":
                    take()
                    continue
                break
            if peek() and peek().value == ";":
                take()
            for idx, target_ref in enumerate(targets):
                name = (
                    dep_name
                    if len(targets) == 1
                    else f"{dep_name}_{idx + 1}"
                    if dep_name
                    else None
                )
                add_relationship(
                    ArtifactKind.DEPENDENCY,
                    source_ref,
                    target_ref,
                    line,
                    name=name,
                    counter_attr="anon_dependency",
                    default_prefix="dep",
                    metadata_keywords=metadata_keywords,
                )

        pending_metadata_keywords: list[str] = []

        def abstract_declaration_start() -> int | None:
            """Token index of the declaration `abstract` (at i) applies to.

            Supported: `[#Kw…] part [def] name`, `[#Kw…] ref part name`, and
            without prefix metadata `action [def] name`, `requirement [def] …`,
            `use case [def] …` and `case [def] …`. None for anything else.
            """
            j = i + 1
            has_metadata = False
            while j + 1 < n and tokens[j].value == "#" and tokens[j + 1].kind == "ident":
                has_metadata = True
                j += 2
            start = j

            def value(k: int) -> str | None:
                return tokens[k].value if k < n else None

            if value(j) == "ref" and value(j + 1) == "part":
                j += 2
            elif value(j) == "part":
                j += 1
            elif has_metadata:
                return None
            elif value(j) in {"action", "requirement", "case"}:
                j += 1
            elif value(j) == "use" and value(j + 1) == "case":
                j += 2
            else:
                return None
            if value(j) == "def":
                j += 1
            if value(j) == "<":  # short name `<'R-1'>`
                while j < n and tokens[j].value != ">":
                    j += 1
                j += 1
            if j < n and tokens[j].kind in {"ident", "string"}:
                return start
            return None

        while i < n:
            tok = peek()
            if not tok:
                break
            if isinstance(state.elements, _TrackedElements):
                state.elements.line = tok.line

            # The declaration `abstract` applied to has been parsed (or skipped).
            if pending_abstract and i > abstract_decl_at:
                pending_abstract = False

            if tok.kind == "ident" and tok.value == "abstract":
                decl_at = abstract_declaration_start()
                take()
                if decl_at is None:
                    nxt = peek()
                    state.warnings.append(
                        f"line {tok.line}: 'abstract' ignored before "
                        f"'{nxt.value if nxt else 'end of file'}'"
                    )
                    pending_abstract = False
                else:
                    pending_abstract = True
                    abstract_decl_at = decl_at
                continue

            if tok.value == "{":
                take()
                if state.scopes:
                    state.scopes[-1].brace_depth += 1
                else:
                    state.scopes.append(_Scope(element_id=None, brace_depth=1))
                continue

            if tok.value == "}":
                take()
                if state.scopes:
                    scope = state.scopes[-1]
                    scope.brace_depth -= 1
                    if scope.brace_depth <= 0:
                        state.scopes.pop()
                continue

            if tok.kind == "ident" and tok.value == "package":
                take()
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: package without name")
                    continue
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.PACKAGE,
                    name=name,
                    parent_id=state.current_parent(),
                    file_id=file_id,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                # Expect optional {
                nxt = peek()
                if nxt and nxt.value == "{":
                    take()
                    state.scopes.append(
                        _Scope(element_id=element_id, kind=ArtifactKind.PACKAGE, brace_depth=1)
                    )
                continue

            # `ref part …` — reference (non-composite) feature
            is_ref_part = False
            if tok.kind == "ident" and tok.value == "ref":
                # Look ahead without consuming unless followed by part
                nxt_tok = tokens[i + 1] if i + 1 < n else None
                if nxt_tok and nxt_tok.kind == "ident" and nxt_tok.value == "part":
                    take()  # ref
                    is_ref_part = True
                    tok = peek()
                # else fall through to unknown-ident handling

            if tok and tok.kind == "ident" and tok.value == "part":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                # `part :>> wheels;` — the redefining feature takes the name of its target.
                unnamed_redefinition = (
                    not name
                    and not is_def
                    and peek() is not None
                    and peek().value in {":>>", "redefines"}
                )
                if not name and not unnamed_redefinition:
                    pending_metadata_keywords = []
                    state.warnings.append(f"line {tok.line}: part without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                is_specialization = False
                multiplicity = read_multiplicity()
                # Usage typing `part x : Type` or specialization `part def X :> Type`
                if peek() and peek().value in {":", ":>"}:
                    op = peek().value
                    take()
                    if op == ":>":
                        is_specialization = True
                    if peek() and peek().value == "~":
                        take()
                    # `part x :> a.b` subsets a feature chain; a def's `:> T` is a type.
                    if op == ":>" and not is_def:
                        type_ref = expect_feature_ref()
                    else:
                        type_ref = expect_qualified_name()
                if multiplicity is None:
                    multiplicity = read_multiplicity()
                subset_target: str | None = None
                redefine_target: str | None = None
                # Usage `part x : T :> Other::x` → subsetting after type
                if (
                    not is_def
                    and not is_specialization
                    and peek()
                    and peek().value == ":>"
                ):
                    take()
                    subset_target = expect_feature_ref()
                if peek() and peek().value == "subsets":
                    take()
                    subset_target = expect_feature_ref()
                elif peek() and peek().value == "redefines":
                    take()
                    redefine_target = expect_feature_ref()
                elif peek() and peek().value == ":>>":
                    take()
                    redefine_target = expect_feature_ref()
                if unnamed_redefinition:
                    name = (
                        re.split(r"::|\.", redefine_target)[-1]
                        if redefine_target
                        else None
                    )
                    if not name:
                        pending_metadata_keywords = []
                        state.warnings.append(f"line {tok.line}: part without name")
                        skip_until_semicolon_or_brace()
                        continue
                element_id = state.qualify(name)
                # Bare `part x :> Other` on usage → subsetting (not specialization)
                if (not is_def) and is_specialization and type_ref and not subset_target:
                    subset_target = type_ref
                    type_ref = None
                    is_specialization = False
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.PART,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    multiplicity=multiplicity,
                    is_reference=is_ref_part,
                    is_abstract=pending_abstract,
                    is_definition=is_def,
                    metadata_keywords=list(pending_metadata_keywords),
                    file_id=file_id,
                )
                pending_metadata_keywords = []
                pending_abstract = False
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if is_def and is_specialization and type_ref:
                    add_relationship(
                        ArtifactKind.SPECIALIZATION,
                        name,
                        type_ref,
                        tok.line,
                        name=f"{name}_specializes_{type_ref.replace('::', '_')}",
                        counter_attr="anon_dependency",
                        default_prefix="spec",
                    )
                if subset_target:
                    add_relationship(
                        ArtifactKind.SUBSETTING,
                        name,
                        subset_target,
                        tok.line,
                        name=f"{name}_subsets_{_ref_name(subset_target)}",
                        counter_attr="anon_dependency",
                        default_prefix="subset",
                        written_ref=subset_target,
                    )
                if redefine_target:
                    add_relationship(
                        ArtifactKind.REDEFINITION,
                        name,
                        redefine_target,
                        tok.line,
                        name=f"{name}_redefines_{_ref_name(redefine_target)}",
                        counter_attr="anon_dependency",
                        default_prefix="redef",
                        written_ref=redefine_target,
                    )
                nxt = peek()
                if nxt and nxt.value == "{":
                    take()
                    state.scopes.append(
                        _Scope(element_id=element_id, kind=ArtifactKind.PART, brace_depth=1)
                    )
                elif nxt and nxt.value == ";":
                    take()
                else:
                    # tolerate missing semicolon
                    pass
                continue

            if tok.kind == "ident" and tok.value == "port":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: port without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if not is_def and peek() and peek().value == ":":
                    take()
                    if peek() and peek().value == "~":
                        take()
                    type_ref = expect_ident()
                default_value = None if is_def else read_default_value()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.PORT,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    default_value=default_value,
                    file_id=file_id,
                    is_definition=is_def,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                nxt = peek()
                if nxt and nxt.value == "{":
                    take()
                    state.scopes.append(
                        _Scope(element_id=element_id, kind=ArtifactKind.PORT, brace_depth=1)
                    )
                elif nxt and nxt.value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value in {"connection", "connect"}:
                line = tok.line
                keyword = tok.value
                take()
                conn_name: str | None = None
                if keyword == "connection":
                    # connection [name] connect A to B
                    if peek() and peek().kind in {"ident", "string"} and peek().value != "connect":
                        conn_name = expect_ident()
                    if peek() and peek().value == "connect":
                        take()
                source_ref = read_endpoint()
                if not (peek() and peek().value == "to"):
                    # maybe "connect (a, b)" form — skip
                    state.warnings.append(
                        f"line {line}: unsupported connect syntax; expected 'to'"
                    )
                    skip_until_semicolon_or_brace()
                    continue
                take()  # to
                target_ref = read_endpoint()
                if not source_ref or not target_ref:
                    state.warnings.append(f"line {line}: connection missing endpoints")
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()

                if not conn_name:
                    state.anon_conn += 1
                    conn_name = f"conn{state.anon_conn}"
                element_id = state.qualify(conn_name)
                source_id = _legacy_ref(source_ref, state.current_parent())
                target_id = _legacy_ref(target_ref, state.current_parent())
                add_pending(element_id, "source", source_ref, line, "connection")
                add_pending(element_id, "target", target_ref, line, "connection")
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.CONNECTION,
                    name=conn_name,
                    parent_id=state.current_parent(),
                    source_id=source_id,
                    target_id=target_id,
                    file_id=file_id,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                continue

            if tok.kind == "ident" and tok.value == "dependency":
                parse_dependency_statement([])
                continue

            if tok.value == "#":
                pending_metadata_keywords = take_prefix_metadata_keywords()
                if peek() and peek().kind == "ident" and peek().value == "dependency":
                    parse_dependency_statement(pending_metadata_keywords)
                    pending_metadata_keywords = []
                    continue
                if peek_is_part_declaration():
                    # Next loop iteration parses part / ref part with pending keywords.
                    continue
                if peek() and peek().kind == "ident" and peek().value == "message":
                    take()  # message
                    parse_message_statement(tok.line, pending_metadata_keywords)
                    pending_metadata_keywords = []
                    continue
                state.warnings.append(
                    f"line {tok.line}: metadata prefix ignored "
                    f"(only supported on dependency, part and message in alpha)"
                )
                pending_metadata_keywords = []
                skip_until_semicolon_or_brace()
                continue

            if tok.kind == "ident" and tok.value in {"allocate", "allocation"}:
                line = tok.line
                keyword = tok.value
                take()
                alloc_name: str | None = None
                if keyword == "allocation" and peek() and peek().value not in {"from"}:
                    nxt = peek()
                    if nxt and nxt.kind in {"ident", "string"}:
                        alloc_name = expect_ident()
                source_ref = read_endpoint()
                if peek() and peek().value == "from":
                    take()
                    source_ref = read_endpoint()
                if not (peek() and peek().value == "to"):
                    state.warnings.append(f"line {line}: allocation missing 'to'")
                    skip_until_semicolon_or_brace()
                    continue
                take()  # to
                target_ref = read_endpoint()
                if not source_ref or not target_ref:
                    state.warnings.append(f"line {line}: allocation missing endpoints")
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()
                add_relationship(
                    ArtifactKind.ALLOCATION,
                    source_ref,
                    target_ref,
                    line,
                    name=alloc_name,
                    counter_attr="anon_allocation",
                    default_prefix="alloc",
                )
                continue

            if tok.kind == "ident" and tok.value in {"bind", "binding"}:
                line = tok.line
                keyword = tok.value
                take()
                bind_name: str | None = None
                if keyword == "binding" and peek() and peek().value != "=":
                    nxt = peek()
                    if nxt and nxt.kind in {"ident", "string"}:
                        bind_name = expect_ident()
                source_ref = read_endpoint()
                if not (peek() and peek().value == "="):
                    state.warnings.append(f"line {line}: binding missing '='")
                    skip_until_semicolon_or_brace()
                    continue
                take()  # =
                target_ref = read_endpoint()
                if not source_ref or not target_ref:
                    state.warnings.append(f"line {line}: binding missing endpoints")
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()
                add_relationship(
                    ArtifactKind.BINDING,
                    source_ref,
                    target_ref,
                    line,
                    name=bind_name,
                    counter_attr="anon_binding",
                    default_prefix="bind",
                )
                continue

            if tok.kind == "ident" and tok.value == "flow":
                line = tok.line
                take()
                flow_name: str | None = None
                if peek() and peek().value != "from":
                    flow_name = expect_ident()
                if not (peek() and peek().value == "from"):
                    state.warnings.append(f"line {line}: flow missing 'from'")
                    skip_until_semicolon_or_brace()
                    continue
                take()  # from
                source_ref = read_endpoint()
                if not (peek() and peek().value == "to"):
                    state.warnings.append(f"line {line}: flow missing 'to'")
                    skip_until_semicolon_or_brace()
                    continue
                take()  # to
                target_ref = read_endpoint()
                if not source_ref or not target_ref:
                    state.warnings.append(f"line {line}: flow missing endpoints")
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()
                add_relationship(
                    ArtifactKind.FLOW,
                    source_ref,
                    target_ref,
                    line,
                    name=flow_name,
                    counter_attr="anon_flow",
                    default_prefix="flow",
                )
                continue

            if tok.kind == "ident" and tok.value == "view":
                take()
                is_definition = False
                if peek() and peek().value == "def":
                    take()
                    is_definition = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: view without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value in {":", ":>"}:
                    take()
                    # `StandardViewDefinitions::GeneralView` names GeneralView.
                    qualified = expect_qualified_name()
                    type_ref = qualified.split("::")[-1] if qualified else None
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.VIEW,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                    is_definition=is_definition,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(element_id=element_id, kind=ArtifactKind.VIEW, brace_depth=1)
                    )
                continue

            if tok.kind == "ident" and tok.value == "occurrence":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: occurrence without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                general_op = None
                if peek() and peek().value in {":", ":>"}:
                    general_op = peek().value
                    take()
                    type_ref = expect_qualified_name()
                element_id = state.qualify(name)
                specialization = bool(is_def and general_op == ":>" and type_ref)
                subsetting = bool(not is_def and general_op == ":>" and type_ref)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.OCCURRENCE,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref if not subsetting else None,
                    file_id=file_id,
                    is_definition=is_def,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if specialization or subsetting:
                    assert type_ref is not None
                    add_relationship(
                        ArtifactKind.SPECIALIZATION
                        if specialization
                        else ArtifactKind.SUBSETTING,
                        name,
                        type_ref,
                        tok.line,
                        name=(
                            f"{name}_{'specializes' if specialization else 'subsets'}_"
                            f"{_ref_name(type_ref)}"
                        ),
                        counter_attr="anon_dependency",
                        default_prefix="spec" if specialization else "subset",
                    )
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id,
                            kind=ArtifactKind.OCCURRENCE,
                            brace_depth=1,
                        )
                    )
                elif peek() and peek().value == ";":
                    take()
                continue

            # `event occurrence name [: T] { … } | ;` — a plain `event e;` is still skipped.
            if (
                tok.kind == "ident"
                and tok.value == "event"
                and peek(1)
                and peek(1).kind == "ident"
                and peek(1).value == "occurrence"
            ):
                take()
                take()
                name = expect_ident()
                if not name:
                    state.warnings.append(
                        f"line {tok.line}: event occurrence without name"
                    )
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value == ":":
                    take()
                    type_ref = expect_qualified_name()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.EVENT_OCCURRENCE,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id,
                            kind=ArtifactKind.EVENT_OCCURRENCE,
                            brace_depth=1,
                        )
                    )
                elif peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "interaction":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: interaction without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value in {":", ":>"}:
                    take()
                    type_ref = expect_ident()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.INTERACTION,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                    is_definition=is_def,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id,
                            kind=ArtifactKind.INTERACTION,
                            brace_depth=1,
                        )
                    )
                elif peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "lifeline":
                take()
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: lifeline without name")
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.LIFELINE,
                    name=name,
                    parent_id=state.current_parent(),
                    file_id=file_id,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                continue

            if tok.kind == "ident" and tok.value == "message":
                take()
                parse_message_statement(tok.line, [])
                continue

            if tok.kind == "ident" and tok.value == "state":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: state without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value in {":", ":>"}:
                    take()
                    type_ref = expect_ident()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.STATE,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                    is_definition=is_def,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id, kind=ArtifactKind.STATE, brace_depth=1
                        )
                    )
                elif peek() and peek().value == ";":
                    take()
                _ = is_def
                continue

            if tok.kind == "ident" and tok.value == "transition":
                line = tok.line
                take()
                # transition [name] [first] from A to B
                trans_name: str | None = None
                if peek() and peek().kind == "ident" and peek().value not in {
                    "from",
                    "first",
                }:
                    trans_name = expect_ident()
                if peek() and peek().value == "first":
                    take()
                if not (peek() and peek().value == "from"):
                    state.warnings.append(
                        f"line {line}: transition expected 'from'"
                    )
                    skip_until_semicolon_or_brace()
                    continue
                take()
                source_name = expect_ident()
                if not (peek() and peek().value == "to"):
                    state.warnings.append(f"line {line}: transition expected 'to'")
                    skip_until_semicolon_or_brace()
                    continue
                take()
                target_name = expect_ident()
                if peek() and peek().value == ";":
                    take()
                if not trans_name:
                    trans_name = state.next_anon_name("t")
                parent = state.current_parent()

                def resolve_state(name: str | None) -> str | None:
                    if not name:
                        return None
                    if parent:
                        cand = f"{parent}::{name}"
                        if cand in state.elements:
                            return cand
                    return resolve_local_ref(name)

                element_id = state.qualify(trans_name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.TRANSITION,
                    name=trans_name,
                    parent_id=parent,
                    source_id=resolve_state(source_name),
                    target_id=resolve_state(target_name),
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
                continue

            if tok.kind == "ident" and tok.value == "action":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: action without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value in {":", ":>"}:
                    take()
                    type_ref = expect_ident()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.ACTION,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    is_abstract=pending_abstract,
                    file_id=file_id,
                    is_definition=is_def,
                )
                pending_abstract = False
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id, kind=ArtifactKind.ACTION, brace_depth=1
                        )
                    )
                elif peek() and peek().value == ";":
                    take()
                _ = is_def
                continue

            if tok.kind == "ident" and tok.value == "succession":
                line = tok.line
                take()
                succ_name: str | None = None
                if peek() and peek().kind == "ident" and peek().value not in {
                    "first",
                    "then",
                }:
                    succ_name = expect_ident()
                if peek() and peek().value == "first":
                    take()
                source_name = expect_ident()
                if not (peek() and peek().value == "then"):
                    state.warnings.append(
                        f"line {line}: succession expected 'then'"
                    )
                    skip_until_semicolon_or_brace()
                    continue
                take()
                target_name = expect_ident()
                if peek() and peek().value == ";":
                    take()
                if not succ_name:
                    succ_name = state.next_anon_name("succ")
                parent = state.current_parent()

                def resolve_action(name: str | None) -> str | None:
                    if not name:
                        return None
                    if parent:
                        cand = f"{parent}::{name}"
                        if cand in state.elements:
                            return cand
                    return resolve_local_ref(name)

                element_id = state.qualify(succ_name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.SUCCESSION,
                    name=succ_name,
                    parent_id=parent,
                    source_id=resolve_action(source_name),
                    target_id=resolve_action(target_name),
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
                continue

            if tok.kind == "ident" and tok.value == "first":
                # `first start;` or `first start then X;` inside action/case/use case
                take()
                name = expect_ident()
                if not name:
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = "start" if name.lower() == "start" else None
                ensure_flow_action(name, type_ref=type_ref)
                scope = current_scope()
                if scope:
                    scope.last_flow_step = name
                    scope.branch_ends = None
                if peek() and peek().value == "then":
                    # handled by falling through would skip; parse inline then target
                    take()
                    target = expect_ident()
                    if target:
                        ensure_flow_action(
                            target,
                            type_ref="done" if target.lower() == "done" else None,
                        )
                        add_flow_succession(name, target)
                        if scope:
                            scope.last_flow_step = target
                if peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "then":
                line = tok.line
                take()
                # then [#Keyword…] message payload from A to B;
                if peek() and peek().value in {"message", "#"}:
                    msg_keywords = take_prefix_metadata_keywords()
                    if not (peek() and peek().value == "message"):
                        state.warnings.append(
                            f"line {line}: metadata prefix ignored after 'then'"
                        )
                        skip_until_semicolon_or_brace()
                        continue
                    take()  # message
                    parse_message_statement(line, msg_keywords)
                    continue
                # then if guard then a else b;
                if peek() and peek().value == "if":
                    take()
                    guard = expect_ident()
                    if not (peek() and peek().value == "then"):
                        state.warnings.append(
                            f"line {line}: if expected 'then' after guard"
                        )
                        skip_until_semicolon_or_brace()
                        continue
                    take()
                    yes_name = expect_ident()
                    no_name: str | None = None
                    if peek() and peek().value == "else":
                        take()
                        no_name = expect_ident()
                    if peek() and peek().value == ";":
                        take()
                    if not guard or not yes_name:
                        continue
                    ensure_flow_action(guard, type_ref="decide")
                    ensure_flow_action(yes_name)
                    link_from_previous(guard)
                    add_flow_succession(guard, yes_name, succ_name=f"if_{guard}_yes")
                    ends = [yes_name]
                    if no_name:
                        ensure_flow_action(no_name)
                        add_flow_succession(
                            guard, no_name, succ_name=f"if_{guard}_else"
                        )
                        ends.append(no_name)
                    scope = current_scope()
                    if scope:
                        scope.last_flow_step = None
                        scope.branch_ends = ends
                    continue

                # then perform [action] ref; | then action name; | then name;
                is_perform = False
                is_action_kw = False
                perform_ref: str | None = None
                if peek() and peek().value == "perform":
                    take()
                    is_perform = True
                    if peek() and peek().value == "action":
                        take()
                    perform_ref = expect_feature_ref()
                    target = ref_leaf(perform_ref) if perform_ref else None
                else:
                    if peek() and peek().value == "action":
                        take()
                        is_action_kw = True
                    target = expect_ident()
                if not target:
                    skip_until_semicolon_or_brace()
                    continue
                # optional `{ ... }` after perform — skip for now
                if peek() and peek().value == "{":
                    skip_until_semicolon_or_brace()
                elif peek() and peek().value == ";":
                    take()
                type_ref = None
                meta: list[str] = []
                if is_perform:
                    meta = ["perform"]
                    type_ref = perform_ref  # reference as written
                elif target.lower() == "done":
                    type_ref = "done"
                elif target.lower() == "start":
                    type_ref = "start"
                step_id = ensure_flow_action(
                    target,
                    type_ref=type_ref,
                    metadata_keywords=meta or None,
                )
                if is_perform:
                    state.perform_lines.setdefault(step_id, line)
                _ = is_action_kw
                link_from_previous(target)
                continue

            if tok.kind == "ident" and tok.value == "perform":
                # Standalone `perform [action] ref;`. In an action or case it is
                # also a flow step; in a part it says the part performs `ref`.
                take()
                if peek() and peek().value == "action":
                    take()
                perform_ref = expect_feature_ref()
                if not perform_ref:
                    skip_until_semicolon_or_brace()
                    continue
                target = ref_leaf(perform_ref)
                if peek() and peek().value == "{":
                    skip_until_semicolon_or_brace()
                elif peek() and peek().value == ";":
                    take()
                scope = current_scope()
                if scope and scope.kind == ArtifactKind.PART:
                    # The part performs `perform_ref`. Not a flow step: its id
                    # comes from the whole reference, so `perform a.stop;` and
                    # `perform b.stop;` (or a child named `stop`) stay apart.
                    perform_id = state.qualify(
                        "perform_" + perform_ref.replace("::", ".").replace(".", "_")
                    )
                    if perform_id not in state.elements:
                        el = SemanticElement(
                            id=perform_id,
                            kind=ArtifactKind.ACTION,
                            name=target,
                            parent_id=state.current_parent(),
                            type_ref=perform_ref,
                            file_id=file_id,
                            metadata_keywords=["perform"],
                        )
                        state.add_child(el.parent_id, perform_id)
                        state.elements[perform_id] = el
                        state.perform_lines[perform_id] = tok.line
                    continue
                step_id = ensure_flow_action(
                    target, type_ref=perform_ref, metadata_keywords=["perform"]
                )
                state.perform_lines.setdefault(step_id, tok.line)
                link_from_previous(target)
                continue

            if tok.kind == "ident" and tok.value == "case":
                # case def / case usage (not "use case")
                line = tok.line
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                short_id = read_short_id()
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {line}: case without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value == ":":
                    take()
                    type_ref = expect_qualified_name()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.CASE,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    short_id=short_id,
                    is_abstract=pending_abstract,
                    file_id=file_id,
                    is_definition=is_def,
                )
                pending_abstract = False
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                brace = peek()
                if brace and brace.value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id,
                            kind=ArtifactKind.CASE,
                            brace_depth=1,
                        )
                    )
                elif brace and brace.value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "expose":
                take()
                # expose Vehicle; or expose Pkg::Part; or expose Vehicle::*;
                ref = expect_qualified_name()
                if not ref:
                    state.warnings.append(f"line {tok.line}: expose without target")
                    skip_until_semicolon_or_brace()
                    continue
                # Wildcard suffix: `::*` (members), `::**` (recursive),
                # `::*::**` (recursive members). expect_qualified_name has
                # already taken the `::` before a `*`.
                suffix = ""
                while peek() and peek().value in {".", "::", "*"}:
                    suffix += take().value
                if suffix.startswith("*"):
                    suffix = "::" + suffix
                expose_kind = _EXPOSE_SUFFIX_KINDS.get(suffix)
                if expose_kind is None:
                    if suffix:
                        state.warnings.append(
                            f"line {tok.line}: unsupported expose suffix '{suffix}', "
                            "read as a plain expose"
                        )
                    expose_kind = EXPOSE_MEMBER
                if peek() and peek().value == "[":
                    state.warnings.append(
                        f"line {tok.line}: expose filter brackets [...] are not "
                        "supported and are ignored; use a filter statement"
                    )
                    depth = 0
                    while peek():
                        val = take().value
                        if val == "[":
                            depth += 1
                        elif val == "]":
                            depth -= 1
                            if depth <= 0:
                                break
                if peek() and peek().value == ";":
                    take()
                parent = state.current_parent()
                if parent and parent in state.elements:
                    view_el = state.elements[parent]
                    if view_el.kind == ArtifactKind.VIEW:
                        # Resolve relative to the view's enclosing package.
                        # In a project parse the target may sit in another
                        # file: keep a placeholder and resolve it at link time
                        # (a same-name match in this file would be a guess).
                        scope = view_el.parent_id
                        resolved = _resolve_expose_ref(
                            ref,
                            scope,
                            state.elements,
                            allow_leaf=not state.defer_link,
                        )
                        if resolved is None:
                            resolved = f"{scope}::{ref}" if scope else ref
                            if state.defer_link:
                                state.pending_exposes.append(
                                    (view_el.id, resolved, ref, scope)
                                )
                        if resolved:
                            seen = resolved in view_el.expose_refs
                            if not seen:
                                view_el.expose_refs.append(resolved)
                            set_expose_kind(
                                view_el.expose_kinds,
                                resolved,
                                expose_kind,
                                seen=seen,
                            )
                            # Primary root = first expose (unchanged on later exposes)
                            if not view_el.expose_ref:
                                view_el.expose_ref = resolved
                continue

            if tok.kind == "ident" and tok.value == "filter":
                line = tok.line
                take()
                parent = state.current_parent()
                view_el = (
                    state.elements.get(parent)
                    if parent and parent in state.elements
                    else None
                )
                if not view_el or view_el.kind != ArtifactKind.VIEW:
                    state.warnings.append(
                        f"line {line}: filter outside view definition"
                    )
                    skip_until_semicolon_or_brace()
                    continue

                parsed_filter = None
                # filter @A;  or  filter @A or @B or @C;
                if peek() and peek().value == "@":
                    take()
                    ref = expect_qualified_name()
                    refs: list[str] = [ref] if ref else []
                    while (
                        refs
                        and peek()
                        and peek().kind == "ident"
                        and peek().value == "or"
                    ):
                        take()  # or
                        if not (peek() and peek().value == "@"):
                            refs = []
                            break
                        take()
                        nxt = expect_qualified_name()
                        if not nxt:
                            refs = []
                            break
                        refs.append(nxt)
                    if refs and all(metaclass_to_kind(r) is not None for r in refs):
                        if len(refs) == 1:
                            parsed_filter = MetaclassFilter(refs[0])
                        else:
                            parsed_filter = MetaclassAnyFilter(tuple(refs))
                    else:
                        # Unknown @status / metadata annotations are not v1 metaclasses
                        parsed_filter = None
                        refs = []
                # filter name.startsWith("prefix");
                elif peek() and peek().kind == "ident" and peek().value == "name":
                    take()
                    if peek() and peek().value == ".":
                        take()
                    method = expect_ident()
                    if method == "startsWith" and peek() and peek().value == "(":
                        take()
                        prefix_tok = peek()
                        prefix: str | None = None
                        if prefix_tok and prefix_tok.kind == "string":
                            take()
                            prefix = _strip_quotes(prefix_tok.value)
                        if peek() and peek().value == ")":
                            take()
                        if prefix is not None:
                            parsed_filter = NameStartsWithFilter(prefix)

                # Accept only a complete statement ending at `;`.
                # Incomplete `or` chains / `not` / metadata ⇒ unsupported.
                if parsed_filter is not None and peek() and peek().value == ";":
                    take()
                    view_el.view_filters.append(parsed_filter.to_stored())
                else:
                    skip_until_semicolon_or_brace()
                    state.warnings.append(
                        f"line {line}: unsupported filter expression"
                    )
                continue

            if tok.kind == "ident" and tok.value == "attribute":
                line = tok.line
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {line}: attribute without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value in {":", ":>"}:
                    take()
                    type_ref = expect_ident()
                default_value = read_default_value()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.ATTRIBUTE,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    default_value=default_value,
                    file_id=file_id,
                    is_definition=is_def,
                )
                # Mark defs without type as attribute def via missing type_ref + is_def convention
                if is_def and type_ref is None:
                    pass
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == ";":
                    take()
                elif peek() and peek().value == "{":
                    skip_until_semicolon_or_brace()
                continue

            if tok.kind == "ident" and tok.value == "requirement":
                line = tok.line
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                short_id = read_short_id()
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {line}: requirement without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                # Usage typing `requirement x : SomeDef` (stereotype ignores typeRef)
                if peek() and peek().value == ":":
                    take()
                    if peek() and peek().value == "~":
                        take()
                    type_ref = expect_qualified_name()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.REQUIREMENT,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    short_id=short_id,
                    is_abstract=pending_abstract,
                    file_id=file_id,
                    is_definition=is_def,
                )
                pending_abstract = False
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                nxt = peek()
                if nxt and nxt.value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id,
                            kind=ArtifactKind.REQUIREMENT,
                            brace_depth=1,
                        )
                    )
                elif nxt and nxt.value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "doc":
                line = tok.line
                take()
                doc_text: str | None = None
                if peek() and peek().kind == "block_comment":
                    bc = take()
                    assert bc is not None
                    doc_text = _block_comment_text(bc.value)
                else:
                    state.warnings.append(
                        f"line {line}: doc without /* … */ body"
                    )
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()
                parent = state.current_parent()
                if parent and parent in state.elements and doc_text is not None:
                    state.elements[parent].documentation = doc_text
                continue

            # use case def / use case
            if tok.kind == "ident" and tok.value == "use":
                nxt = peek(1)
                if nxt and nxt.kind == "ident" and nxt.value == "case":
                    line = tok.line
                    take()  # use
                    take()  # case
                    is_def = False
                    if peek() and peek().value == "def":
                        take()
                        is_def = True
                    short_id = read_short_id()
                    name = expect_ident()
                    if not name:
                        state.warnings.append(f"line {line}: use case without name")
                        skip_until_semicolon_or_brace()
                        continue
                    type_ref = None
                    if peek() and peek().value == ":":
                        take()
                        if peek() and peek().value == "~":
                            take()
                        type_ref = expect_qualified_name()
                    element_id = state.qualify(name)
                    el = SemanticElement(
                        id=element_id,
                        kind=ArtifactKind.USE_CASE,
                        name=name,
                        parent_id=state.current_parent(),
                        type_ref=type_ref,
                        short_id=short_id,
                        is_abstract=pending_abstract,
                        file_id=file_id,
                        is_definition=is_def,
                    )
                    pending_abstract = False
                    state.add_child(el.parent_id, element_id)
                    state.elements[element_id] = el
                    brace = peek()
                    if brace and brace.value == "{":
                        take()
                        state.scopes.append(
                            _Scope(
                                element_id=element_id,
                                kind=ArtifactKind.USE_CASE,
                                brace_depth=1,
                            )
                        )
                    elif brace and brace.value == ";":
                        take()
                    continue
                # bare "use" without "case" — fall through

            if tok.kind == "ident" and tok.value == "actor":
                line = tok.line
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {line}: actor without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value == ":":
                    take()
                    type_ref = expect_qualified_name()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.ACTOR,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                    is_definition=is_def,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == ";":
                    take()
                elif peek() and peek().value == "{":
                    skip_until_semicolon_or_brace()
                continue

            if tok.kind == "ident" and tok.value == "include":
                line = tok.line
                take()
                # include use case X;
                if peek() and peek().value == "use":
                    take()
                    if peek() and peek().value == "case":
                        take()
                target_ref = expect_qualified_name()
                if not target_ref:
                    state.warnings.append(f"line {line}: include without target")
                    skip_until_semicolon_or_brace()
                    continue
                parent = state.current_parent()
                name = f"include_{target_ref.split('::')[-1]}"
                element_id = state.qualify(name) if parent else name
                suffix = 2
                while element_id in state.elements:
                    name = f"include_{target_ref.split('::')[-1]}_{suffix}"
                    element_id = state.qualify(name) if parent else name
                    suffix += 1
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.INCLUDE,
                    name=name,
                    parent_id=parent,
                    source_id=parent,
                    target_id=_legacy_ref(target_ref, parent),
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
                add_pending(element_id, "target", target_ref, line, "include")
                if peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "objective":
                line = tok.line
                take()
                # objective { doc /* ... */ } — attach text to owning case/use case
                if peek() and peek().value == "{":
                    take()
                    doc_text: str | None = None
                    depth = 1
                    while i < n and depth > 0:
                        t = take()
                        if not t:
                            break
                        if t.value == "{":
                            depth += 1
                        elif t.value == "}":
                            depth -= 1
                        elif t.kind == "ident" and t.value == "doc":
                            if peek() and peek().kind == "block_comment":
                                c = take()
                                if c:
                                    doc_text = _block_comment_text(c.value)
                        elif t.kind == "block_comment" and doc_text is None:
                            doc_text = _block_comment_text(t.value)
                    parent = state.current_parent()
                    if parent and parent in state.elements and doc_text:
                        existing = state.elements[parent].documentation
                        state.elements[parent].documentation = (
                            f"{existing}\n{doc_text}" if existing else doc_text
                        )
                    continue
                target_ref = expect_qualified_name()
                if not target_ref:
                    skip_until_semicolon_or_brace()
                    continue
                parent = state.current_parent()
                name = f"objective_{len([e for e in state.elements.values() if e.kind == ArtifactKind.DEPENDENCY and 'objective' in (e.metadata_keywords or [])]) + 1}"
                element_id = state.qualify(name) if parent else name
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.DEPENDENCY,
                    name=name,
                    parent_id=parent,
                    source_id=parent,
                    target_id=_legacy_ref(target_ref, parent),
                    metadata_keywords=["objective"],
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
                add_pending(element_id, "target", target_ref, line, "dependency")
                if peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "subject":
                line = tok.line
                take()
                name = expect_ident() or "subject"
                type_ref = None
                if peek() and peek().value == ":":
                    take()
                    type_ref = expect_qualified_name()
                element_id = state.qualify(name)
                # subject stored as attribute-like part reference for layout
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.PART,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    metadata_keywords=["subject"],
                    file_id=file_id,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "interface":
                line = tok.line
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {line}: interface without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value == ":":
                    take()
                    type_ref = expect_qualified_name()
                # Usage: interface x:Itf connect A to B;
                if peek() and peek().value == "connect":
                    take()
                    source_ref = read_endpoint()
                    if not (peek() and peek().value == "to"):
                        state.warnings.append(
                            f"line {line}: interface usage missing 'to'"
                        )
                        skip_until_semicolon_or_brace()
                        continue
                    take()  # to
                    target_ref = read_endpoint()
                    if not source_ref or not target_ref:
                        state.warnings.append(
                            f"line {line}: interface usage missing endpoints"
                        )
                        skip_until_semicolon_or_brace()
                        continue
                    if peek() and peek().value == ";":
                        take()
                    element_id = state.qualify(name)
                    add_pending(element_id, "source", source_ref, line, "interface")
                    add_pending(element_id, "target", target_ref, line, "interface")
                    el = SemanticElement(
                        id=element_id,
                        kind=ArtifactKind.INTERFACE,
                        name=name,
                        parent_id=state.current_parent(),
                        type_ref=type_ref,
                        source_id=_legacy_ref(source_ref, state.current_parent()),
                        target_id=_legacy_ref(target_ref, state.current_parent()),
                        file_id=file_id,
                    )
                    state.add_child(el.parent_id, element_id)
                    state.elements[element_id] = el
                    continue
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.INTERFACE,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                    is_definition=is_def,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == "{":
                    take()
                    state.scopes.append(
                        _Scope(
                            element_id=element_id,
                            kind=ArtifactKind.INTERFACE,
                            brace_depth=1,
                        )
                    )
                elif peek() and peek().value == ";":
                    take()
                continue

            if tok.kind == "ident" and tok.value == "satisfy":
                # satisfy R by P;
                line = tok.line
                take()
                req_ref = expect_qualified_name()
                by_tok = peek()
                if by_tok and by_tok.value == "by":
                    take()
                part_ref = expect_qualified_name()
                if not req_ref or not part_ref:
                    state.warnings.append(f"line {line}: satisfy without endpoints")
                    skip_until_semicolon_or_brace()
                    continue
                parent = state.current_parent()
                name = f"satisfy_{len([e for e in state.elements.values() if e.kind == ArtifactKind.SATISFY]) + 1}"
                element_id = f"{parent}::{name}" if parent else name
                add_pending(element_id, "source", part_ref, line, "satisfy")
                add_pending(element_id, "target", req_ref, line, "satisfy")
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.SATISFY,
                    name=name,
                    parent_id=parent,
                    source_id=_legacy_ref(part_ref, parent),
                    target_id=_legacy_ref(req_ref, parent),
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
                if peek() and peek().value == ";":
                    take()
                continue

            def read_import_path() -> str | None:
                parts: list[str] = []
                while peek():
                    t = peek()
                    if not t:
                        break
                    if t.kind == "ident" or t.value == "*":
                        parts.append(t.value)
                        take()
                    elif t.value == "::":
                        parts.append("::")
                        take()
                    elif t.value == ".":
                        parts.append("::")
                        take()
                    else:
                        break
                text = "".join(parts).strip()
                return text or None

            # private/public import Library::*;
            if tok.kind == "ident" and tok.value in {"private", "public"}:
                if peek(1) and peek(1).value == "import":
                    visibility = tok.value
                    line = tok.line
                    take()  # visibility
                    take()  # import
                    path = read_import_path()
                    if peek() and peek().value == ";":
                        take()
                    if path:
                        state.imports.append(
                            _ImportDecl(
                                file_id=file_id,
                                visibility=visibility,
                                path=path,
                                line=line,
                                owner_id=state.current_parent(),
                            )
                        )
                    else:
                        state.warnings.append(f"line {line}: import without path")
                    continue

            # Bare import Package::*;
            if tok.kind == "ident" and tok.value == "import":
                line = tok.line
                take()
                path = read_import_path()
                if peek() and peek().value == ";":
                    take()
                if path:
                    state.imports.append(
                        _ImportDecl(
                            file_id=file_id,
                            visibility="public",
                            path=path,
                            line=line,
                            owner_id=state.current_parent(),
                        )
                    )
                else:
                    state.warnings.append(f"line {line}: import without path")
                continue

            # Unknown token — skip identifier statements with warning for keyword-like
            if tok.kind == "ident":
                ident = tok.value
                # Known ignored keywords
                ignored = {
                    "item",
                    "private",
                    "public",
                    "alias",
                    "calc",
                    "assert",
                    "render",
                }
                take()
                if ident in ignored:
                    state.warnings.append(
                        f"line {tok.line}: '{ident}' ignored in alpha subset"
                    )
                skip_until_semicolon_or_brace()
                continue
            # Skip stray punctuation
            take()

        if isinstance(state.elements, _TrackedElements):
            state.element_lines = state.elements.lines
        if not state.defer_link:
            self._link_references(state)
            state.warnings.extend(text for _, text in state.ref_warnings)
            seen_warnings = len(state.ref_warnings)
            self._link_occurrences(state)
            state.warnings.extend(
                text for _, text in state.ref_warnings[seen_warnings:]
            )
            self._inherit_features_onto_usages(state)
            state.warnings.extend(text for _, text in state.type_warnings)
            self._warn_unresolved_type_refs(state)
            self._link_performs(state)
        return state

    @staticmethod
    def _resolver(state: _ParserState) -> NameResolver:
        return NameResolver(
            state.elements,
            [
                ImportSpec(
                    owner_id=imp.owner_id,
                    file_id=imp.file_id,
                    path=imp.path,
                    visibility=imp.visibility,
                    line=imp.line,
                )
                for imp in state.imports
            ],
        )

    def _link_occurrences(self, state: _ParserState) -> None:
        """Link what an occurrence def says: feature chains, message ends and types.

        Runs after `_link_references` and before inheritance, which skips the
        parts of an occurrence. A model without an occurrence def is untouched.
        """
        elements = state.elements
        if not any(el.kind == ArtifactKind.OCCURRENCE for el in elements.values()):
            return
        resolver = self._resolver(state)
        # Feature lookups follow types, so resolve those first (inheritance
        # resolves them again for everything it copies).
        for el in list(elements.values()):
            if el.kind == ArtifactKind.PART and el.type_ref and not el.type_target_id:
                type_def, _ = resolver.resolve_type_def(el)
                el.type_target_id = type_def.id if type_def else None
        index = FeatureIndex(elements)
        # `ref part keyFob :> car.keyFob;` points at the last real feature
        # (`Pkg::Car::keyFob`), not at a copy of it under `car`.
        for el in list(elements.values()):
            if (
                el.kind in (ArtifactKind.SUBSETTING, ArtifactKind.REDEFINITION)
                and el.type_ref
                and "." in el.type_ref
                and el.target_id not in elements
                and in_occurrence(elements, el.id)
                and self._under_occurrence_part(elements, el.target_id)
            ):
                end = index.chain_end(
                    resolver, el.type_ref, el.parent_id, el.file_id or state.file_id
                )
                if end is not None:
                    el.target_id = end
        for pending in state.pending_message_ends:
            msg = elements.get(pending.message_id)
            if (
                msg is None
                or msg.kind != ArtifactKind.MESSAGE
                or msg.file_id != pending.file_id
            ):
                continue
            end = resolve_message_end(
                elements,
                pending.occurrence_id,
                pending.path,
                message_name=msg.name,
                quiet_if_foreign=not state.is_project,
                index=index,
            )
            for new_id, original_id in end.materialize:
                self._materialize_feature(state, index, new_id, original_id, msg.file_id)
            if pending.role == "source":
                msg.source_id, msg.source_event_id = end.part_id, end.event_id
            else:
                msg.target_id, msg.target_event_id = end.part_id, end.event_id
            if end.warning:
                state.ref_warnings.append(
                    (pending.file_id, f"line {pending.line}: {end.warning}")
                )
        # Payload (`of T`) and event types may be any kind of definition.
        specialized = specialized_def_ids(elements)
        for el in elements.values():
            if not el.type_ref or el.type_target_id:
                continue
            if el.kind == ArtifactKind.EVENT_OCCURRENCE or (
                el.kind == ArtifactKind.MESSAGE and in_occurrence(elements, el.id)
            ):
                res = resolver.resolve_name(
                    el.type_ref, el.parent_id, el.file_id or state.file_id
                )
                target = elements.get(res.element_id) if res.element_id else None
                if target is None:
                    continue
                if target.is_definition or target.id in specialized:
                    el.type_target_id = target.id
                else:
                    line = state.element_lines.get(el.id)
                    prefix = f"line {line}: " if line is not None else ""
                    what = "payload type" if el.kind == ArtifactKind.MESSAGE else "type"
                    state.ref_warnings.append(
                        (
                            el.file_id or state.file_id,
                            f"{prefix}{el.kind.value} '{el.name}' {what} "
                            f"'{el.type_ref}' is not a definition",
                        )
                    )

    @staticmethod
    def _under_occurrence_part(elements: dict[str, SemanticElement], target_id: str) -> bool:
        """Does the missing `target_id` lie under a part of an occurrence? Those get
        no inherited copies; under any other part the copy is made later."""
        owner = target_id.rsplit("::", 1)[0] if "::" in target_id else ""
        while owner and owner not in elements:
            owner = owner.rsplit("::", 1)[0] if "::" in owner else ""
        return bool(owner) and in_occurrence(elements, owner)

    @staticmethod
    def _materialize_feature(
        state: _ParserState,
        index: FeatureIndex,
        new_id: str,
        original_id: str,
        file_id: str | None,
    ) -> None:
        """Create `<part>::<feature>` for a feature a message end passes through.

        It stands for the original feature in this instance, so it carries the
        original's type and a redefinition back to it.
        """
        original = state.elements[original_id]
        parent_id, name = new_id.rsplit("::", 1)
        part = SemanticElement(
            id=new_id,
            kind=ArtifactKind.PART,
            name=name,
            parent_id=parent_id,
            type_ref=original.type_ref,
            type_target_id=original.type_target_id,
            is_reference=original.is_reference,
            multiplicity=original.multiplicity,
            file_id=file_id,
        )
        state.elements[new_id] = part
        state.materialized_ids.add(new_id)
        state.add_child(parent_id, new_id)
        rel_name = f"{name}_redefines_{_ref_name(original_id)}"
        rel = SemanticElement(
            id=f"{parent_id}::{rel_name}",
            kind=ArtifactKind.REDEFINITION,
            name=rel_name,
            parent_id=parent_id,
            source_id=new_id,
            target_id=original_id,
            file_id=file_id,
            # Marks the part as made by the parser: the serializer leaves it out.
            metadata_keywords=[MATERIALIZED],
        )
        state.elements[rel.id] = rel
        state.add_child(parent_id, rel.id)
        index.register(rel)

    def _apply_import_visibility(self, state: _ParserState) -> None:
        """
        Validates imports and warns about paths that name nothing (loosely, by name).
        Imports are *used* for resolution by `domain.name_resolution.NameResolver`
        (relationship ends, see `_link_references`) and `resolve_perform_target`.
        Part type references (`: T`) go through `NameResolver.resolve_type_def`.
        """
        # Build simple-name → element index for imported symbols
        # (Used by inheritance which already matches by name; this validates imports.)
        for imp in state.imports:
            path = imp.path.replace(".", "::")
            if path.endswith("::*"):
                pkg = path[:-3]
                pkg_el = state.elements.get(pkg)
                if not pkg_el:
                    # Try match by package name
                    matches = [
                        e
                        for e in state.elements.values()
                        if e.kind == ArtifactKind.PACKAGE and e.name == pkg.split("::")[-1]
                    ]
                    if not matches:
                        self._import_warning(
                            state, imp, f"line {imp.line}: import '{imp.path}' — package not found"
                        )
                    continue
                # Wildcard import succeeds if package exists
                continue
            # Specific import Pkg::Name or Name
            if path in state.elements:
                continue
            simple = path.split("::")[-1]
            if any(e.name == simple for e in state.elements.values()):
                continue
            self._import_warning(state, imp, f"line {imp.line}: import '{imp.path}' — symbol not found")

    @staticmethod
    def _import_warning(state: _ParserState, imp: _ImportDecl, text: str) -> None:
        """In a project parse, file the warning under the file that holds the import."""
        if state.is_project:
            state.import_warnings.append((imp.file_id, text))
        else:
            state.warnings.append(text)

    def _warn_unresolved_type_refs(self, state: _ParserState) -> None:
        """Flag type references that do not match any element name in the graph.

        Perform references are paths, checked by `_link_performs`.
        """
        known_library = {
            "GeneralView",
            "SequenceView",
            "StateTransitionView",
            "ActionFlowView",
            "TreeView",
            "InterconnectionView",
            "AllocationView",
            "GridView",
            "UseCaseView",
            "Interaction",
            "start",
            "done",
            "decision",
            "condition",
            "decide",
        }
        names = {el.name for el in state.elements.values()} | known_library
        for el in state.elements.values():
            if not state.is_project and el.type_ref and self._may_live_elsewhere(
                state, el.type_ref, names
            ):
                continue
            if (
                not el.type_ref
                or el.kind in _LOCAL_RELATION_KINDS  # type_ref: the chain as written
                or el.id in state.materialized_ids
                or el.type_target_id
                or el.type_ref in names
                or el.id in state.type_warned
            ):
                continue
            if el.kind == ArtifactKind.ACTION and "perform" in el.metadata_keywords:
                continue
            state.warnings.append(
                f"Type reference '{el.type_ref}' for '{el.name}' could not be resolved "
                f"in the semantic graph."
            )

    @staticmethod
    def _may_live_elsewhere(state: _ParserState, type_ref: str, names: set[str]) -> bool:
        """In a one-file parse: could another file declare this type?

        True for a qualified name whose head this file does not declare, and for
        any name when the file imports something. The project parse decides.
        """
        if state.imports:
            return True
        return "::" in type_ref and type_ref.split("::")[0] not in names

    def _link_references(self, state: _ParserState) -> None:
        """Resolve pending relationship ends with namespace and import rules.

        Runs once every file is merged and before inheritance, because copying
        relations onto usages needs the definitions' ends to be resolved.
        An end that does not resolve keeps the legacy value (the reference as
        written, qualified by its scope); it never points at another element.
        """
        if not state.pending_refs:
            return
        specs = [
            ImportSpec(
                owner_id=imp.owner_id,
                file_id=imp.file_id,
                path=imp.path,
                visibility=imp.visibility,
                line=imp.line,
            )
            for imp in state.imports
        ]
        resolver = NameResolver(state.elements, specs)
        for pending in state.pending_refs:
            el = state.elements.get(pending.element_id)
            if el is None or el.file_id != pending.file_id:
                # The element that won the merge came from another file; its
                # ends are not ours to write.
                pending.skipped = True
                continue
            # `:>` / `:>>`: the declaration itself is never its own target.
            res = resolver.resolve_feature_ref(
                pending.ref,
                pending.scope_id,
                pending.file_id,
                exclude=el.source_id if el.kind in _LOCAL_RELATION_KINDS else None,
            )
            if res.element_id is not None:
                value = res.element_id
                pending.resolved_id = res.element_id
            else:
                value = _legacy_ref(pending.ref, pending.scope_id)
                if value in state.elements:
                    # Never let an unresolved end land on a real element (a
                    # perform stub, or an element the rules do not reach).
                    written = pending.ref.replace(".", "::")
                    scope = pending.scope_id
                    value = _free_id(
                        [f"{scope}::{written}" if scope else written, f"?{written}"],
                        state.elements,
                    )
                if res.candidates:
                    pending.ambiguous = True
                    listed = ", ".join(
                        f"{cid} (import line {cline})" for cid, cline in res.candidates
                    )
                    state.ref_warnings.append(
                        (
                            pending.file_id,
                            f"line {pending.line}: {pending.label} {pending.role} "
                            f"'{pending.ref}' is ambiguous: {listed} (in '{el.id}')",
                        )
                    )
            if pending.role == "source":
                el.source_id = value
            else:
                el.target_id = value

    def _warn_unresolved_references(self, state: _ParserState) -> None:
        """Flag relationship ends that name no element once everything is linked.

        Only meaningful after all files are merged and inheritance has run
        (parse_project): a single file may point into another file, and an end
        into an inherited feature exists only after inheritance.
        """
        for pending in state.pending_refs:
            if pending.skipped or pending.ambiguous or pending.label in _SILENT_WHEN_UNRESOLVED:
                continue
            el = state.elements.get(pending.element_id)
            if el is None:
                continue
            if pending.resolved_id is not None and pending.resolved_id in state.elements:
                continue
            state.ref_warnings.append(
                (
                    pending.file_id,
                    f"line {pending.line}: {pending.label} {pending.role} "
                    f"not found: {pending.ref} (in '{el.id}')",
                )
            )

    def _link_performs(self, state: _ParserState) -> None:
        """Resolve each `perform <ref>;` and store its target, or warn.

        The reference is resolved from its owner with `NameResolver`. When the path does not resolve but its last segment names
        some element, it is left unresolved without a warning (the name check
        used before paths were followed).
        """
        from domain.perform import is_perform

        resolver = NameResolver(
            state.elements,
            [
                ImportSpec(
                    owner_id=imp.owner_id,
                    file_id=imp.file_id,
                    path=imp.path,
                    visibility=imp.visibility,
                    line=imp.line,
                )
                for imp in state.imports
            ],
        )
        names = {
            el.name
            for el in state.elements.values()
            if not (el.kind == ArtifactKind.ACTION and "perform" in el.metadata_keywords)
        }
        for el in sorted(state.elements.values(), key=lambda e: e.id):
            if not is_perform(el):
                continue
            target = resolve_perform_target(state.elements, el, resolver)
            el.perform_target_id = target
            if target is not None or ref_leaf(el.type_ref or "") in names:
                continue
            line = state.perform_lines.get(el.id)
            prefix = f"line {line}: " if line is not None else ""
            state.warnings.append(
                f"{prefix}perform target not found: {el.type_ref} (in '{el.parent_id}')"
            )

    def _inherit_features_onto_usages(self, state: _ParserState) -> None:
        """Copy ports, attributes, nested parts, and relations from defs onto usages."""
        name_resolver = NameResolver(
            state.elements,
            [
                ImportSpec(
                    owner_id=imp.owner_id,
                    file_id=imp.file_id,
                    path=imp.path,
                    visibility=imp.visibility,
                    line=imp.line,
                )
                for imp in state.imports
            ],
        )
        # Resolve every declared `: T` once, before anything is copied. A copy
        # carries its original's `type_target_id`, because its type reference is
        # written in the original's namespace, not where the copy ends up.
        defs_named: dict[tuple[ArtifactKind, str], list[str]] = {}
        specialized = specialized_def_ids(state.elements)
        for cand in state.elements.values():
            if cand.is_definition or cand.id in specialized:
                defs_named.setdefault((cand.kind, cand.name), []).append(cand.id)
        for el in list(state.elements.values()):
            if not el.type_ref or el.kind in _LOCAL_RELATION_KINDS:
                continue
            if el.id in state.materialized_ids or (
                el.type_target_id
                and el.kind in (ArtifactKind.MESSAGE, ArtifactKind.EVENT_OCCURRENCE)
            ):
                continue  # linked by `_link_occurrences`; the type is the original's
            type_def, res = name_resolver.resolve_type_def(el)
            el.type_target_id = type_def.id if type_def else None
            if type_def is not None or is_perform_stub(el):
                continue
            line = state.element_lines.get(el.id)
            prefix = f"line {line}: " if line is not None else ""
            fid = el.file_id or state.file_id
            if res.candidates:
                state.type_warned.add(el.id)
                listed = ", ".join(
                    f"{cid} (import line {cline})" for cid, cline in res.candidates
                )
                state.type_warnings.append(
                    (
                        fid,
                        f"{prefix}type reference '{el.type_ref}' is ambiguous: "
                        f"{listed} (in '{el.id}')",
                    )
                )
                continue
            leaf = el.type_ref.split("::")[-1]
            elsewhere = [d for d in defs_named.get((el.kind, leaf), []) if d != el.id]
            if elsewhere and state.is_project and "::" not in el.type_ref:
                state.type_warned.add(el.id)
                shown = ", ".join(sorted(elsewhere)[:3])
                verb = "exists" if len(elsewhere) == 1 else "exist"
                state.type_warnings.append(
                    (
                        fid,
                        f"{prefix}type '{el.type_ref}' is not visible from '{el.id}' "
                        f"({shown} {verb}; add an import or qualify the name)",
                    )
                )

        def resolve_type_def(el: SemanticElement) -> SemanticElement | None:
            return state.elements.get(el.type_target_id) if el.type_target_id else None

        def resolve_port_def(type_ref: str | None) -> SemanticElement | None:
            """Resolve a port definition by type ref (package-level `port def` preferred)."""
            if not type_ref:
                return None
            direct = state.elements.get(type_ref)
            if direct and direct.kind == ArtifactKind.PORT and direct.type_ref is None:
                parent = state.elements.get(direct.parent_id) if direct.parent_id else None
                if parent is None or parent.kind == ArtifactKind.PACKAGE:
                    return direct
            simple = type_ref.split("::")[-1]
            candidates = [
                el
                for el in state.elements.values()
                if el.kind == ArtifactKind.PORT and el.name == simple and el.type_ref is None
            ]
            for el in candidates:
                parent = state.elements.get(el.parent_id) if el.parent_id else None
                if parent is not None and parent.kind == ArtifactKind.PACKAGE:
                    return el
            for el in candidates:
                parent = state.elements.get(el.parent_id) if el.parent_id else None
                # Nested ports under a port def are usages, not defs — skip those.
                if parent is not None and parent.kind == ArtifactKind.PORT:
                    continue
                return el
            return None

        def copy_port(usage: SemanticElement, child: SemanticElement) -> None:
            usage_child_id = f"{usage.id}::{child.name}"
            if usage_child_id in state.elements:
                return
            port = SemanticElement(
                id=usage_child_id,
                kind=ArtifactKind.PORT,
                name=child.name,
                parent_id=usage.id,
                type_ref=child.type_ref,
                type_target_id=child.type_target_id,
                default_value=child.default_value,
                file_id=usage.file_id or state.file_id,
            )
            state.elements[usage_child_id] = port
            state.add_child(usage.id, usage_child_id)

        def expand_port_usage(
            port_usage: SemanticElement, branch: list[str] | None = None
        ) -> None:
            """Copy nested ports from a port def onto a typed port usage."""
            if port_usage.kind != ArtifactKind.PORT or not port_usage.type_ref:
                return
            port_def = resolve_port_def(port_usage.type_ref)
            if not port_def:
                return
            if branch is None:
                branch = []
            if port_def.id in branch:
                return
            branch.append(port_def.id)
            try:
                for child_id in list(port_def.children):
                    child = state.elements.get(child_id)
                    if not child or child.kind != ArtifactKind.PORT:
                        continue
                    copy_port(port_usage, child)
                    nested = state.elements.get(f"{port_usage.id}::{child.name}")
                    if nested:
                        expand_port_usage(nested, branch)
            finally:
                branch.pop()

        def copy_attribute(usage: SemanticElement, child: SemanticElement) -> None:
            usage_child_id = f"{usage.id}::{child.name}"
            if usage_child_id in state.elements:
                return
            attr = SemanticElement(
                id=usage_child_id,
                kind=ArtifactKind.ATTRIBUTE,
                name=child.name,
                parent_id=usage.id,
                type_ref=child.type_ref,
                type_target_id=child.type_target_id,
                default_value=child.default_value,
                file_id=usage.file_id or state.file_id,
            )
            state.elements[usage_child_id] = attr
            state.add_child(usage.id, usage_child_id)

        def copy_nested_part(usage: SemanticElement, child: SemanticElement) -> SemanticElement:
            usage_child_id = f"{usage.id}::{child.name}"
            existing = state.elements.get(usage_child_id)
            if existing:
                return existing
            nested = SemanticElement(
                id=usage_child_id,
                kind=ArtifactKind.PART,
                name=child.name,
                parent_id=usage.id,
                type_ref=child.type_ref,
                type_target_id=child.type_target_id,
                multiplicity=child.multiplicity,
                file_id=usage.file_id or state.file_id,
            )
            state.elements[usage_child_id] = nested
            state.add_child(usage.id, usage_child_id)
            return nested

        _INHERITABLE_RELATIONS = {
            ArtifactKind.CONNECTION,
            ArtifactKind.BINDING,
            ArtifactKind.FLOW,
            ArtifactKind.INTERFACE,
        }

        def _retarget_endpoint(
            endpoint: str | None, type_def_id: str, usage_id: str
        ) -> str | None:
            if not endpoint:
                return None
            prefix = type_def_id + "::"
            if not endpoint.startswith(prefix) and endpoint != type_def_id:
                return None
            if endpoint == type_def_id:
                return usage_id
            return usage_id + endpoint[len(type_def_id) :]

        def copy_relation(
            usage: SemanticElement,
            type_def: SemanticElement,
            child: SemanticElement,
        ) -> None:
            """Copy a connection/interface/binding/flow onto a usage with retargeted ends."""
            if child.kind not in _INHERITABLE_RELATIONS:
                return
            # Interface defs (no ends) are not diagram edges — skip.
            if not child.source_id or not child.target_id:
                return
            usage_child_id = f"{usage.id}::{child.name}"
            if usage_child_id in state.elements:
                return
            new_source = _retarget_endpoint(child.source_id, type_def.id, usage.id)
            new_target = _retarget_endpoint(child.target_id, type_def.id, usage.id)
            # Skip when either end lies outside the general part, or the
            # retargeted ports were not copied onto this usage (external /
            # unresolved ends).
            if new_source is None or new_target is None:
                return
            if new_source not in state.elements or new_target not in state.elements:
                return
            rel = SemanticElement(
                id=usage_child_id,
                kind=child.kind,
                name=child.name,
                parent_id=usage.id,
                type_ref=child.type_ref,
                type_target_id=child.type_target_id,
                source_id=new_source,
                target_id=new_target,
                file_id=usage.file_id or state.file_id,
            )
            state.elements[usage_child_id] = rel
            state.add_child(usage.id, usage_child_id)

        def inherit_from_def(
            usage: SemanticElement,
            type_def: SemanticElement,
            branch: list[str] | None = None,
        ) -> None:
            # Per-branch stack: siblings of the same type each expand, but a
            # type already on this path (recursive nesting) still stops.
            if branch is None:
                branch = []
            if type_def.id in branch:
                return
            branch.append(type_def.id)
            try:
                # Features first so nested ports exist before relation ends are rewritten.
                for child_id in list(type_def.children):
                    child = state.elements.get(child_id)
                    if not child:
                        continue
                    if child.kind == ArtifactKind.PORT:
                        copy_port(usage, child)
                        # Expand hierarchical port types before copying binds/
                        # connections that target nested leaves.
                        copied = state.elements.get(f"{usage.id}::{child.name}")
                        if copied:
                            expand_port_usage(copied)
                    elif child.kind == ArtifactKind.ATTRIBUTE:
                        copy_attribute(usage, child)
                    elif child.kind == ArtifactKind.PART:
                        nested = copy_nested_part(usage, child)
                        nested_def = resolve_type_def(nested)
                        if nested_def:
                            inherit_from_def(nested, nested_def, branch)
                for child_id in list(type_def.children):
                    child = state.elements.get(child_id)
                    if not child:
                        continue
                    if child.kind in _INHERITABLE_RELATIONS:
                        copy_relation(usage, type_def, child)
            finally:
                branch.pop()

        def recursive_seed_branch(
            usage: SemanticElement, type_def: SemanticElement
        ) -> list[str]:
            """Seed branch when an ancestor is already typed as type_def (nested recursion)."""
            parent_id = usage.parent_id
            while parent_id:
                parent = state.elements.get(parent_id)
                if not parent:
                    break
                if parent.kind == ArtifactKind.PART:
                    parent_def = resolve_type_def(parent)
                    if parent_def and parent_def.id == type_def.id:
                        return [type_def.id]
                parent_id = parent.parent_id
            return []

        # Fixpoint: specialized defs may gain copied relations in an earlier
        # pass that later usages need. Re-expand a usage only when its type
        # def has gained children since the last expansion.
        # Port usages typed by a port def gain nested ports the same way.
        occurrence_ids = {
            el.id for el in state.elements.values() if el.kind == ArtifactKind.OCCURRENCE
        }
        expanded_child_count: dict[str, int] = {}
        expanded_port_child_count: dict[str, int] = {}
        for _ in range(32):
            before = len(state.elements)
            for port_usage in list(state.elements.values()):
                if port_usage.kind != ArtifactKind.PORT or not port_usage.type_ref:
                    continue
                port_def = resolve_port_def(port_usage.type_ref)
                if not port_def:
                    continue
                child_count = len(port_def.children)
                if expanded_port_child_count.get(port_usage.id) == child_count:
                    continue
                expand_port_usage(port_usage)
                expanded_port_child_count[port_usage.id] = child_count
            # The parts of an occurrence are instances of a scenario: they keep
            # their type and copy nothing of its subtree.
            usages = [
                el
                for el in list(state.elements.values())
                if el.kind == ArtifactKind.PART
                and el.type_ref
                and not (occurrence_ids and in_occurrence(state.elements, el.id))
            ]
            for usage in usages:
                type_def = resolve_type_def(usage)
                if not type_def:
                    continue
                child_count = len(type_def.children)
                if expanded_child_count.get(usage.id) == child_count:
                    continue
                inherit_from_def(
                    usage, type_def, recursive_seed_branch(usage, type_def)
                )
                expanded_child_count[usage.id] = child_count
            if len(state.elements) == before:
                break
