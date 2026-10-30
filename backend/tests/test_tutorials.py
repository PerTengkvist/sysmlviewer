from pathlib import Path

from adapters.api.static_paths import resolve_repo_root

TUTORIALS = {
    "sysml-v2.md": [
        "# Introduction to SysML v2",
        "Why SysML v2",
        "Relation to UML",
        "Why SysML Viewer",
    ],
    "cheatsheet.md": [
        "# SysML v2 Cheatsheet",
        "Packages",
        "Parts",
        "Attributes",
        "Views",
        "Connections",
        "Dependencies",
        "Requirements",
        "Use cases",
        "Sequences",
        "#reply message",
    ],
    "use-cases-and-scenarios.md": [
        "# Use Cases and Scenarios",
        "Self-contained use case",
        "CaseScenario",
        "Action as a scenario",
        "Sequences",
        "then #reply message",
    ],
    "mbse.md": [
        "# Introduction to MBSE",
        "What is MBSE",
        "Requirements/",
        "Functions/",
        "UseCases/",
        "LogicalArchitecture/",
        "Dynamics/",
        "PhysicalArchitecture/",
    ],
}


def test_tutorial_files_exist_with_headings():
    root = resolve_repo_root() / "docs" / "tutorials"
    for name, headings in TUTORIALS.items():
        path = root / name
        assert path.is_file(), f"missing {path}"
        text = path.read_text(encoding="utf-8")
        for h in headings:
            assert h in text, f"{name} missing heading/snippet {h!r}"
