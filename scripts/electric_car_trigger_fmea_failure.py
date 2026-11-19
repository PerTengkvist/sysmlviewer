"""Demo: make the FMEA data drift from the Electric Car model, then put it back.

    backend/.venv/bin/python scripts/electric_car_trigger_fmea_failure.py apply
    backend/.venv/bin/python scripts/fmea.py validate examples/electric_car      # now fails
    backend/.venv/bin/python scripts/electric_car_trigger_fmea_failure.py reset
    backend/.venv/bin/python scripts/fmea.py validate examples/electric_car      # green again

`apply` renames the part def PhysicalArchitecture::BatteryModule to BatteryCellModule in
physical_architecture/vehicle_physical.sysml, in both places (the declaration and the type of
batteryPack.modules). The SysML model stays valid; only fmea/library/battery_module.yaml
points at a name that no longer exists.

This script only knows the Electric Car model. It never touches version control: the original
bytes go to <project>/.sysmlviewer/fmea_trigger.json (a folder the repository ignores) and
checksums protect your own edits. `reset` puts back the .sysml file and state.json byte for
byte and never writes in views/*.json. Run it with the project closed in the viewer, or reload
the project after `reset`, because the viewer may rewrite state.json on a refresh.

Exit codes: 0 ok (also for "already applied" and "nothing to reset"), 1 refused, 2 usage.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DEFAULT_PROJECT = REPO / "examples" / "electric_car"
PROJECT_NAME = "Electric Car"
SYSML = "physical_architecture/vehicle_physical.sysml"
OLD, NEW = "BatteryModule", "BatteryCellModule"
OLD_ID = f"PhysicalArchitecture::{OLD}"
MARKER = ".sysmlviewer/fmea_trigger.json"
DURING = ".sysmlviewer/state.during-trigger.json"
VALIDATE = "backend/.venv/bin/python scripts/fmea.py validate"
SELF = "backend/.venv/bin/python scripts/electric_car_trigger_fmea_failure.py"

_WORD = re.compile(rb"\b" + OLD.encode() + rb"\b")
_DECL = b"part def " + OLD.encode()
_USE = b": " + OLD.encode()


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        if path.exists():
            os.chmod(tmp, path.stat().st_mode & 0o7777)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


class _Refuse(Exception):
    pass


class _Project:
    def __init__(self, path: Path) -> None:
        self.root = path
        self.shown = "examples/electric_car" if path.resolve() == DEFAULT_PROJECT.resolve() else str(path)
        self.flag = "" if path.resolve() == DEFAULT_PROJECT.resolve() else f" --project {path}"

    @property
    def sysml(self) -> Path:
        return self.root / SYSML

    @property
    def marker(self) -> Path:
        return self.root / MARKER

    def views(self) -> dict[str, str]:
        return {p.name: _sha(p.read_bytes()) for p in sorted((self.root / "views").glob("*.json"))}


def _check_project(p: _Project) -> None:
    try:
        manifest = json.loads((p.root / "project.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise _Refuse(f"{p.root} has no readable project.json; this script only works on the {PROJECT_NAME} example.")
    name = manifest.get("projektnamn") or manifest.get("name")
    if name != PROJECT_NAME:
        raise _Refuse(f"the project is named {name!r}; this script only works on the {PROJECT_NAME} example.")
    if not p.sysml.is_file():
        raise _Refuse(f"{SYSML} does not exist in {p.root}.")


def _mentions_new_name(p: _Project) -> list[str]:
    hits = []
    for f in sorted(p.root.rglob("*")):
        rel = f.relative_to(p.root)
        if not f.is_file() or ".sysmlviewer" in rel.parts or "docs" in rel.parts:
            continue
        if f.suffix == ".sysml" or (rel.parts[0] == "fmea" and f.suffix in (".yaml", ".yml")):
            if NEW.encode() in f.read_bytes():
                hits.append(rel.as_posix())
    return hits


def apply(p: _Project) -> int:
    if p.marker.exists():
        print("Already applied (marker .sysmlviewer/fmea_trigger.json). Nothing changed. Run 'reset' to undo.")
        return 0
    _check_project(p)
    original = p.sysml.read_bytes()
    problems = []
    found = len(_WORD.findall(original))
    if found != 2 or original.count(_DECL) != 1 or original.count(_USE) != 1:
        problems.append(
            f"{SYSML} mentions {OLD} {found} time(s); expected exactly 2 "
            f"(one 'part def {OLD}' and one ': {OLD}')."
        )
    problems += [f"{NEW} already exists in {h}." for h in _mentions_new_name(p)]
    if problems:
        raise _Refuse("\n".join(problems))
    changed = original.replace(_DECL, b"part def " + NEW.encode()).replace(_USE, b": " + NEW.encode())
    state_file = p.root / "state.json"
    marker = {
        "version": 1,
        "rename": {"from": OLD_ID, "to": f"PhysicalArchitecture::{NEW}"},
        "sysml": {
            "path": SYSML,
            "sha256_before": _sha(original),
            "sha256_after": _sha(changed),
            "original_b64": base64.b64encode(original).decode("ascii"),
        },
        "state": (
            {"sha256": _sha(state_file.read_bytes()), "content_b64": base64.b64encode(state_file.read_bytes()).decode("ascii")}
            if state_file.is_file() else None
        ),
        "views_sha256": p.views(),
    }
    _write_atomic(p.marker, (json.dumps(marker, indent=2) + "\n").encode("utf-8"))
    _write_atomic(p.sysml, changed)
    print(
        f"Applied: renamed part def {OLD_ID} -> {NEW}\n"
        f"  in {SYSML} (2 places: declaration and the type of batteryPack.modules).\n"
        "  The SysML model is still valid; the FMEA library fmea/library/battery_module.yaml "
        "now points at a name that no longer exists.\n"
        "Next:\n"
        f"  {VALIDATE} {p.shown}   # expected to fail\n"
        f"  {SELF} reset{p.flag}"
    )
    return 0


def reset(p: _Project) -> int:
    if not p.marker.exists():
        if p.sysml.is_file() and NEW.encode() in p.sysml.read_bytes():
            raise _Refuse(
                f"{SYSML} contains {NEW} but there is no marker .sysmlviewer/fmea_trigger.json, "
                "so the original is unknown. Rename it back by hand."
            )
        print("Nothing to reset: the model is in its original state.")
        return 0
    marker = json.loads(p.marker.read_text(encoding="utf-8"))
    info = marker["sysml"]
    current = p.sysml.read_bytes()
    now = _sha(current)
    if now not in (info["sha256_after"], info["sha256_before"]):
        raise _Refuse(
            f"{Path(SYSML).name} changed after apply; not overwriting your edits. "
            "The original is stored in .sysmlviewer/fmea_trigger.json."
        )
    notes = []
    if now == info["sha256_after"]:
        _write_atomic(p.sysml, base64.b64decode(info["original_b64"]))
    state = marker.get("state")
    state_file = p.root / "state.json"
    if state is not None:
        if not state_file.is_file() or _sha(state_file.read_bytes()) != state["sha256"]:
            if state_file.is_file():
                _write_atomic(p.root / DURING, state_file.read_bytes())
                notes.append(f"state.json changed while the trigger was applied; your version is saved in {DURING}.")
            _write_atomic(state_file, base64.b64decode(state["content_b64"]))
    drifted = [n for n, h in marker.get("views_sha256", {}).items() if p.views().get(n) != h]
    if drifted:
        notes.append(
            "warning: views/" + ", views/".join(drifted) + " changed since apply (a save in the viewer?). "
            "They were not touched."
        )
    p.marker.unlink()
    try:
        p.marker.parent.rmdir()
    except OSError:
        pass  # other files live there
    print(f"Reset: renamed part def {NEW} back to {OLD} in {SYSML}; state.json restored.")
    for n in notes:
        print(f"  {n}")
    print(f"Next:\n  {VALIDATE} {p.shown}   # expected to pass")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="electric_car_trigger_fmea_failure.py", description=__doc__.split("\n")[0])
    ap.add_argument("command", choices=("apply", "reset"))
    ap.add_argument("--project", default=str(DEFAULT_PROJECT), help="the Electric Car folder (for tests)")
    args = ap.parse_args(argv)
    p = _Project(Path(args.project))
    try:
        return (apply if args.command == "apply" else reset)(p)
    except _Refuse as exc:
        print(f"error: {exc}\nNothing was changed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
