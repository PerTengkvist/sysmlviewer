"""Kinds of `expose` in a view (SysML v2 membership / namespace expose).

- ``member``: ``expose P;``, P with its contents to the diagram levels
  (this viewer's long-standing reading of a plain expose).
- ``members``: ``expose P::*;``, P's direct members only, without P and
  without the members' own contents.
- ``recursive``: ``expose P::**;``, P and everything under it, at any depth.
- ``membersRecursive``: ``expose P::*::**;``, everything under P, without P.
"""

from __future__ import annotations

MEMBER = "member"
MEMBERS = "members"
RECURSIVE = "recursive"
MEMBERS_RECURSIVE = "membersRecursive"

EXPOSE_KINDS = (MEMBER, MEMBERS, RECURSIVE, MEMBERS_RECURSIVE)

# Wider kinds win when one id is exposed twice.
_WIDTH = {MEMBERS: 0, MEMBER: 1, MEMBERS_RECURSIVE: 2, RECURSIVE: 3}

SUFFIX = {
    MEMBER: "",
    MEMBERS: "::*",
    RECURSIVE: "::**",
    MEMBERS_RECURSIVE: "::*::**",
}


def widest(a: str | None, b: str) -> str:
    """The wider of two expose kinds (``b`` when ``a`` is unset)."""
    if a is None:
        return b
    return a if _WIDTH.get(a, 1) >= _WIDTH.get(b, 1) else b


def set_kind(
    kinds: dict[str, str], expose_id: str, kind: str, *, seen: bool
) -> None:
    """Record `kind` for an id; when the id was exposed before (`seen`), keep
    the wider kind. A plain member expose is stored as no entry, so only
    wildcard exposes show up in saved models."""
    merged = widest(kind_of(kinds, expose_id) if seen else None, kind)
    if merged == MEMBER:
        kinds.pop(expose_id, None)
    else:
        kinds[expose_id] = merged


def kind_of(kinds: dict[str, str], expose_id: str) -> str:
    kind = kinds.get(expose_id, MEMBER)
    return kind if kind in EXPOSE_KINDS else MEMBER


def includes_root(kind: str) -> bool:
    """Whether the exposed element itself is part of the view."""
    return kind in (MEMBER, RECURSIVE)


def controls_depth(kind: str) -> bool:
    """Whether the expose, not the diagram levels, sets the depth."""
    return kind != MEMBER
