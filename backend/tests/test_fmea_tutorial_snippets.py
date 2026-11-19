"""docs/tutorials/fmea.md quotes the sources verbatim and its CLI output is real (step 25)."""

from __future__ import annotations

import importlib.util
import re
import shutil
import textwrap

import pytest
from mermaid_check import check_mermaid, mermaid_blocks

from adapters.api.static_paths import resolve_repo_root

REPO = resolve_repo_root()
CAR = REPO / "examples" / "electric_car"
TUTORIAL = REPO / "docs" / "tutorials" / "fmea.md"
TEXT = TUTORIAL.read_text(encoding="utf-8")
# A fenced block, optionally preceded by a markdown comment `[//]: # (tag)` on the line before it
# (an HTML comment would show up as text in the viewer).
BLOCK = re.compile(r"(?:\[//\]: # \((?P<tag>[^)\n]*)\)\n)?```(?P<lang>[\w-]*)\n(?P<body>.*?)\n```", re.S)
BLOCKS = [m.groupdict() for m in BLOCK.finditer(TEXT)]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def fmea_cli():
    return load(REPO / "scripts" / "fmea.py", "fmea_cli_tutorial")


@pytest.fixture(scope="module")
def trigger():
    return load(REPO / "scripts" / "electric_car_trigger_fmea_failure.py", "trigger_tutorial")


@pytest.fixture()
def car(tmp_path):
    dst = tmp_path / "electric_car"
    shutil.copytree(CAR, dst, ignore=shutil.ignore_patterns("icons", "docs", ".sysmlviewer"))
    return dst


def contains_lines(source: str, block: str) -> bool:
    want = textwrap.dedent("\n".join(line.rstrip() for line in block.split("\n")))
    lines = [line.rstrip() for line in source.split("\n")]
    n = len(block.split("\n"))
    return any(textwrap.dedent("\n".join(lines[i : i + n])) == want for i in range(len(lines) - n + 1))


def test_tutorial_has_blocks():
    assert any(b["lang"] == "sysml" for b in BLOCKS) and any(b["lang"] == "yaml" for b in BLOCKS)


def test_fmea_tutorial_snippets_match_sources():
    checked = 0
    for b in BLOCKS:
        if b["lang"] not in ("sysml", "yaml"):
            continue
        tag = b["tag"] or ""
        first = b["body"].split("\n", 1)[0]
        if tag.startswith("illustration"):
            continue  # checked by test_new_mode_example_validates
        m = re.fullmatch(r"source: (examples/electric_car/\S+)", tag)
        assert m, f"{b['lang']} block without a source comment: {first!r}"
        path = REPO / m.group(1)
        assert path.is_file(), f"{m.group(1)} does not exist"
        assert contains_lines(path.read_text(encoding="utf-8"), b["body"]), (
            f"block starting {first!r} is not verbatim in {m.group(1)}"
        )
        checked += 1
    assert checked >= 5


def block(tag):
    found = [b for b in BLOCKS if b["tag"] == tag]
    assert len(found) == 1, f"expected exactly one block tagged {tag!r}"
    return found[0]["body"]


def test_fmea_tutorial_output_matches_cli(fmea_cli, trigger, capsys, car):
    assert trigger.main(["apply", "--project", str(car)]) == 0
    applied = capsys.readouterr().out
    normalised = applied.replace(f" --project {car}", "").replace(str(car), "examples/electric_car")
    assert normalised.rstrip("\n") == block("output: trigger apply")
    assert fmea_cli.main(["validate", str(car)]) == 1
    err = capsys.readouterr().err
    assert err.replace(str(car), "examples/electric_car").rstrip("\n") == block(
        "output: fmea validate after trigger apply"
    )
    assert trigger.main(["reset", "--project", str(car)]) == 0
    reset = capsys.readouterr().out
    assert reset.replace(f" --project {car}", "").replace(str(car), "examples/electric_car").rstrip("\n") == block(
        "output: trigger reset"
    )


def test_fmea_tutorial_mermaid_valid():
    blocks = mermaid_blocks(TEXT)
    assert blocks
    for b in blocks:
        assert check_mermaid(b) == [], b


def test_new_mode_example_validates(fmea_cli, capsys, car):
    """The step-by-step 'Adding a failure mode' edits really give valid data."""
    lib = car / "fmea" / "library" / "brake_circuit.yaml"
    text = lib.read_text(encoding="utf-8")
    edit = block("illustration: lower the existing mode ratio")
    old, new = [ln.strip() for ln in edit.split("\n") if ln.strip().startswith(("-", "+"))]
    old, new = old.lstrip("- ").strip(), new.lstrip("+ ").strip()
    assert old in text
    text = text.replace(old, new, 1)
    text = text.rstrip("\n") + "\n" + block("illustration: the new mode") + "\n"
    lib.write_text(text, encoding="utf-8")
    for argv in (("validate", car), ("analyze", car, "--mode", "fmea"), ("analyze", car, "--mode", "fmeca")):
        code = fmea_cli.main([*map(str, argv)])
        out = capsys.readouterr()
        assert code == 0, out.err
    assert "pad_wear" in out.out


def test_commands_in_tutorial_exist():
    """Every `fmea.py <command>` the text mentions is a real sub-command."""
    for cmd in set(re.findall(r"scripts/fmea\.py (\w+)", TEXT)):
        assert cmd in {"validate", "coverage", "analyze", "simulate", "schema"}, cmd
