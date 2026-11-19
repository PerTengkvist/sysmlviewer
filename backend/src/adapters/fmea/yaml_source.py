"""Read the FMEA directory: YAML files, with the line of every key and list item."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from domain.fmea.load import FmeaLoadError, FmeaSources


def _collect(node: yaml.Node, path: str, file: str, lines: dict[tuple[str, str], int]) -> None:
    if isinstance(node, yaml.MappingNode):
        for key, value in node.value:
            sub = f"{path}.{key.value}" if path else str(key.value)
            lines[(file, sub)] = key.start_mark.line + 1
            _collect(value, sub, file, lines)
    elif isinstance(node, yaml.SequenceNode):
        for i, item in enumerate(node.value):
            sub = f"{path}[{i}]"
            lines[(file, sub)] = item.start_mark.line + 1
            _collect(item, sub, file, lines)


def _read(path: Path, rel: str, data: dict[str, Any], lines: dict[tuple[str, str], int]) -> None:
    text = path.read_text(encoding="utf-8")
    try:
        node = yaml.compose(text, Loader=yaml.SafeLoader)
        content = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        problem = getattr(exc, "problem", None) or str(exc)
        raise FmeaLoadError(rel, mark.line + 1 if mark else None, f"invalid YAML: {problem}") from None
    if node is not None:
        _collect(node, "", rel, lines)
    data[rel] = content


def read_fmea_dir(path: Path) -> FmeaSources:
    """`library/*.yaml`, `instances.yaml` and `severity.yaml`; `docs/` is ignored."""
    data: dict[str, Any] = {}
    lines: dict[tuple[str, str], int] = {}
    for f in sorted((path / "library").glob("*.yaml")):
        _read(f, f"library/{f.name}", data, lines)
    for name in ("instances.yaml", "severity.yaml"):
        if (path / name).is_file():
            _read(path / name, name, data, lines)
    return FmeaSources(data, lines)
