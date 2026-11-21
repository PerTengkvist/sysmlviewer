"""A one-file parse cannot see other files, so it does not warn about their types."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile


def test_single_file_does_not_warn_for_qualified_foreign_type():
    text = "package D { occurrence def S { ref part car : LogicalArchitecture::Car; } }"
    assert SubsetSysmlParser().parse(text, "f").warnings == []


def test_single_file_does_not_warn_when_an_import_may_supply_it():
    text = "package D { private import L::*; occurrence def S { ref part k : KeyFob; } }"
    assert SubsetSysmlParser().parse(text, "f").warnings == []


def test_single_file_still_warns_for_local_typo():
    text = "package D { part def KeyFob; part k : KeyFb; }"
    warnings = SubsetSysmlParser().parse(text, "f").warnings
    assert any("Type reference 'KeyFb' for 'k' could not be resolved" in w for w in warnings)


def test_project_parse_still_warns():
    files = [SysmlFile(id="f", name="f", content="package D { part k : Nowhere; }")]
    warnings = SubsetSysmlParser().parse_project(files).warnings
    assert any("Type reference 'Nowhere' for 'k' could not be resolved" in w for w in warnings)
    qualified = [
        SysmlFile(id="f", name="f", content="package D { part k : Nowhere::T; }")
    ]
    assert SubsetSysmlParser().parse_project(qualified).warnings


