"""FMEA/FMECA on top of the SysML model: data in YAML, effects computed from the model.

Usage (from the repo root):
    backend/.venv/bin/python scripts/fmea.py validate examples/electric_car
    backend/.venv/bin/python scripts/fmea.py coverage examples/electric_car
    backend/.venv/bin/python scripts/fmea.py analyze examples/electric_car --mode fmeca --format csv
    backend/.venv/bin/python scripts/fmea.py analyze examples/electric_car --spof
    backend/.venv/bin/python scripts/fmea.py simulate examples/electric_car --trials 5000 --seed 1
    backend/.venv/bin/python scripts/fmea.py schema --write

The data lives in <project>/fmea (override with --fmea-dir): library/*.yaml per part
definition, instances.yaml and severity.yaml. `--mode fmea` needs S, O, D data
(RPN = S*O*D); `--mode fmeca` needs rates (C_m = lambda_p * alpha * beta * t).
`analyze` and `simulate` validate first and stop when the data and the model disagree.

Exit codes: 0 ok, 1 drift or validation errors, 2 usage error.
The rules are described in docs/architecture.md, "FMEA/FMECA (toolbox)".
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend" / "src"))
from adapters.fmea.yaml_source import read_fmea_dir  # noqa: E402
from adapters.parser.subset_parser import SubsetSysmlParser  # noqa: E402
from domain.failure.extract import build_impact_graph  # noqa: E402
from domain.fmea import export  # noqa: E402
from domain.fmea.analyze import analyze  # noqa: E402
from domain.fmea.load import FmeaLoadError, load_fmea  # noqa: E402
from domain.fmea.simulate import simulate  # noqa: E402
from domain.fmea.schema import instances_json_schema, library_json_schema, severity_json_schema  # noqa: E402
from domain.fmea.validate import Finding, coverage, validate  # noqa: E402
from domain.models import SysmlFile  # noqa: E402
from domain.name_resolution import ImportSpec, NameResolver  # noqa: E402

SCHEMAS = {
    "fmea-library.schema.json": library_json_schema,
    "fmea-instances.schema.json": instances_json_schema,
    "fmea-severity.schema.json": severity_json_schema,
}
_DRIFT_CODES = {
    "unknown-part-def", "not-a-part-def", "ambiguous-part-def", "unknown-part",
    "not-a-part-usage", "ambiguous-part", "unknown-mode-id",
}


def _parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="fmea.py", description="FMEA/FMECA linked to the SysML model.")
    sub = ap.add_subparsers(dest="command", required=True)

    def project(p: argparse.ArgumentParser) -> None:
        p.add_argument("project_dir", help="folder with the project's .sysml files and fmea/")
        p.add_argument("--fmea-dir", help="folder with the FMEA data (default: <project>/fmea)")
        p.add_argument("--allow-warnings", action="store_true", help="carry on although the parser warns")
        p.add_argument("--extra", action="append", default=[], help=argparse.SUPPRESS)

    v = sub.add_parser("validate", help="check the data against the model")
    project(v)
    v.add_argument("--mode", choices=("fmea", "fmeca", "both"), default="both")
    v.add_argument("--notes", action="store_true", help="also print notes (such as mode ratios below 1)")
    c = sub.add_parser("coverage", help="parts without failure modes, modes without trace")
    project(c)
    a = sub.add_parser("analyze", help="the FMEA or FMECA table")
    project(a)
    a.add_argument("--mode", choices=("fmea", "fmeca"), default="fmea")
    a.add_argument("--format", choices=("markdown", "csv", "json"), default="markdown")
    a.add_argument("--spof", action="store_true", help="only the single points of failure")
    s = sub.add_parser("simulate", help="Monte Carlo over the mission time")
    project(s)
    s.add_argument("--trials", type=int, default=5000)
    s.add_argument("--seed", type=int, default=1)
    s.add_argument("--mission-time", type=float, help="hours; overrides severity.yaml")
    s.add_argument("--format", choices=("markdown", "csv", "json"), default="markdown")
    sc = sub.add_parser("schema", help="the JSON Schemas of the data files")
    sc.add_argument("--write", action="store_true", help="write the files instead of printing")
    sc.add_argument("--out", default=str(REPO / "docs" / "schemas"))
    return ap


def _load_sysml(root: Path, extra: list[str]) -> list[SysmlFile]:
    files = [
        SysmlFile(id=str(f.relative_to(root)), name=f.name, content=f.read_text(encoding="utf-8"),
                  path=str(f.relative_to(root)))
        for f in sorted(root.rglob("*.sysml"))
    ]
    for path in map(Path, extra):
        files.append(SysmlFile(id=path.name, name=path.name, content=path.read_text(encoding="utf-8"), path=path.name))
    return files


def _fail(message: str, code: int = 2) -> int:
    print(message, file=sys.stderr)
    return code


class _Context:
    def __init__(self, args: argparse.Namespace) -> None:
        self.args = args
        self.root = Path(args.project_dir).resolve()
        self.fmea_dir = Path(args.fmea_dir).resolve() if args.fmea_dir else self.root / "fmea"
        try:
            self.display_dir = str(self.fmea_dir.relative_to(self.root))
        except ValueError:
            self.display_dir = str(self.fmea_dir)

    def shown(self, file: str) -> str:
        return f"{self.display_dir}/{file}"


def _find_line(ctx: _Context, f: Finding) -> str:
    where = f"{ctx.shown(f.file)}:{f.line}" if f.line else ctx.shown(f.file)
    out = f"{where}  {f.path}: {f.ref if f.ref else f.message}"
    if f.ref:
        out += f"\n  {f.message}"
        if f.suggestions:
            quoted = [f"'{s}'" for s in f.suggestions]
            if f.code.startswith("ambiguous"):
                out += "\n  Candidates: " + ", ".join(quoted)
            elif len(quoted) == 1:
                out += f"\n  Did you mean {quoted[0]}?"
            else:
                out += "\n  Did you mean one of: " + ", ".join(quoted) + "?"
    if f.fix:
        first, sep, rest = f.fix.format(file=ctx.shown(f.file)).partition(", or ")
        out += f"\n  Fix: {first}{',' if sep else ''}"
        if sep:
            out += f"\n       or {rest}"
    return out


def _error_block(ctx: _Context, errors: list[Finding], mode: str) -> str:
    n = len(errors)
    noun = "error" if n == 1 else "errors"
    if any(e.code in _DRIFT_CODES for e in errors):
        head = f"FMEA is out of sync with the SysML model: {n} {noun}"
    elif all(e.code == "missing-field" for e in errors):
        head = f"FMEA data is incomplete for --mode {mode}: {n} {noun}"
    else:
        head = f"FMEA data has {n} {noun}"
    body = "\n\n".join(_find_line(ctx, e) for e in errors)
    return (
        f"{head}\n\n{body}\n\nNothing was analysed. After fixing, run:\n"
        f"  backend/.venv/bin/python scripts/fmea.py validate {ctx.args.project_dir}"
    )


def _prepare(ctx: _Context, mode: str):
    """Parse, load and validate. Returns (state, None) or (None, exit code)."""
    args = ctx.args
    if not ctx.root.is_dir():
        return None, _fail(f"error: not a folder: {args.project_dir}")
    if not ctx.fmea_dir.is_dir():
        return None, _fail(f"error: no FMEA data folder: {ctx.fmea_dir}")
    result = SubsetSysmlParser().parse_project(_load_sysml(ctx.root, args.extra))
    if result.warnings and not args.allow_warnings:
        for w in result.warnings:
            print(f"warning: {w}", file=sys.stderr)
        return None, _fail("error: the model has parser warnings (use --allow-warnings)", 1)
    semantic = result.elements
    resolver = NameResolver(semantic, [ImportSpec.from_dict(i) for i in result.imports])
    try:
        fmea = load_fmea(read_fmea_dir(ctx.fmea_dir), semantic, resolver)
    except FmeaLoadError as exc:
        text = "\n".join(
            ctx.shown(l) if l.startswith(f"{exc.file}:") else l for l in str(exc).splitlines()
        )
        return None, _fail(f"FMEA data cannot be read\n\n{text}", 1)
    graph = build_impact_graph(semantic)
    for w in graph.warnings:
        print(f"warning: {w}", file=sys.stderr)
    if graph.warnings and not args.allow_warnings:
        return None, _fail("error: the failure engine warns about the model (use --allow-warnings)", 1)
    findings = validate(fmea, semantic, mode)
    if findings.errors:
        return None, _fail(_error_block(ctx, findings.errors, mode), 1)
    return (fmea, semantic, graph, findings), None


def _cmd_validate(ctx: _Context) -> int:
    state, code = _prepare(ctx, ctx.args.mode)
    if state is None:
        return code
    fmea, _, _, findings = state
    for w in findings.warnings:
        print(f"warning: {_find_line(ctx, w)}")
    if ctx.args.notes:
        for note in fmea.notes:
            print(f"note: {note}")
    n = len(findings.warnings)
    print(f"0 errors, {n} warning{'s' if n != 1 else ''} (mode: {ctx.args.mode})")
    return 0


def _warn(ctx: _Context, findings) -> None:
    """Warnings go to stderr for the commands whose stdout is data."""
    for w in findings.warnings:
        print(f"warning: {_find_line(ctx, w)}", file=sys.stderr)


def _cmd_coverage(ctx: _Context) -> int:
    state, code = _prepare(ctx, "both")
    if state is None:
        return code
    fmea, semantic, graph, findings = state
    _warn(ctx, findings)
    print(export.coverage_to_csv(coverage(fmea, semantic, graph)), end="")
    return 0


def _cmd_analyze(ctx: _Context) -> int:
    args = ctx.args
    state, code = _prepare(ctx, args.mode)
    if state is None:
        return code
    fmea, semantic, graph, findings = state
    _warn(ctx, findings)
    analysis = analyze(fmea, semantic, graph, args.mode)
    if args.spof:
        threshold = fmea.severity.spof_severity_threshold
        if args.format == "csv":
            print(export.spof_to_csv(analysis, threshold), end="")
        elif args.format == "json":
            print(json.dumps(export.spof_to_json_list(analysis, threshold), indent=2, ensure_ascii=False))
        else:
            print(export.spof_to_markdown(analysis, threshold), end="")
    elif args.format == "csv":
        print(export.to_csv(analysis), end="")
    elif args.format == "json":
        print(json.dumps(export.to_json_dict(analysis), indent=2, ensure_ascii=False))
    else:
        print(export.to_markdown_table(analysis), end="")
    return 0


def _cmd_schema(args: argparse.Namespace) -> int:
    docs = {name: build() for name, build in SCHEMAS.items()}
    if not args.write:
        print(json.dumps(docs, indent=2, ensure_ascii=False))
        return 0
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, doc in docs.items():
        (out / name).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"wrote {out / name}")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "schema":
        return _cmd_schema(args)
    ctx = _Context(args)
    handlers = {"validate": _cmd_validate, "coverage": _cmd_coverage, "analyze": _cmd_analyze}
    if args.command == "simulate":
        return _cmd_simulate(ctx)
    return handlers[args.command](ctx)


def _cmd_simulate(ctx: _Context) -> int:
    args = ctx.args
    if args.trials < 1:
        return _fail("error: --trials must be at least 1")
    state, code = _prepare(ctx, "fmeca")
    if state is None:
        return code
    fmea, _, graph, findings = state
    _warn(ctx, findings)
    t = args.mission_time if args.mission_time is not None else fmea.severity.mission_time_h
    result = simulate(fmea, graph, trials=args.trials, seed=args.seed, mission_time_h=t)
    rows = export.simulation_rows(graph, result)
    if args.format == "csv":
        print(export.simulation_to_csv(rows), end="")
    elif args.format == "json":
        doc = {"trials": result.trials, "seed": result.seed, "missionTimeH": t, "nodes": rows}
        print(json.dumps(doc, indent=2, ensure_ascii=False))
    else:
        print(export.simulation_to_markdown(rows), end="")
    return 0


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    sys.exit(main())
