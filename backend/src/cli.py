"""Command-line entry for SysML Viewer API."""

from __future__ import annotations

import argparse
import os
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="sysmlviewer-api", description="SysML Viewer API")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "-f",
        "--folder",
        dest="folder",
        help="Workspace folder (project.json at folder root if present)",
    )
    group.add_argument(
        "-p",
        "--project",
        dest="project_file",
        help="Path to project.json (parent folder becomes workspace)",
    )
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5174)
    parser.add_argument("--reload", action="store_true", default=False)
    return parser.parse_args(argv)


def resolve_startup(
    *,
    folder: str | None,
    project_file: str | None,
) -> tuple[Path | None, Path | None]:
    """Validate -f/-p and return (workspace, project_file)."""
    if folder and project_file:
        raise ValueError("Use only one of -f or -p")
    if project_file:
        pf = Path(project_file).expanduser().resolve()
        if not pf.is_file():
            raise FileNotFoundError(f"Project file not found: {pf}")
        return pf.parent, pf
    if folder:
        ws = Path(folder).expanduser().resolve()
        if not ws.is_dir():
            raise FileNotFoundError(f"Workspace folder not found: {ws}")
        return ws, None
    return None, None


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    workspace, project_file = resolve_startup(
        folder=args.folder,
        project_file=args.project_file,
    )
    if workspace is not None:
        os.environ["SYSMLVIEWER_FOLDER"] = str(workspace)
    else:
        os.environ.pop("SYSMLVIEWER_FOLDER", None)
    if project_file is not None:
        os.environ["SYSMLVIEWER_PROJECT"] = str(project_file)
    else:
        os.environ.pop("SYSMLVIEWER_PROJECT", None)

    import uvicorn

    uvicorn.run(
        "adapters.api.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
