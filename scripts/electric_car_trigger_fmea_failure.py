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
_DECL = re.compile(rb"part def " + OLD.encode() + rb"\b")
_USE = re.compile(rb"(?<!:): " + OLD.encode() + rb"\b")
LIBRARY = "fmea/library/battery_module.yaml"
REVERT_HINT = (
    f"To get back: rename {NEW} back to {OLD} in {SYSML} by hand and delete .sysmlviewer/fmea_trigger.json. "
    "The original file is stored in that marker (original_b64, base64)."
)


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


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


def _read(path: Path, rel: str) -> bytes:
    try:
        return path.read_bytes()
    except OSError:
        raise _Refuse(f"{rel} cannot be read ({path}).")


class _Project:
    def __init__(self, path: Path) -> None:
        self.root = path
        default = path.resolve() == DEFAULT_PROJECT.resolve()
        self.shown = "examples/electric_car" if default else str(path)
        self.flag = "" if default else f" --project {path}"

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
        name = manifest.get("projektnamn") or manifest.get("name")
    except (OSError, ValueError, AttributeError):
        raise _Refuse(f"{p.root} has no readable project.json; this script only works on the {PROJECT_NAME} example.")
    if name != PROJECT_NAME:
        raise _Refuse(f"the project is named {name!r}; this script only works on the {PROJECT_NAME} example.")
    for rel in (SYSML, LIBRARY):
        if not (p.root / rel).is_file():
            raise _Refuse(f"{rel} does not exist in {p.root}; this script needs the {PROJECT_NAME} example.")


def _project_files(p: _Project, suffixes: tuple[str, ...], top: str | None = None):
    for f in sorted(p.root.rglob("*")):
        rel = f.relative_to(p.root)
        if not f.is_file() or ".sysmlviewer" in rel.parts or "docs" in rel.parts or f.suffix not in suffixes:
            continue
        if top is None or rel.parts[0] == top:
            yield f, rel.as_posix()


def _mentions_new_name(p: _Project) -> list[str]:
    hits = []
    for suffixes, top in (((".sysml",), None), (((".yaml", ".yml")), "fmea")):
        hits += [rel for f, rel in _project_files(p, suffixes, top) if NEW.encode() in f.read_bytes()]
    return hits


def _load_marker(p: _Project) -> dict:
    """The marker, or a _Refuse that says it is unusable (never a traceback)."""
    try:
        marker = json.loads(p.marker.read_text(encoding="utf-8"))
        info = marker["sysml"]
        for key in ("sha256_before", "sha256_after"):
            if not isinstance(info[key], str):
                raise TypeError(key)
        base64.b64decode(info["original_b64"], validate=True)
        for key in ("state", "project"):
            if marker[key] is not None:
                base64.b64decode(marker[key]["content_b64"], validate=True)
                str(marker[key]["sha256"])
        str(marker["library_sha256"])
        dict(marker["views_sha256"])
        if marker["version"] != 2:
            raise ValueError("version")
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        raise _Refuse(
            f"the marker .sysmlviewer/fmea_trigger.json is unreadable or incomplete. {REVERT_HINT}"
        ) from None
    return marker


def _file_record(path: Path) -> dict | None:
    if not path.is_file():
        return None
    data = path.read_bytes()
    return {"sha256": _sha(data), "content_b64": _b64(data)}


def apply(p: _Project) -> int:
    if p.marker.exists():
        marker = _load_marker(p)
        now = _sha(_read(p.sysml, SYSML))
        if now == marker["sysml"]["sha256_after"]:
            print("Already applied (marker .sysmlviewer/fmea_trigger.json). Nothing changed. Run 'reset' to undo.")
            return 0
        if now == marker["sysml"]["sha256_before"]:
            raise _Refuse(
                f"the marker .sysmlviewer/fmea_trigger.json exists, but {SYSML} is back to its original content "
                "(an interrupted apply, or you restored the file). Run reset to remove the marker, then apply again."
            )
        raise _Refuse(
            f"the marker .sysmlviewer/fmea_trigger.json exists, but {SYSML} changed after apply, so it is neither "
            f"the original nor the applied state. {REVERT_HINT}"
        )
    _check_project(p)
    original = _read(p.sysml, SYSML)
    problems = []
    found = len(_WORD.findall(original))
    if found != 2 or len(_DECL.findall(original)) != 1 or len(_USE.findall(original)) != 1:
        problems.append(
            f"{SYSML} mentions {OLD} {found} time(s); expected exactly 2 "
            f"(one 'part def {OLD}' and one ': {OLD}')."
        )
    for f, rel in _project_files(p, (".sysml",)):
        if rel != SYSML and _WORD.search(f.read_bytes()):
            problems.append(f"{rel} also mentions {OLD}; renaming only {SYSML} would break the model.")
    problems += [f"{NEW} already exists in {h}." for h in _mentions_new_name(p)]
    if problems:
        raise _Refuse("\n".join(problems))
    changed = _USE.sub(b": " + NEW.encode(), _DECL.sub(b"part def " + NEW.encode(), original))
    marker = {
        "version": 2,
        "rename": {"from": OLD_ID, "to": f"PhysicalArchitecture::{NEW}"},
        "sysml": {
            "path": SYSML,
            "sha256_before": _sha(original),
            "sha256_after": _sha(changed),
            "original_b64": _b64(original),
        },
        "state": _file_record(p.root / "state.json"),
        "project": _file_record(p.root / "project.json"),
        "library_sha256": _sha((p.root / LIBRARY).read_bytes()),
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


def _restore(p: _Project, name: str, record: dict | None, notes: list[str], restored: list[str]) -> None:
    """Put back project.json or state.json byte for byte; keep a changed state.json aside."""
    path = p.root / name
    if record is None:
        if path.is_file():
            notes.append(f"{name} did not exist when the trigger was applied and was created since; left as it is.")
        return
    current = path.read_bytes() if path.is_file() else None
    if current is not None and _sha(current) == record["sha256"]:
        return
    if current is not None and name == "state.json":
        _write_atomic(p.root / DURING, current)
        notes.append(f"state.json changed while the trigger was applied; your version is saved in {DURING}.")
    _write_atomic(path, base64.b64decode(record["content_b64"]))
    restored.append(name)


def reset(p: _Project) -> int:
    if not p.marker.exists():
        if p.sysml.is_file() and NEW.encode() in p.sysml.read_bytes():
            raise _Refuse(
                f"{SYSML} contains {NEW} but there is no marker .sysmlviewer/fmea_trigger.json, "
                "so the original is unknown. Rename it back by hand."
            )
        print("Nothing to reset: the model is in its original state.")
        return 0
    marker = _load_marker(p)
    info = marker["sysml"]
    now = _sha(_read(p.sysml, SYSML))
    if now not in (info["sha256_after"], info["sha256_before"]):
        raise _Refuse(
            f"{Path(SYSML).name} changed after apply; not overwriting your edits. "
            f"The original is stored in .sysmlviewer/fmea_trigger.json. {REVERT_HINT}"
        )
    library = p.root / LIBRARY
    if not library.is_file() or _sha(library.read_bytes()) != marker["library_sha256"]:
        raise _Refuse(
            f"{LIBRARY} changed after apply: you updated the FMEA data to the new name. Reset would rename the "
            f"part def back to {OLD} and leave the data pointing at {NEW}, which breaks the FMEA again. "
            f"Either revert {LIBRARY} (set part_def back to {OLD_ID}) and run reset again, "
            f"or keep your fix and delete .sysmlviewer/fmea_trigger.json."
        )
    notes: list[str] = []
    restored: list[str] = []
    if now == info["sha256_after"]:
        _write_atomic(p.sysml, base64.b64decode(info["original_b64"]))
    _restore(p, "state.json", marker["state"], notes, restored)
    _restore(p, "project.json", marker["project"], notes, restored)
    drifted = [n for n, h in marker["views_sha256"].items() if p.views().get(n) != h]
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
    print(f"Reset: renamed part def {NEW} back to {OLD} in {SYSML}.")
    if restored:
        print(f"  Restored byte for byte: {', '.join(restored)} (the viewer rewrites them while the project is open).")
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
