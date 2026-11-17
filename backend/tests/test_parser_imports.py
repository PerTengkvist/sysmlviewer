"""Imports: owner namespaces and endpoint resolution through imports."""

from __future__ import annotations

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile


def _parse(text: str):
    return SubsetSysmlParser().parse(text, "f")


def test_import_in_package_records_owner():
    r = _parse("package App { private import Lib::*; }")
    assert r.imports == [
        {"fileId": "f", "visibility": "private", "path": "Lib::*", "line": 1, "ownerId": "App"}
    ]


def test_file_level_import_has_no_owner():
    r = _parse("private import Lib::*;\npackage App {}")
    assert r.imports[0]["ownerId"] is None


def test_nested_import_records_inner_owner():
    r = _parse("package Root { package App { import Lib::Sub; } }")
    assert r.imports[0]["ownerId"] == "Root::App"
    assert r.imports[0]["visibility"] == "public"


def test_import_in_part_def_records_owner():
    r = _parse("package P { part def D { private import Lib::*; } }")
    assert r.imports[0]["ownerId"] == "P::D"


def test_recursive_import_paths_are_kept():
    r = _parse("package App { import Lib::**; import Lib::*::**; }")
    assert [i["path"] for i in r.imports] == ["Lib::**", "Lib::*::**"]


def test_parse_project_records_owner_for_both_files():
    files = [
        SysmlFile(id="a", name="a", content="package A { import X::*; }", path="a"),
        SysmlFile(id="b", name="b", content="import Y::*;\npackage B { private import Z::*; }", path="b"),
    ]
    r = SubsetSysmlParser().parse_project(files)
    assert [(i["fileId"], i["ownerId"]) for i in r.imports] == [
        ("a", "A"),
        ("b", None),
        ("b", "B"),
    ]
