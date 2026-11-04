"""Event log: one record shared by the log file, Python logging and the API."""

from __future__ import annotations

import io
import json
import logging
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.api.app import create_app
from adapters.persistence.event_log import (
    JsonlEventLog,
    configure_event_logging,
    format_event_line,
)
from helpers import add_content_file, api_url

SAMPLE = """\
package Sample {
  part def Box {
    part a;
  }

  view def BoxView : GeneralView {
    expose Box;
  }
}
"""


def _log_file(root: Path) -> Path:
    return root / ".sysmlviewer" / "events.jsonl"


def _file_events(root: Path) -> list[dict]:
    lines = _log_file(root).read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines]


def _setup_project(tmp_path: Path) -> tuple[TestClient, str, str]:
    client = TestClient(create_app(data_dir=tmp_path))
    project_id = client.post(api_url("/projects"), json={"name": "Log"}).json()["id"]
    add_content_file(client, project_id, tmp_path, "box.sysml", SAMPLE)
    project = client.get(api_url(f"/projects/{project_id}")).json()
    view_id = next(v["id"] for v in project["views"] if v["name"] == "BoxView")
    return client, project_id, view_id


def test_event_has_the_agreed_fields(tmp_path: Path):
    event = JsonlEventLog(tmp_path).record(
        "error",
        "parts.mismatch",
        "Parts differ",
        view_id="Pkg::V",
        view_name="V",
        details=[{"element": "part", "id": "Pkg::a"}],
    )

    assert set(event) == {
        "seq",
        "ts",
        "level",
        "code",
        "viewId",
        "viewName",
        "message",
        "details",
    }
    assert event["level"] == "error"
    assert event["viewName"] == "V"
    assert event["details"] == [{"element": "part", "id": "Pkg::a"}]


def test_events_are_appended_with_increasing_seq(tmp_path: Path):
    log = JsonlEventLog(tmp_path)

    log.record("info", "a", "first")
    log.record("info", "b", "second")

    assert [e["seq"] for e in _file_events(tmp_path)] == [1, 2]
    assert [e["code"] for e in log.read()] == ["a", "b"]


def test_read_after_returns_only_newer_events(tmp_path: Path):
    log = JsonlEventLog(tmp_path)
    log.record("info", "a", "first")
    log.record("info", "b", "second")

    assert [e["code"] for e in log.read(after=1)] == ["b"]


def test_seq_continues_after_restart(tmp_path: Path):
    JsonlEventLog(tmp_path).record("info", "a", "first")

    restarted = JsonlEventLog(tmp_path)
    event = restarted.record("info", "b", "second")

    assert event["seq"] == 2
    assert [e["code"] for e in restarted.read()] == ["a", "b"]


def test_unparsable_log_lines_are_skipped_on_load(tmp_path: Path):
    JsonlEventLog(tmp_path).record("info", "a", "first")
    with _log_file(tmp_path).open("a", encoding="utf-8") as handle:
        handle.write("{not json\n")

    assert [e["code"] for e in JsonlEventLog(tmp_path).read()] == ["a"]


def test_retention_keeps_latest_entries(tmp_path: Path):
    log = JsonlEventLog(tmp_path, max_events=3)

    for index in range(10):
        log.record("info", f"c{index}", "message")

    assert [e["code"] for e in log.read()] == ["c7", "c8", "c9"]
    assert len(_file_events(tmp_path)) < 6
    assert _file_events(tmp_path)[-1]["code"] == "c9"


def test_unwritable_log_falls_back_to_memory_and_reports_once(tmp_path: Path):
    (tmp_path / ".sysmlviewer").write_text("a file, not a folder", encoding="utf-8")
    log = JsonlEventLog(tmp_path)

    log.record("info", "a", "first")
    log.record("info", "b", "second")

    codes = [e["code"] for e in log.read()]
    assert codes.count("eventlog.unwritable") == 1
    assert "a" in codes and "b" in codes


def test_events_are_mirrored_to_logging(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
):
    log = JsonlEventLog(tmp_path)

    with caplog.at_level(logging.INFO, logger="sysmlviewer.events"):
        log.record(
            "error",
            "parts.mismatch",
            "Parts differ",
            details=[
                {
                    "element": "part",
                    "name": "a",
                    "field": "x",
                    "canvas": 1,
                    "saved": 2,
                    "source": "disk",
                }
            ],
        )

    [record] = caplog.records
    assert record.levelno == logging.ERROR
    assert "Parts differ" in record.getMessage()
    assert "part a: x canvas=1 saved=2 (disk)" in record.getMessage()


def test_format_event_line_without_details():
    line = format_event_line(
        {"code": "save.successful", "message": "Save successful", "details": []}
    )

    assert line == "save.successful: Save successful"


def test_configure_event_logging_writes_to_current_stdout_once(
    monkeypatch: pytest.MonkeyPatch,
):
    logger = logging.getLogger("sysmlviewer.events")
    before = list(logger.handlers)
    level = logger.level
    stream = io.StringIO()
    monkeypatch.setattr(sys, "stdout", stream)
    try:
        configure_event_logging()
        configure_event_logging()
        logger.info("hello")
    finally:
        logger.handlers[:] = before
        logger.setLevel(level)

    assert stream.getvalue().count("hello") == 1


def test_get_events_after_seq(tmp_path: Path):
    client, project_id, _ = _setup_project(tmp_path)
    url = api_url(f"/projects/{project_id}/events")
    client.post(url, json={"message": "first"})
    client.post(url, json={"message": "second"})

    events = client.get(url, params={"after": 1}).json()["events"]

    assert [e["message"] for e in events] == ["second"]


def test_post_client_event_is_stored_as_client_error(tmp_path: Path):
    client, project_id, view_id = _setup_project(tmp_path)

    response = client.post(
        api_url(f"/projects/{project_id}/events"),
        json={"message": "Reroute failed", "viewId": view_id, "viewName": "BoxView"},
    )

    event = response.json()
    assert (event["level"], event["code"]) == ("error", "client.error")
    assert _file_events(tmp_path) == [event]


def test_client_event_cannot_claim_a_backend_code(tmp_path: Path):
    client, project_id, _ = _setup_project(tmp_path)

    event = client.post(
        api_url(f"/projects/{project_id}/events"),
        json={"message": "x", "code": "save.successful", "level": "info"},
    ).json()

    assert event["code"] == "client.error"
    assert event["level"] == "error"


def test_events_are_per_workspace(tmp_path: Path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    client, project_id, _ = _setup_project(first)
    client.post(api_url(f"/projects/{project_id}/events"), json={"message": "first"})

    client.post(
        api_url("/session/create"), json={"name": "Other", "folder": str(second)}
    )

    url = api_url(f"/projects/{project_id}/events")
    assert client.get(url).json()["events"] == []


def test_corrupt_view_file_emits_event_once(tmp_path: Path):
    client, project_id, view_id = _setup_project(tmp_path)
    views = tmp_path / "views"
    views.mkdir(exist_ok=True)
    (views / "Broken.json").write_text("{not json", encoding="utf-8")

    client.get(api_url(f"/projects/{project_id}/views/{view_id}"))
    client.get(api_url(f"/projects/{project_id}/views/{view_id}"))

    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    corrupt = [e for e in events if e["code"] == "view.file.corrupt"]
    assert len(corrupt) == 1
    assert corrupt[0]["level"] == "error"
    assert "Broken.json" in corrupt[0]["message"]


def test_view_file_that_is_not_an_object_counts_as_corrupt(tmp_path: Path):
    client, project_id, view_id = _setup_project(tmp_path)
    views = tmp_path / "views"
    views.mkdir(exist_ok=True)
    (views / "List.json").write_text("[1, 2]", encoding="utf-8")

    response = client.get(api_url(f"/projects/{project_id}/views/{view_id}"))

    assert response.status_code == 200
    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    assert [e["code"] for e in events] == ["view.file.corrupt"]


def test_duplicate_view_files_emit_warning_once(tmp_path: Path):
    client, project_id, view_id = _setup_project(tmp_path)
    views = tmp_path / "views"
    views.mkdir(exist_ok=True)
    for name in ("One.json", "Two.json"):
        (views / name).write_text(
            json.dumps({"viewId": view_id, "nodes": {}, "edges": {}}),
            encoding="utf-8",
        )

    client.get(api_url(f"/projects/{project_id}/views/{view_id}"))
    client.get(api_url(f"/projects/{project_id}/views/{view_id}"))

    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    [duplicate] = [e for e in events if e["code"] == "view.file.duplicate"]
    assert duplicate["level"] == "warning"
    assert "One.json" in duplicate["message"]
    assert "Two.json" in duplicate["message"]


@pytest.mark.parametrize(
    ("failure", "code"),
    [
        (PermissionError(13, "Permission denied", "views/Box.json"), "file.permissions.denied"),
        (OSError("disk full"), "save.failed"),
    ],
)
def test_failed_patch_is_logged(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure: OSError,
    code: str,
):
    from adapters.persistence.workspace_repo import WorkspaceProjectRepository

    client, project_id, view_id = _setup_project(tmp_path)

    def fail(*_args: object, **_kwargs: object) -> None:
        raise failure

    monkeypatch.setattr(WorkspaceProjectRepository, "save_view_layout", fail)

    client.patch(
        api_url(f"/projects/{project_id}/visualization"),
        json={"viewId": view_id, "nodes": {"Sample::Box::a": {"x": 5, "y": 6}}},
    )

    events = client.get(api_url(f"/projects/{project_id}/events")).json()["events"]
    [event] = [e for e in events if e["code"] == code]
    assert event["level"] == "error"
    assert event["viewId"] == view_id
    assert event["viewName"] == "BoxView"
