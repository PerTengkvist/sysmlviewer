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
    (?P<punct>:>|::|[{}:;=]|\.|~)|
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
class _ParserState:
    elements: dict[str, SemanticElement] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    scopes: list[_Scope] = field(default_factory=list)
    file_id: str = ""
    anon_conn: int = 0

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
        state = _ParserState(file_id=file_id)
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
            """Resolve relative or dotted names against current scope."""
            if "::" in ref:
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

            if tok.kind == "ident" and tok.value == "part":
                take()
                is_def = False
                if peek() and peek().value == "def":
                    take()
                    is_def = True
                name = expect_ident()
                if not name:
                    state.warnings.append(f"line {tok.line}: part without name")
                    skip_until_semicolon_or_brace()
                    continue
                type_ref = None
                # Usage typing `part x : Type` or specialization `part def X :> Type`
                if peek() and peek().value in {":", ":>"}:
                    take()
                    # optional ~
                    if peek() and peek().value == "~":
                        take()
                    type_ref = expect_ident()
                element_id = state.qualify(name)
                el = SemanticElement(
                    id=element_id,
                    kind=ArtifactKind.PART,
                    name=name,
                    parent_id=state.current_parent(),
                    type_ref=type_ref,
                    file_id=file_id,
                )
                state.add_child(el.parent_id, element_id)
                state.elements[element_id] = el
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
                _ = is_def
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
                # parse endpoint A [.] B to C [.] D
                def read_endpoint() -> str | None:
                    parts: list[str] = []
                    name = expect_ident()
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

            if tok.kind == "ident" and tok.value == "view":
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

            # private/public import Library::*;
            if tok.kind == "ident" and tok.value in {"private", "public"}:
                if peek(1) and peek(1).value == "import":
                    take()  # visibility
                    take()  # import
                    state.warnings.append(
                        f"line {tok.line}: 'import' ignored in alpha subset"
                    )
                    skip_until_semicolon_or_brace()
                    continue

            # Unknown token — skip identifier statements with warning for keyword-like
            if tok.kind == "ident":
                ident = tok.value
                # Known ignored keywords
                ignored = {
                    "item",
                    "import",
                    "private",
                    "public",
                    "doc",
                    "alias",
                    "interface",
                    "action",
                    "state",
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

        self._inherit_features_onto_usages(state)
        self._warn_unresolved_type_refs(state)
        return ParseResult(elements=state.elements, warnings=state.warnings)

    def _warn_unresolved_type_refs(self, state: _ParserState) -> None:
        """Flag type references that do not match any element name in the graph."""
        names = {el.name for el in state.elements.values()}
        for el in state.elements.values():
            if not el.type_ref or el.type_ref in names:
                continue
            state.warnings.append(
                f"Type reference '{el.type_ref}' for '{el.name}' could not be resolved "
                f"in the semantic graph."
            )

    def _inherit_features_onto_usages(self, state: _ParserState) -> None:
        """Copy ports and attributes from part definitions onto part usages."""
        # Index part defs by simple name
        defs_by_name: dict[str, SemanticElement] = {}
        for el in state.elements.values():
            if el.kind == ArtifactKind.PART and el.type_ref is None:
                # Heuristic: definitions often have children ports; also match by name
                defs_by_name[el.name] = el

        extras = [
            el
            for el in list(state.elements.values())
            if el.kind == ArtifactKind.PART and el.type_ref
        ]
        for usage in extras:
            type_def = None
            # Prefer qualified lookup
            for el in state.elements.values():
                if el.kind == ArtifactKind.PART and el.name == usage.type_ref and el.id != usage.id:
                    # Prefer package-level defs
                    if el.type_ref is None:
                        type_def = el
                        break
            if not type_def:
                type_def = defs_by_name.get(usage.type_ref or "")
            if not type_def:
                continue
            for child_id in type_def.children:
                child = state.elements.get(child_id)
                if not child:
                    continue
                if child.kind == ArtifactKind.PORT:
                    usage_child_id = f"{usage.id}::{child.name}"
                    if usage_child_id in state.elements:
                        continue
                    port = SemanticElement(
                        id=usage_child_id,
                        kind=ArtifactKind.PORT,
                        name=child.name,
                        parent_id=usage.id,
                        type_ref=child.type_ref,
                        default_value=child.default_value,
                        file_id=state.file_id,
                    )
                    state.elements[usage_child_id] = port
                    state.add_child(usage.id, usage_child_id)
                elif child.kind == ArtifactKind.ATTRIBUTE:
                    usage_child_id = f"{usage.id}::{child.name}"
                    if usage_child_id in state.elements:
                        continue
                    attr = SemanticElement(
                        id=usage_child_id,
                        kind=ArtifactKind.ATTRIBUTE,
                        name=child.name,
                        parent_id=usage.id,
                        type_ref=child.type_ref,
                        default_value=child.default_value,
                        file_id=state.file_id,
                    )
                    state.elements[usage_child_id] = attr
                    state.add_child(usage.id, usage_child_id)
