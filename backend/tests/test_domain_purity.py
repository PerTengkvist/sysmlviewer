"""Architecture guard: the failure and FMEA domain code stays free of adapters and I/O formats."""

from __future__ import annotations

import ast
from pathlib import Path

DOMAIN = Path(__file__).resolve().parents[1] / "src" / "domain"
FORBIDDEN = {"adapters", "fastapi", "json", "yaml"}


def _violations(package: str) -> list[str]:
    root = DOMAIN / package
    if not root.is_dir():
        return []
    out = []
    for path in sorted(root.rglob("*.py")):
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                names = [node.module or ""]
            else:
                continue
            for name in names:
                if name.split(".")[0] in FORBIDDEN:
                    out.append(f"{path.name}: imports {name}")
    return out


def test_domain_failure_and_fmea_are_pure():
    assert _violations("failure") == []
    assert _violations("fmea") == []
