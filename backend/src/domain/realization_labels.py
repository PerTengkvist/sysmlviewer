"""Unambiguous labels for the realization views (decision B11).

One rule for the realization chain and the realization matrix; the clients only read the
result (`chainLabels`, `matrixLabels`). Same disambiguation as `failure/labels.py`.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping

from domain.failure.labels import disambiguate
from domain.models import SemanticElement


def unambiguous_labels(
    semantic: Mapping[str, SemanticElement], ids: Iterable[str], tagged: bool = True
) -> dict[str, str]:
    """Label per id, unique among `ids` (decision B11).

    `tagged`: `<short name> <name>` for tagged elements (the `label` style of
    domain/failure/labels.py), else the name (the `name` style). A text shared by two or
    more ids is replaced by the shortest suffix of their qualified ids, in whole `::`
    segments, that is unique; the tag stays in front. One rule for the realization chain and
    the realization matrix, whose clients only read the result.
    """
    ids = [i for i in ids if i in semantic]

    def suffix(key: str, k: int) -> str:
        return "::".join(key.split("::")[-(k + 1):])

    def tag(key: str) -> str:
        short = semantic[key].short_id if tagged else None
        return f"{short} " if short else ""

    base = {i: f"{tag(i)}{semantic[i].name}" for i in ids}
    qual: Callable[[str, int], str] = lambda key, k: f"{tag(key)}{suffix(key, k)}"
    return disambiguate(base, qual)
