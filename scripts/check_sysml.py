"""Parse every .sysml file under a folder with the subset parser and report warnings.

Usage (from the repo root):
    uv run --project backend python scripts/check_sysml.py examples/electric_car
    backend/.venv/bin/python scripts/check_sysml.py examples/electric_car

Prints the element count per kind and every parser / file warning, then the use
case realization findings (only for use cases with step-level `#refine` links) as
`REALIZATION <code> <id>: <message>`. Exits 1 if there are warnings or findings, so
it can gate example-model changes.
"""
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend" / "src"))
from adapters.parser.subset_parser import SubsetSysmlParser  # noqa: E402
from domain.models import SysmlFile  # noqa: E402
from domain.realization import derive_realization  # noqa: E402

if len(sys.argv) != 2:
    sys.exit(__doc__)

root = Path(sys.argv[1]).resolve()
files = [
    SysmlFile(id=str(f.relative_to(root)), name=f.name, content=f.read_text(), path=str(f.relative_to(root)))
    for f in sorted(root.rglob("*.sysml"))
]
result = SubsetSysmlParser().parse_project(files)

kinds = Counter(str(getattr(e.kind, "value", e.kind)) for e in result.elements.values())
print(f"{len(files)} files, {len(result.elements)} elements")
for kind, n in sorted(kinds.items()):
    print(f"  {kind}: {n}")

warnings = [("", w) for w in result.warnings] + [
    (fid, w) for fid, ws in result.file_warnings.items() for w in ws
]
for fid, w in warnings:
    print(f"WARNING {fid}: {w}" if fid else f"WARNING {w}")

realization = derive_realization(result.elements)
findings = realization.findings  # already sorted by code and id
for f in findings:
    print(f"REALIZATION {f.code} {f.element_id}: {f.message}")
if realization.in_scope or findings:
    print(f"realization: {len(realization.in_scope)} use cases in scope, {len(findings)} findings")
sys.exit(1 if warnings or findings else 0)
