"""Tolerant SysML v2 textual subset parser for package/part/port/connection/requirement."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from domain.models import ArtifactKind, SemanticElement
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


@dataclass
class _ParserState:
    elements: dict[str, SemanticElement] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    scopes: list[_Scope] = field(default_factory=list)
    file_id: str = ""
    anon_conn: int = 0
    anon_message: int = 0
    anon_transition: int = 0
    anon_succession: int = 0
    anon_dependency: int = 0
    anon_allocation: int = 0
    anon_binding: int = 0
    anon_flow: int = 0
    imports: list[_ImportDecl] = field(default_factory=list)
    # When True, skip inheritance/type-warn (deferred to project link pass)
    defer_link: bool = False

    def current_parent(self) -> str | None:
        for scope in reversed(self.scopes):
            if scope.element_id:
                return scope.element_id
        return None

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
            elements=state.elements,
            warnings=state.warnings,
            file_warnings={file_id: list(state.warnings)},
            imports=[
                {
                    "fileId": imp.file_id,
                    "visibility": imp.visibility,
                    "path": imp.path,
                    "line": imp.line,
                }
                for imp in state.imports
            ],
        )

    def parse_project(self, files: list) -> ParseResult:
        """Parse all project files, then link imports / inheritance / type refs."""
        from domain.models import SysmlFile

        merged: dict[str, SemanticElement] = {}
        all_imports: list[_ImportDecl] = []
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
            for eid, element in state.elements.items():
                merged[eid] = element

        link_state = _ParserState(elements=merged, file_id="")
        link_state.imports = all_imports
        self._apply_import_visibility(link_state)
        self._inherit_features_onto_usages(link_state)
        self._warn_unresolved_type_refs(link_state)
        self._warn_unresolved_endpoints(link_state)
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
                }
                for imp in all_imports
            ],
        )

    def _parse_declarations(
        self, content: str, file_id: str, *, defer_link: bool
    ) -> _ParserState:
        state = _ParserState(file_id=file_id, defer_link=defer_link)
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
            nonlocal i
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

        def resolve_ref(ref: str) -> str:
            """Resolve relative, dotted, or qualified names against current scope."""
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
            # Prefer package-scoped name when element exists at root of nesting
            for el in state.elements.values():
                if el.name == ref and "::" in el.id:
                    # unique by simple name?
                    matches = [e.id for e in state.elements.values() if e.name == ref]
                    if len(matches) == 1:
                        return matches[0]
            return f"{parent}::{ref.replace('.', '::')}"

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
                return resolve_ref(name)

            if not succ_name:
                state.anon_succession += 1
                succ_name = f"succ{state.anon_succession}"
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
        ) -> None:
            source_id = resolve_ref(source_ref)
            target_id = resolve_ref(target_ref)
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
            state.add_child(el.parent_id, element_id)
            state.elements[element_id] = el

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

        def parse_message_statement(
            line: int, metadata_keywords: list[str]
        ) -> None:
            """Parse `[payload] from A to B;` after the `message` keyword.

            Shared by `message …`, `then message …` and `#reply message …`.
            """
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
                return resolve_ref(name)

            state.anon_message += 1
            msg_name = f"msg{state.anon_message}"
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

        while i < n:
            tok = peek()
            if not tok:
                break

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
                if not name:
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
                    subset_target = expect_qualified_name()
                if peek() and peek().value == "subsets":
                    take()
                    subset_target = expect_qualified_name()
                elif peek() and peek().value == "redefines":
                    take()
                    redefine_target = expect_qualified_name()
                elif peek() and peek().value == ":>>":
                    take()
                    redefine_target = expect_qualified_name()
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
                    metadata_keywords=list(pending_metadata_keywords),
                    file_id=file_id,
                )
                pending_metadata_keywords = []
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
                        name=f"{name}_subsets_{subset_target.replace('::', '_')}",
                        counter_attr="anon_dependency",
                        default_prefix="subset",
                    )
                if redefine_target:
                    add_relationship(
                        ArtifactKind.REDEFINITION,
                        name,
                        redefine_target,
                        tok.line,
                        name=f"{name}_redefines_{redefine_target.replace('::', '_')}",
                        counter_attr="anon_dependency",
                        default_prefix="redef",
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
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
                # Alpha: record port def name; skip feature body if present
                if is_def and peek() and peek().value == "{":
                    depth = 0
                    while i < n:
                        t = take()
                        if not t:
                            break
                        if t.value == "{":
                            depth += 1
                        elif t.value == "}":
                            depth -= 1
                            if depth <= 0:
                                break
                elif peek() and peek().value == ";":
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
                source_id = resolve_ref(source_ref)
                target_id = resolve_ref(target_ref)
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
                if peek() and peek().value == "def":
                    take()
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: view without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                if peek() and peek().value in {":", ":>"}:
                    take()
                    type_ref = expect_ident()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.VIEW,
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
                        _Scope(element_id=element_id, kind=ArtifactKind.VIEW, brace_depth=1)
                    )
                continue

            if tok.kind == "ident" and tok.value == "interaction":
                take()
                if peek() and peek().value == "def":
                    take()
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
                    state.anon_transition += 1
                    trans_name = f"t{state.anon_transition}"
                parent = state.current_parent()

                def resolve_state(name: str | None) -> str | None:
                    if not name:
                        return None
                    if parent:
                        cand = f"{parent}::{name}"
                        if cand in state.elements:
                            return cand
                    return resolve_ref(name)

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
                    file_id=file_id,
                )
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
                    state.anon_succession += 1
                    succ_name = f"succ{state.anon_succession}"
                parent = state.current_parent()

                def resolve_action(name: str | None) -> str | None:
                    if not name:
                        return None
                    if parent:
                        cand = f"{parent}::{name}"
                        if cand in state.elements:
                            return cand
                    return resolve_ref(name)

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

                # then perform name; | then action name; | then name;
                is_perform = False
                is_action_kw = False
                if peek() and peek().value == "perform":
                    take()
                    is_perform = True
                elif peek() and peek().value == "action":
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
                    type_ref = target  # reference name; usage name may equal target
                elif target.lower() == "done":
                    type_ref = "done"
                elif target.lower() == "start":
                    type_ref = "start"
                ensure_flow_action(
                    target,
                    type_ref=type_ref,
                    metadata_keywords=meta or None,
                )
                _ = is_action_kw
                link_from_previous(target)
                continue

            if tok.kind == "ident" and tok.value == "perform":
                # Standalone perform (without then) — still record as flow step
                take()
                target = expect_ident()
                if not target:
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == "{":
                    skip_until_semicolon_or_brace()
                elif peek() and peek().value == ";":
                    take()
                ensure_flow_action(
                    target, type_ref=target, metadata_keywords=["perform"]
                )
                link_from_previous(target)
                continue

            if tok.kind == "ident" and tok.value == "case":
                # case def / case usage (not "use case")
                line = tok.line
                take()
                if peek() and peek().value == "def":
                    take()
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
                    file_id=file_id,
                )
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
                # optional wildcard suffix (::*, .*, .**) — ignore for root selection
                while peek() and peek().value in {".", "::", "*"}:
                    take()
                if peek() and peek().value == ";":
                    take()
                parent = state.current_parent()
                if parent and parent in state.elements:
                    view_el = state.elements[parent]
                    if view_el.kind == ArtifactKind.VIEW:
                        # Resolve relative to the view's enclosing package
                        scope = view_el.parent_id
                        resolved: str | None = None
                        if ref in state.elements:
                            resolved = ref
                        if resolved is None and scope:
                            candidate = f"{scope}::{ref}"
                            if candidate in state.elements:
                                resolved = candidate
                        if resolved is None:
                            walk = scope
                            while walk:
                                candidate = f"{walk}::{ref}"
                                if candidate in state.elements:
                                    resolved = candidate
                                    break
                                el = state.elements.get(walk)
                                walk = el.parent_id if el else None
                        if resolved is None:
                            leaf = ref.split("::")[-1]
                            matches = [
                                e.id
                                for e in state.elements.values()
                                if e.name == leaf and e.kind != ArtifactKind.VIEW
                            ]
                            resolved = matches[0] if matches else (
                                f"{scope}::{ref}" if scope else ref
                            )
                        if resolved:
                            if resolved not in view_el.expose_refs:
                                view_el.expose_refs.append(resolved)
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
                if peek() and peek().value == "def":
                    take()
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
                    file_id=file_id,
                )
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
                    if peek() and peek().value == "def":
                        take()
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
                        file_id=file_id,
                    )
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
                if peek() and peek().value == "def":
                    take()
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
                    target_id=resolve_ref(target_ref),
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
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
                    target_id=resolve_ref(target_ref),
                    metadata_keywords=["objective"],
                    file_id=file_id,
                )
                state.add_child(parent, element_id)
                state.elements[element_id] = el
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
                if peek() and peek().value == "def":
                    take()
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
                    el = SemanticElement(
                        id=element_id,
                        kind=ArtifactKind.INTERFACE,
                        name=name,
                        parent_id=state.current_parent(),
                        type_ref=type_ref,
                        source_id=resolve_ref(source_ref),
                        target_id=resolve_ref(target_ref),
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
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.SATISFY,
                    name=name,
                    parent_id=parent,
                    source_id=resolve_ref(part_ref),
                    target_id=resolve_ref(req_ref),
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
                    "occurrence",
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

        if not state.defer_link:
            self._inherit_features_onto_usages(state)
            self._warn_unresolved_type_refs(state)
        return state

    def _apply_import_visibility(self, state: _ParserState) -> None:
        """
        Alpha import handling: imported names become visible for type resolution.
        `Pkg::*` imports all members of package Pkg; `Pkg::Name` imports that name.
        Visibility (private/public) is recorded but both resolve types in-project.
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
                        state.warnings.append(
                            f"line {imp.line}: import '{imp.path}' — package not found"
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
            state.warnings.append(
                f"line {imp.line}: import '{imp.path}' — symbol not found"
            )

    def _warn_unresolved_type_refs(self, state: _ParserState) -> None:
        """Flag type references that do not match any element name in the graph."""
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
            if not el.type_ref or el.type_ref in names:
                continue
            state.warnings.append(
                f"Type reference '{el.type_ref}' for '{el.name}' could not be resolved "
                f"in the semantic graph."
            )

    def _warn_unresolved_endpoints(self, state: _ParserState) -> None:
        """Flag satisfy / dependency endpoints that name no element in the merged graph.

        Only meaningful after all files are merged (parse_project); a single
        file may legitimately point into another file.
        """
        checks = {
            ArtifactKind.SATISFY: "satisfy",
            ArtifactKind.DEPENDENCY: "dependency",
        }
        for el in state.elements.values():
            label = checks.get(el.kind)
            if label is None:
                continue
            for role, endpoint in (("source", el.source_id), ("target", el.target_id)):
                if endpoint and endpoint not in state.elements:
                    state.warnings.append(
                        f"{label} {role} not found: {endpoint} (in '{el.id}')"
                    )

    def _inherit_features_onto_usages(self, state: _ParserState) -> None:
        """Copy ports, attributes, nested parts, and relations from defs onto usages."""
        defs_by_name: dict[str, SemanticElement] = {}
        for el in state.elements.values():
            if el.kind == ArtifactKind.PART and el.type_ref is None:
                defs_by_name[el.name] = el
        # `part def X :> Base` keeps type_ref but remains a type definition.
        specialized_def_ids = {
            el.source_id
            for el in state.elements.values()
            if el.kind == ArtifactKind.SPECIALIZATION and el.source_id
        }

        def resolve_type_def(type_ref: str | None) -> SemanticElement | None:
            if not type_ref:
                return None
            for el in state.elements.values():
                if el.kind == ArtifactKind.PART and el.name == type_ref and el.type_ref is None:
                    return el
            for el in state.elements.values():
                if (
                    el.kind == ArtifactKind.PART
                    and el.name == type_ref
                    and el.id in specialized_def_ids
                ):
                    return el
            return defs_by_name.get(type_ref)

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
                default_value=child.default_value,
                file_id=usage.file_id or state.file_id,
            )
            state.elements[usage_child_id] = port
            state.add_child(usage.id, usage_child_id)

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
                    elif child.kind == ArtifactKind.ATTRIBUTE:
                        copy_attribute(usage, child)
                    elif child.kind == ArtifactKind.PART:
                        nested = copy_nested_part(usage, child)
                        nested_def = resolve_type_def(child.type_ref)
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
                    parent_def = resolve_type_def(parent.type_ref)
                    if parent_def and parent_def.id == type_def.id:
                        return [type_def.id]
                parent_id = parent.parent_id
            return []

        # Fixpoint: specialized defs may gain copied relations in an earlier
        # pass that later usages need. Re-expand a usage only when its type
        # def has gained children since the last expansion.
        expanded_child_count: dict[str, int] = {}
        for _ in range(32):
            before = len(state.elements)
            usages = [
                el
                for el in list(state.elements.values())
                if el.kind == ArtifactKind.PART and el.type_ref
            ]
            for usage in usages:
                type_def = resolve_type_def(usage.type_ref)
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
