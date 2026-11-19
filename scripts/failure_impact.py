"""Failure-impact analysis: what a failed part does to functions, use cases and requirements.

Usage (from the repo root):
    backend/.venv/bin/python scripts/failure_impact.py examples/electric_car \
        --fail electricMotor:loss
    backend/.venv/bin/python scripts/failure_impact.py examples/electric_car \
        --fail batteryPack.modules:loss:2 --fail driveEcu:degraded:0.5
    backend/.venv/bin/python scripts/failure_impact.py examples/electric_car --spof \
        --format markdown

`--fail <name>:<kind>[:<fraction>][:<count>]`
    <name>      a part usage: `electricMotor`, `batteryPack.modules`, or a qualified
                name. An ambiguous name lists the candidates.
    <kind>      loss | degraded | erroneous (treated as loss and flagged)
    <fraction>  degraded only, in (0, 1): `driveEcu:degraded:0.5`
    <count>     number of failed instances of a group usage (a part with a
                multiplicity such as `modules[8]`): `batteryPack.modules:loss:2`

`--spof` loses every physical part in turn (one instance of a group usage) and
tabulates the functions and requirements each loss hits.

Exit codes: 0 ok, 1 parser warnings (see --allow-warnings), 2 usage error.
The rules are described in docs/architecture.md, "Failure impact (toolbox)".
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "src"))
from adapters.parser.subset_parser import SubsetSysmlParser  # noqa: E402
from domain.failure.extract import build_impact_graph  # noqa: E402
from domain.failure.model import Failure, parse_failure_spec  # noqa: E402
from domain.failure.propagate import evaluate  # noqa: E402
from domain.failure.report import (  # noqa: E402
    spof_to_json_list,
    spof_to_markdown,
    spof_to_text,
    to_json_dict,
    to_markdown,
    to_text,
)
from domain.failure.scenarios import (  # noqa: E402
    AmbiguousName,
    UnknownName,
    resolve_failure_target,
    spof,
)
from domain.models import SysmlFile  # noqa: E402
from domain.name_resolution import ImportSpec, NameResolver  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="failure_impact.py",
        description="Impact of part failures on functions, use cases and requirements.",
    )
    ap.add_argument("project_dir", help="folder with the project's .sysml files")
    ap.add_argument(
        "--fail",
        action="append",
        default=[],
        metavar="NAME:KIND[:FRACTION][:COUNT]",
        help="a failure; repeat for several (e.g. electricMotor:loss, driveEcu:degraded:0.5)",
    )
    ap.add_argument("--spof", action="store_true", help="table of every single part loss")
    ap.add_argument("--format", choices=("text", "markdown", "json"), default="text")
    ap.add_argument(
        "--allow-warnings", action="store_true", help="carry on although the parser warns"
    )
    ap.add_argument("--extra", action="append", default=[], help=argparse.SUPPRESS)
    return ap


def _load(root: Path, extra: list[str]) -> list[SysmlFile]:
    files = [
        SysmlFile(
            id=str(f.relative_to(root)),
            name=f.name,
            content=f.read_text(encoding="utf-8"),
            path=str(f.relative_to(root)),
        )
        for f in sorted(root.rglob("*.sysml"))
    ]
    for path in map(Path, extra):
        if not path.is_file():
            raise FileNotFoundError(f"--extra file not found: {path}")
        files.append(
            SysmlFile(id=path.name, name=path.name, content=path.read_text(encoding="utf-8"), path=path.name)
        )
    return files


def _fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 2


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if bool(args.fail) == args.spof:
        return _fail("error: give either --fail (one or more) or --spof")
    root = Path(args.project_dir).resolve()
    if not root.is_dir():
        return _fail(f"error: not a folder: {args.project_dir}")

    try:
        files = _load(root, args.extra)
    except OSError as exc:
        return _fail(f"error: {exc}")
    result = SubsetSysmlParser().parse_project(files)
    for w in result.warnings:
        print(f"warning: {w}", file=sys.stderr)
    if result.warnings and not args.allow_warnings:
        print("error: the model has parser warnings (use --allow-warnings)", file=sys.stderr)
        return 1
    graph = build_impact_graph(result.elements)
    for w in graph.warnings:
        print(f"warning: {w}", file=sys.stderr)

    if args.spof:
        rows = spof(graph)
        if args.format == "json":
            print(json.dumps(spof_to_json_list(graph, rows), indent=2, ensure_ascii=False))
        elif args.format == "markdown":
            print(spof_to_markdown(graph, rows), end="")
        else:
            print(spof_to_text(graph, rows), end="")
        return 0

    resolver = NameResolver(result.elements, [ImportSpec.from_dict(i) for i in result.imports])
    failures: list[Failure] = []
    for spec in args.fail:
        try:
            name, kind, fraction, count = parse_failure_spec(spec)
            part_id = resolve_failure_target(name, result.elements, resolver)
        except AmbiguousName as exc:
            return _fail("\n".join([f"error: ambiguous part {exc.ref!r}:", *exc.candidates]))
        except UnknownName as exc:
            hint = f" (did you mean: {', '.join(exc.suggestions)}?)" if exc.suggestions else ""
            return _fail(f"error: unknown part {exc.ref!r}{hint}")
        except ValueError as exc:
            return _fail(f"error: {exc}")
        if part_id not in graph.nodes:
            print(f"note: {part_id} implements nothing; it has no effect", file=sys.stderr)
        failures.append(Failure(part_id, kind, fraction, count))
    try:
        impacts = evaluate(graph, failures)
    except ValueError as exc:
        return _fail(f"error: {exc}")

    if args.format == "json":
        print(json.dumps(to_json_dict(graph, failures, impacts), indent=2, ensure_ascii=False))
    elif args.format == "markdown":
        print(to_markdown(graph, failures, impacts), end="")
    else:
        print(to_text(graph, failures, impacts), end="")
    return 0


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    sys.exit(main())
