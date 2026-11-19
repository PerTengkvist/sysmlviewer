"""Libraries under libraries/ are the canonical copies of what the examples use."""

from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser

REPO = Path(__file__).resolve().parents[2]
LIB = REPO / "libraries" / "failure_model.sysml"
EXAMPLE_COPY = REPO / "examples" / "electric_car" / "failure_model" / "failure_model.sysml"


def test_electric_car_copy_matches_the_canonical_library():
    assert EXAMPLE_COPY.read_bytes() == LIB.read_bytes(), (
        "examples/electric_car/failure_model/failure_model.sysml differs from "
        "libraries/failure_model.sysml; update both together"
    )


def test_failure_model_library_parses_cleanly_on_its_own():
    result = SubsetSysmlParser().parse(LIB.read_text(), "failure_model.sysml")
    assert result.warnings == []
    assert "FailureModel" in result.elements


def test_libraries_readme_lists_every_library_file():
    readme = (REPO / "libraries" / "README.md").read_text()
    for f in sorted((REPO / "libraries").glob("*.sysml")):
        assert f"`{f.name}`" in readme, f"{f.name} is not listed in libraries/README.md"
