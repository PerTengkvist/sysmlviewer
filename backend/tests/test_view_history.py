from pathlib import Path

from domain.view_history import ViewHistory, go_back, record_view
from adapters.persistence.view_history_store import ViewHistoryStore


def test_record_and_isolate_sessions(tmp_path: Path):
    store = ViewHistoryStore(tmp_path)
    h = ViewHistory()
    for vid in ["v1", "v2", "v3"]:
        h = record_view(h, vid)
    store.save("sess-a", h)

    other = store.load("sess-b")
    assert other.last_view_id is None
    assert other.previous == []

    loaded = store.load("sess-a")
    assert loaded.last_view_id == "v3"
    assert loaded.previous == ["v1", "v2"]


def test_keeps_only_five_previous():
    h = ViewHistory()
    for i in range(1, 8):
        h = record_view(h, f"v{i}")
    assert h.last_view_id == "v7"
    assert h.previous == ["v2", "v3", "v4", "v5", "v6"]


def test_consecutive_duplicate_ignored():
    h = record_view(ViewHistory(), "v1")
    h = record_view(h, "v1")
    assert h.last_view_id == "v1"
    assert h.previous == []


def test_go_back_returns_previous():
    h = ViewHistory()
    for vid in ["v1", "v2", "v3"]:
        h = record_view(h, vid)
    h, target = go_back(h)
    assert target == "v2"
    assert h.last_view_id == "v2"
    assert h.previous == ["v1"]


def test_go_back_empty_history():
    h, target = go_back(ViewHistory())
    assert target is None
    assert h.last_view_id is None
