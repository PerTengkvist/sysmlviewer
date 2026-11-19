"""The FMEA data resolved against the SysML model."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field

from domain.failure.model import FailureKind
from domain.fmea.schema import SeverityConfig


@dataclass(frozen=True)
class Loc:
    """Where a piece of data was written: file (relative to the fmea dir) and JSON path."""

    file: str
    path: str


@dataclass(frozen=True)
class ModeSpec:
    id: str
    kind: FailureKind
    fraction: float | None
    description: str | None
    mode_ratio: float | None
    effect_probability: float | None
    occurrence: int | None
    detection_score: int | None
    detection_method: str | None
    loc: Loc


@dataclass(frozen=True)
class Unit:
    """The item itself (`sru` is None) or one of its SRUs, with its rate and modes."""

    sru: str | None
    rate_fit: float | None
    rate_loc: Loc
    modes: tuple[ModeSpec, ...]


@dataclass(frozen=True)
class Item:
    part_id: str
    qty: int
    units: tuple[Unit, ...]


@dataclass(frozen=True)
class Unresolved:
    code: str  # unknown-part-def, unknown-part, duplicate-part, unused-library, mode-ratio-sum, ...
    loc: Loc
    ref: str
    suggestions: tuple[str, ...] = ()
    other: Loc | None = None  # the other place involved (duplicate-part)
    detail: str = ""


@dataclass(frozen=True)
class ShortRef:
    loc: Loc
    ref: str
    resolved: str


@dataclass
class FmeaModel:
    items: list[Item]
    severity: SeverityConfig
    severity_file: str = "severity.yaml"
    unresolved: list[Unresolved] = field(default_factory=list)
    short_refs: list[ShortRef] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    lines: Mapping[tuple[str, str], int] = field(default_factory=dict)

    def line(self, loc: Loc) -> int | None:
        """Line of a path, or of its nearest enclosing path that has one."""
        path = loc.path
        while True:
            found = self.lines.get((loc.file, path))
            if found is not None:
                return found
            stripped = re.sub(r"(\.[^.\[\]]+|\[\d+\])$", "", path)
            if stripped == path:
                return None
            path = stripped
