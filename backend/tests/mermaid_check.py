"""A small syntactic check of the mermaid blocks that the FMEA report and tutorial use.

It is deliberately stricter than mermaid itself: it only accepts the subset the generators
write (flowchart with `id["label"]` nodes and `a -->|label| b` edges, and quadrantChart),
so a regression in the generator shows up here without a browser.
"""

from __future__ import annotations

import re

_ID = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_NODE = re.compile(r'^\s*([^\s\[\]"|]+)\["([^"\[\]|]*)"\]\s*$')
_EDGE = re.compile(r"^\s*(\S+) -->\|([^|\"\[\]]+)\| (\S+)\s*$")
_POINT = re.compile(r"^\s*([^:\[\]]+): \[([0-9.]+), ([0-9.]+)\]\s*$")
_BLOCK = re.compile(r"```mermaid\n(.*?)\n```", re.S)


def mermaid_blocks(markdown: str) -> list[str]:
    return _BLOCK.findall(markdown)


def _balanced(src: str) -> bool:
    stack = []
    pairs = {")": "(", "]": "[", "}": "{"}
    for ch in src:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack


def check_mermaid(src: str) -> list[str]:
    """Problems found in one mermaid block; an empty list means it passes."""
    problems: list[str] = []
    lines = [ln for ln in src.split("\n") if ln.strip()]
    if not lines:
        return ["empty block"]
    if not _balanced(src):
        problems.append("unbalanced brackets or parentheses")
    head = lines[0].strip()
    if head in ("flowchart LR", "flowchart TD"):
        problems += _check_flowchart(lines[1:])
    elif head == "quadrantChart":
        problems += _check_quadrant(lines[1:])
    else:
        problems.append(f"unknown diagram type: {head!r}")
    return problems


def _check_flowchart(lines: list[str]) -> list[str]:
    problems: list[str] = []
    declared: set[str] = set()
    used: list[str] = []
    for ln in lines:
        if (m := _NODE.match(ln)) is not None:
            if not _ID.match(m.group(1)):
                problems.append(f"bad node id: {m.group(1)!r}")
            declared.add(m.group(1))
        elif (m := _EDGE.match(ln)) is not None:
            used += [m.group(1), m.group(3)]
        else:
            problems.append(f"unrecognised line: {ln.strip()!r}")
    problems += [f"undeclared node: {n!r}" for n in dict.fromkeys(used) if n not in declared]
    return problems


def _check_quadrant(lines: list[str]) -> list[str]:
    problems: list[str] = []
    keys = {ln.strip().split(" ", 1)[0] for ln in lines}
    for needed in ("x-axis", "y-axis"):
        if needed not in keys:
            problems.append(f"missing {needed}")
    points = 0
    for ln in lines:
        word = ln.strip().split(" ", 1)[0]
        if word in ("title", "x-axis", "y-axis", "quadrant-1", "quadrant-2", "quadrant-3", "quadrant-4"):
            continue
        m = _POINT.match(ln)
        if m is None:
            problems.append(f"unrecognised line: {ln.strip()!r}")
            continue
        points += 1
        if not re.fullmatch(r"[A-Za-z0-9 ]+", m.group(1).strip()):
            problems.append(f"point name must be letters, digits and spaces only: {m.group(1).strip()!r}")
        for coordinate in (m.group(2), m.group(3)):
            # exact: mermaid's lexer rejects 1.0 and 1.000, and values must stay in [0, 1]
            if not re.fullmatch(r"1|0(\.\d+)?", coordinate):
                problems.append(f"bad quadrant coordinate {coordinate!r} (use 1, 0 or 0.xxx): {ln.strip()!r}")
    if points == 0:
        problems.append("no points")
    return problems
