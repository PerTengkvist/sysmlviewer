"""Tolerant SysML v2 textual subset parser for package/part/port/connection."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from domain.models import ArtifactKind, SemanticElement
from ports import ParseResult


_TOKEN_RE = re.compile(
    r"""
    (?P<comment>//[^\n]*)|
    (?P<string>'[^']*'|"[^"]*")|
    (?P<number>-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|
    (?P<ident>[A-Za-z_][\w]*)|
    (?P<punct>:>>|:>|::|[{}:;=,]|\.|~)|
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
            built = parent
            for part in parts:
                built = f"{built}::{part}"
            if built in state.elements:
                return built
            # Also try as sibling under same parent for first segment
            return built

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

        def parse_dependency_statement(metadata_keywords: list[str]) -> None:
            line = peek().line if peek() else 0
            take()  # dependency
            dep_name: str | None = None
            if peek() and peek().value != "from":
                dep_name = expect_ident()
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
                state.warnings.append(
                    f"line {tok.line}: metadata prefix ignored "
                    f"(only supported on dependency and part in alpha)"
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

            if tok.kind == "ident" and tok.value in {"message", "then"}:
                # `then message …` or bare `then a1;` (succession chain) or `message …`
                line = tok.line
                is_then = tok.value == "then"
                take()
                if is_then and peek() and peek().value == "message":
                    take()
                elif is_then and peek() and peek().kind == "ident" and peek().value not in {
                    "message",
                    "from",
                }:
                    # `then a1;` succession step within action
                    target_name = expect_ident()
                    if peek() and peek().value == ";":
                        take()
                    parent = state.current_parent()
                    # Find previous succession target or start as source
                    source_id = None
                    if parent and parent in state.elements:
                        prior = [
                            state.elements[cid]
                            for cid in state.elements[parent].children
                            if cid in state.elements
                            and state.elements[cid].kind == ArtifactKind.SUCCESSION
                        ]
                        if prior and prior[-1].target_id:
                            source_id = prior[-1].target_id
                        else:
                            # look for 'start' action or first action
                            start = next(
                                (
                                    state.elements[cid]
                                    for cid in state.elements[parent].children
                                    if cid in state.elements
                                    and state.elements[cid].name in {"start", "Start"}
                                ),
                                None,
                            )
                            source_id = start.id if start else None
                    state.anon_succession += 1
                    succ_name = f"succ{state.anon_succession}"
                    element_id = state.qualify(succ_name)
                    target_id = (
                        state.qualify(target_name) if target_name else None
                    )
                    # resolve target among siblings
                    if target_name and parent:
                        cand = f"{parent}::{target_name}"
                        if cand in state.elements:
                            target_id = cand
                    el = SemanticElement(
                        id=element_id,
                        kind=ArtifactKind.SUCCESSION,
                        name=succ_name,
                        parent_id=parent,
                        source_id=source_id,
                        target_id=target_id,
                        file_id=file_id,
                    )
                    state.add_child(parent, element_id)
                    state.elements[element_id] = el
                    continue
                elif is_then:
                    skip_until_semicolon_or_brace()
                    continue

                # message [payload] from A to B
                payload_parts: list[str] = []
                if peek() and peek().kind == "ident" and peek().value != "from":
                    payload_parts.append(expect_ident() or "")
                    while peek() and peek().value == ".":
                        take()
                        nxt = expect_ident()
                        if nxt:
                            payload_parts.append(nxt)
                if not (peek() and peek().value == "from"):
                    state.warnings.append(
                        f"line {line}: message expected 'from'"
                    )
                    skip_until_semicolon_or_brace()
                    continue
                take()  # from
                source_name = expect_ident()
                if not (peek() and peek().value == "to"):
                    state.warnings.append(f"line {line}: message expected 'to'")
                    skip_until_semicolon_or_brace()
                    continue
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
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
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
                # `first start;` inside action — create/start marker action if needed
                take()
                name = expect_ident()
                if not name:
                    skip_until_semicolon_or_brace()
                    continue
                if peek() and peek().value == ";":
                    take()
                element_id = state.qualify(name)
                if element_id not in state.elements:
                    el = SemanticElement(
                        id=element_id,
                        kind=ArtifactKind.ACTION,
                        name=name,
                        parent_id=state.current_parent(),
                        type_ref="start",
                        file_id=file_id,
                    )
                    state.add_child(el.parent_id, element_id)
                    state.elements[element_id] = el
                continue

            if tok.kind == "ident" and tok.value == "expose":
                take()
                # expose Vehicle; or expose Vehicle::*;
                ref = expect_ident()
                if not ref:
                    state.warnings.append(f"line {tok.line}: expose without target")
                    skip_until_semicolon_or_brace()
                    continue
                # optional .** / ::* style — skip trailing
                while peek() and peek().value in {".", "::", "*"}:
                    take()
                if peek() and peek().value == ";":
                    take()
                parent = state.current_parent()
                if parent and parent in state.elements:
                    view_el = state.elements[parent]
                    if view_el.kind == ArtifactKind.VIEW:
                        # Resolve relative to the view's enclosing package, not the view itself
                        scope = view_el.parent_id
                        if scope:
                            candidate = f"{scope}::{ref.replace('.', '::')}"
                        else:
                            candidate = ref.replace(".", "::")
                        if candidate in state.elements:
                            view_el.expose_ref = candidate
                        else:
                            matches = [
                                e.id
                                for e in state.elements.values()
                                if e.name == ref and e.kind != ArtifactKind.VIEW
                            ]
                            view_el.expose_ref = matches[0] if matches else candidate
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
                    "doc",
                    "alias",
                    "interface",
                    "requirement",
                    "occurrence",
                    "calc",
                    "assert",
                    "filter",
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

    def _inherit_features_onto_usages(self, state: _ParserState) -> None:
        """Copy ports, attributes, and nested parts from part definitions onto usages."""
        defs_by_name: dict[str, SemanticElement] = {}
        for el in state.elements.values():
            if el.kind == ArtifactKind.PART and el.type_ref is None:
                defs_by_name[el.name] = el

        def resolve_type_def(type_ref: str | None) -> SemanticElement | None:
            if not type_ref:
                return None
            for el in state.elements.values():
                if el.kind == ArtifactKind.PART and el.name == type_ref and el.type_ref is None:
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

        def inherit_from_def(
            usage: SemanticElement,
            type_def: SemanticElement,
            seen: set[str] | None = None,
        ) -> None:
            if seen is None:
                seen = set()
            if type_def.id in seen:
                return
            seen.add(type_def.id)
            for child_id in type_def.children:
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
                        inherit_from_def(nested, nested_def, seen)

        usages = [
            el
            for el in list(state.elements.values())
            if el.kind == ArtifactKind.PART and el.type_ref
        ]
        for usage in usages:
            type_def = resolve_type_def(usage.type_ref)
            if type_def:
                inherit_from_def(usage, type_def)
