"""Native folder/file picker for local desktop use."""

from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path
from typing import Literal


def pick_path(*, kind: Literal["folder", "file"], title: str) -> str | None:
    """Open the OS file dialog; return absolute path or None if cancelled."""
    system = platform.system()
    if system == "Darwin":
        return _pick_path_macos(kind=kind, title=title)
    if system == "Linux":
        return _pick_path_linux(kind=kind, title=title)
    if system == "Windows":
        return _pick_path_windows(kind=kind, title=title)
    return _pick_path_tkinter(kind=kind, title=title)


def pick_save_path(
    *,
    title: str,
    default_dir: str | None = None,
    default_name: str = "view.json",
) -> str | None:
    """Open a Save As dialog; return absolute path or None if cancelled."""
    system = platform.system()
    if system == "Darwin":
        return _pick_save_macos(
            title=title, default_dir=default_dir, default_name=default_name
        )
    if system == "Linux":
        return _pick_save_linux(
            title=title, default_dir=default_dir, default_name=default_name
        )
    if system == "Windows":
        return _pick_save_windows(
            title=title, default_dir=default_dir, default_name=default_name
        )
    return _pick_save_tkinter(
        title=title, default_dir=default_dir, default_name=default_name
    )


def _pick_save_macos(
    *, title: str, default_dir: str | None, default_name: str
) -> str | None:
    safe_title = title.replace('"', '\\"')
    safe_name = default_name.replace('"', '\\"')
    lines = [f'set theChoice to choose file name with prompt "{safe_title}"']
    if default_dir:
        safe_dir = default_dir.replace('"', '\\"')
        lines[0] += (
            f' default name "{safe_name}" '
            f'default location (POSIX file "{safe_dir}")'
        )
    else:
        lines[0] += f' default name "{safe_name}"'
    lines.append("return POSIX path of theChoice")
    result = subprocess.run(
        ["osascript", "-e", "\n".join(lines)],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()
        if _is_user_cancel(err):
            return None
        raise RuntimeError(err or "macOS save dialog failed")
    path = result.stdout.strip()
    return path or None


def _pick_save_linux(
    *, title: str, default_dir: str | None, default_name: str
) -> str | None:
    default_path = str(Path(default_dir or ".") / default_name)
    if _command_exists("zenity"):
        cmd = [
            "zenity",
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--title",
            title,
            "--filename",
            default_path,
            "--file-filter=JSON | *.json",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            return None
        path = result.stdout.strip()
        return path or None
    if _command_exists("kdialog"):
        cmd = [
            "kdialog",
            "--getsavefilename",
            default_path,
            "*.json",
            "--title",
            title,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            return None
        path = result.stdout.strip()
        return path or None
    return _pick_save_tkinter(
        title=title, default_dir=default_dir, default_name=default_name
    )


def _pick_save_windows(
    *, title: str, default_dir: str | None, default_name: str
) -> str | None:
    safe_title = title.replace("'", "''")
    safe_name = default_name.replace("'", "''")
    safe_dir = (default_dir or "").replace("'", "''")
    ps = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$d = New-Object System.Windows.Forms.SaveFileDialog; "
        f"$d.Title = '{safe_title}'; "
        f"$d.FileName = '{safe_name}'; "
        "$d.Filter = 'JSON (*.json)|*.json|All files (*.*)|*.*'; "
        "$d.AddExtension = $true; "
        "$d.DefaultExt = 'json'; "
    )
    if safe_dir:
        ps += f"$d.InitialDirectory = '{safe_dir}'; "
    ps += "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.FileName }"
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    path = result.stdout.strip()
    return path or None


def _pick_save_tkinter(
    *, title: str, default_dir: str | None, default_name: str
) -> str | None:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise RuntimeError(
            "Native save dialog unavailable on this system"
        ) from exc

    try:
        root = tk.Tk()
    except tk.TclError as exc:
        raise RuntimeError(
            "Native save dialog unavailable: Tcl/Tk is not installed for this Python"
        ) from exc

    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    root.update_idletasks()
    try:
        selected = filedialog.asksaveasfilename(
            title=title,
            initialdir=default_dir or None,
            initialfile=default_name,
            defaultextension=".json",
            filetypes=[("JSON", "*.json"), ("All files", "*.*")],
        )
        if not selected:
            return None
        return str(selected)
    finally:
        root.destroy()


def _pick_path_macos(*, kind: Literal["folder", "file"], title: str) -> str | None:
    safe_title = title.replace('"', '\\"')
    if kind == "folder":
        script = (
            f'set theChoice to choose folder with prompt "{safe_title}"\n'
            "return POSIX path of theChoice"
        )
    else:
        script = (
            f'set theChoice to choose file with prompt "{safe_title}" '
            'of type {"json", "public.json"}\n'
            "return POSIX path of theChoice"
        )
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip()
        if _is_user_cancel(err):
            return None
        raise RuntimeError(err or "macOS file dialog failed")
    path = result.stdout.strip()
    return path or None


def _pick_path_linux(*, kind: Literal["folder", "file"], title: str) -> str | None:
    if _command_exists("zenity"):
        if kind == "folder":
            cmd = ["zenity", "--file-selection", "--directory", "--title", title]
        else:
            cmd = [
                "zenity",
                "--file-selection",
                "--title",
                title,
                "--file-filter=Project JSON | *.json",
            ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            return None
        path = result.stdout.strip()
        return path or None
    if _command_exists("kdialog"):
        if kind == "folder":
            cmd = ["kdialog", "--getexistingdirectory", ".", "--title", title]
        else:
            cmd = ["kdialog", "--getopenfilename", ".", "*.json", "--title", title]
        result = subprocess.run(cmd, capture_output=True, text=True, check=False)
        if result.returncode != 0:
            return None
        path = result.stdout.strip()
        return path or None
    return _pick_path_tkinter(kind=kind, title=title)


def _pick_path_windows(*, kind: Literal["folder", "file"], title: str) -> str | None:
    safe_title = title.replace("'", "''")
    if kind == "folder":
        ps = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            f"$d.Description = '{safe_title}'; "
            "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.SelectedPath }"
        )
    else:
        ps = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d = New-Object System.Windows.Forms.OpenFileDialog; "
            f"$d.Title = '{safe_title}'; "
            "$d.Filter = 'Project JSON (*.json)|*.json|All files (*.*)|*.*'; "
            "if ($d.ShowDialog() -eq 'OK') { Write-Output $d.FileName }"
        )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    path = result.stdout.strip()
    return path or None


def _pick_path_tkinter(*, kind: Literal["folder", "file"], title: str) -> str | None:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except ImportError as exc:
        raise RuntimeError(
            "Native file dialog unavailable on this system (install zenity/kdialog on Linux "
            "or use a Python build with Tcl/Tk)"
        ) from exc

    try:
        root = tk.Tk()
    except tk.TclError as exc:
        raise RuntimeError(
            "Native file dialog unavailable: Tcl/Tk is not installed for this Python "
            "(on macOS the app uses AppleScript instead; restart the backend after update)"
        ) from exc

    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    root.update_idletasks()
    try:
        if kind == "folder":
            selected = filedialog.askdirectory(title=title, mustexist=True)
        else:
            selected = filedialog.askopenfilename(
                title=title,
                filetypes=[
                    ("Project JSON", "*.json"),
                    ("All files", "*.*"),
                ],
            )
        if not selected:
            return None
        return str(selected)
    finally:
        root.destroy()


def _command_exists(name: str) -> bool:
    from shutil import which

    return which(name) is not None


def _is_user_cancel(message: str) -> bool:
    lowered = message.lower()
    return (
        "user canceled" in lowered
        or "user cancelled" in lowered
        or "(-128)" in message
    )
