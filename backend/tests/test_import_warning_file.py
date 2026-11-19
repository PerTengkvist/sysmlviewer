"""Import warnings belong to the file that holds the import, not to the first file."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import SysmlFile


def _files(*pairs):
    return [SysmlFile(id=n, name=n, content=c, path=n) for n, c in pairs]


def test_package_not_found_is_filed_under_the_importing_file():
    result = SubsetSysmlParser().parse_project(
        _files(
            ("a_first.sysml", "package First { part x; }"),
            ("b_user.sysml", "package User {\n  private import Missing::*;\n  part y;\n}"),
        )
    )
    expected = "line 2: import 'Missing::*' — package not found"
    assert expected in result.file_warnings["b_user.sysml"]
    assert expected not in result.file_warnings.get("a_first.sysml", [])
    assert result.warnings.count(expected) == 1


def test_symbol_not_found_is_filed_under_the_importing_file():
    result = SubsetSysmlParser().parse_project(
        _files(
            ("a_first.sysml", "package First { part x; }"),
            ("b_user.sysml", "package User {\n  part y;\n  private import First::nope;\n}"),
        )
    )
    expected = "line 3: import 'First::nope' — symbol not found"
    assert expected in result.file_warnings["b_user.sysml"]
    assert expected not in result.file_warnings.get("a_first.sysml", [])


def test_single_file_parse_does_not_warn_about_imports_from_other_files():
    # A single file cannot see the rest of the project, so a missing package is not an error there.
    result = SubsetSysmlParser().parse("package User {\n  private import Missing::*;\n}", "only.sysml")
    assert not any("package not found" in w for w in result.warnings)
