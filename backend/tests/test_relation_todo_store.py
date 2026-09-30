import json
from pathlib import Path

import pytest

from adapters.persistence.relation_todo_store import RelationTodoStore


def test_empty_file_returns_empty_list(tmp_path: Path):
    store = RelationTodoStore(tmp_path)
    assert store.load() == []


def test_append_assigns_increasing_ids(tmp_path: Path):
    store = RelationTodoStore(tmp_path)
    a = store.append(
        {
            "action": "add",
            "original": "",
            "filepath": "a.sysml",
            "rownumber": 0,
            "source": "A",
            "target": "B",
            "type": "dependency",
            "new_def": "dependency A to B;",
        }
    )
    b = store.append(
        {
            "action": "add",
            "original": "",
            "filepath": "a.sysml",
            "rownumber": 0,
            "source": "B",
            "target": "C",
            "type": "flow",
            "new_def": "flow B to C;",
        }
    )
    assert a["id"] == 1
    assert b["id"] == 2
    assert store.load() == [a, b]


def test_roundtrip_fields(tmp_path: Path):
    store = RelationTodoStore(tmp_path)
    store.append(
        {
            "action": "change",
            "original": "dependency A to B;",
            "filepath": "pkg/a.sysml",
            "rownumber": 12,
            "source": "A",
            "target": "C",
            "type": "dependency",
            "new_def": "dependency A to C;",
            "relationId": "P::d1",
        }
    )
    raw = json.loads(store.path.read_text(encoding="utf-8"))
    assert raw[0]["filepath"] == "pkg/a.sysml"
    assert raw[0]["rownumber"] == 12
    assert raw[0]["type"] == "dependency"


def test_rejects_invalid_type(tmp_path: Path):
    store = RelationTodoStore(tmp_path)
    with pytest.raises(ValueError):
        store.append(
            {
                "action": "add",
                "original": "",
                "filepath": "a.sysml",
                "rownumber": 0,
                "source": "A",
                "target": "B",
                "type": "realization",
                "new_def": "x",
            }
        )


def test_add_then_delete_clears(tmp_path: Path):
    store = RelationTodoStore(tmp_path)
    store.append(
        {
            "action": "add",
            "original": "",
            "filepath": "a.sysml",
            "rownumber": 0,
            "source": "A",
            "target": "B",
            "type": "dependency",
            "new_def": "dependency A to B;",
        }
    )
    store.append(
        {
            "action": "delete",
            "original": "",
            "filepath": "a.sysml",
            "rownumber": 0,
            "source": "A",
            "target": "B",
            "type": "dependency",
            "new_def": "",
        }
    )
    assert store.load() == []


def test_two_changes_merge(tmp_path: Path):
    store = RelationTodoStore(tmp_path)
    store.append(
        {
            "action": "change",
            "original": "dependency A to B;",
            "filepath": "a.sysml",
            "rownumber": 3,
            "source": "A",
            "target": "B",
            "type": "dependency",
            "new_def": "dependency A to B;",
            "relationId": "rel1",
        }
    )
    store.append(
        {
            "action": "change",
            "original": "should-not-overwrite",
            "filepath": "a.sysml",
            "rownumber": 3,
            "source": "A",
            "target": "C",
            "type": "dependency",
            "new_def": "dependency A to C;",
            "relationId": "rel1",
        }
    )
    items = store.load()
    assert len(items) == 1
    assert items[0]["original"] == "dependency A to B;"
    assert items[0]["new_def"] == "dependency A to C;"
    assert items[0]["target"] == "C"
