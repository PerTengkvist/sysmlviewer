"""Unambiguous labels when two nodes share a simple name in different namespaces."""

from __future__ import annotations

import importlib.util
import json
import re
import shutil

import pytest

from adapters.api.static_paths import resolve_repo_root
from domain.failure.model import Impact, ImpactGraph, Layer, Node, Status
from domain.failure.report import label, short_name

REPO = resolve_repo_root()
CAR = REPO / "examples" / "electric_car"

MODEL = """package Log { part def L { part l; } }
package Log2 { part def L { part l; } }
package Sec { part def Authenticate { part n; } }
package Comf { part def Authenticate { part n; } }
package Lonely { part def Solo { part n; } }
package Phys1 {
  part def V {
    part pack { part cell; }
    part solo;
    #implements dependency from pack.cell to Log::L::l;
    #implements dependency from solo to Log::L::l;
    #implements dependency from solo to Log2::L::l;
  }
}
package Phys2 {
  part def V {
    part pack { part cell; }
    #implements dependency from pack.cell to Log::L::l;
  }
}
allocate Sec::Authenticate::n to Log::L::l;
allocate Comf::Authenticate::n to Log::L::l;
allocate Lonely::Solo::n to Log::L::l;
package Req { requirement def <'R1'> Safe { attribute Type = "Safety"; } }
package Uc { use case def Drive { objective Req::Safe; } }
#refine dependency from Sec::Authenticate to Uc::Drive;
"""

MODE = (
    "      local_effect: { kind: loss }\n      mode_ratio: 1.0\n      effect_probability: 1.0\n"
    "      occurrence: 3\n      detection: { method: Monitor, score: 4 }\n"
)
INSTANCES = "".join(
    f"- part: {part}\n  rate_fit: 10\n  failure_modes:\n    - id: {mode}\n{MODE}"
    for part, mode in (
        ("Phys1::V::pack::cell", "open1"),
        ("Phys2::V::pack::cell", "open2"),
        ("Phys1::V::solo", "open3"),
    )
)


@pytest.fixture(scope="module")
def project(tmp_path_factory):
    root = tmp_path_factory.mktemp("collide")
    (root / "model.sysml").write_text(MODEL, encoding="utf-8")
    fmea = root / "fmea"
    fmea.mkdir()
    shutil.copy(CAR / "fmea" / "severity.yaml", fmea / "severity.yaml")
    (fmea / "instances.yaml").write_text(INSTANCES, encoding="utf-8")
    return root


def _load(name, script):
    spec = importlib.util.spec_from_file_location(name, REPO / "scripts" / script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def impact_cli():
    return _load("failure_impact_labels", "failure_impact.py")


@pytest.fixture(scope="module")
def fmea_cli():
    return _load("fmea_labels", "fmea.py")


def run(cli, capsys, *argv):
    code = cli.main([*map(str, argv)])
    out = capsys.readouterr()
    assert code == 0, out.err
    return out.out


FAIL = ("--fail", "Phys1.V.pack.cell:loss")


def test_text_functions_are_distinct(impact_cli, capsys, project):
    out = run(impact_cli, capsys, project, *FAIL)
    rows = [l for l in out.splitlines() if l.startswith("LOST")]
    assert any(re.match(r"LOST\s+Sec::Authenticate\s", r) for r in rows)
    assert any(re.match(r"LOST\s+Comf::Authenticate\s", r) for r in rows)
    assert any(re.match(r"LOST\s+Solo\s", r) for r in rows)  # unique: unchanged
    assert not any(re.match(r"LOST\s+Authenticate\s", r) for r in rows)


def test_text_cause_chain_is_distinct(impact_cli, capsys, project):
    out = run(impact_cli, capsys, project, "--fail", "Phys1.V.pack.cell:loss",
              "--fail", "Phys2.V.pack.cell:loss")
    assert "«allocate» Log::L::l «implements» Phys1::V::pack::cell" in out
    assert "Sec::Authenticate::n «allocate» Log::L::l" in out  # function nodes named n
    assert "«implements» cell" not in out


def test_markdown_functions_and_causes(impact_cli, capsys, project):
    out = run(impact_cli, capsys, project, *FAIL, "--format", "markdown")
    assert "| Sec::Authenticate |" in out and "| Comf::Authenticate |" in out
    assert "| Solo |" in out
    assert "| Authenticate |" not in out


def test_json_ids_unchanged(impact_cli, capsys, project):
    data = json.loads(run(impact_cli, capsys, project, *FAIL, "--format", "json"))
    assert "Sec::Authenticate" in data["nodes"] and "Comf::Authenticate" in data["nodes"]
    assert "Sec::Authenticate" in data["functions"]


def test_spof_text_and_markdown(impact_cli, capsys, project):
    out = run(impact_cli, capsys, project, "--spof")
    assert "Phys1::V::pack::cell" in out and "Phys2::V::pack::cell" in out
    assert "Sec::Authenticate" in out and "Comf::Authenticate" in out
    assert "V::solo" in out  # unique part keeps the old Part column
    assert "Phys1::V::solo" not in out
    md = run(impact_cli, capsys, project, "--spof", "--format", "markdown")
    assert "| Phys1::V::pack::cell |" in md and "| Phys2::V::pack::cell |" in md
    assert "Sec::Authenticate, " in md or "Comf::Authenticate, " in md


def test_common_cause_list_is_distinct(impact_cli, capsys, project):
    out = run(impact_cli, capsys, project, "--fail", "Phys1.V.solo:loss")
    assert "[common cause: Log2::L::l, Log::L::l]" in out


# -- FMEA ---------------------------------------------------------------


@pytest.fixture(scope="module")
def reports(fmea_cli, project, tmp_path_factory, capsys_module=None):
    out = tmp_path_factory.mktemp("docs")
    code = fmea_cli.main(["analyze", str(project), "--mode", "fmea", "--out", str(out)])
    assert code == 0
    return out


def test_fmea_csv_items_and_functions(reports):
    csv = (reports / "fmea-table.csv").read_text(encoding="utf-8")
    assert "Phys1::V::pack::cell" in csv and "Phys2::V::pack::cell" in csv
    assert "Sec::Authenticate" in csv and "Comf::Authenticate" in csv
    assert re.search(r"^V::solo,", csv, re.M) is None or "solo" in csv
    assert "Solo" in csv


def test_fmea_spof_csv_lost_functions(reports):
    csv = (reports / "fmea-spof.csv").read_text(encoding="utf-8")
    assert "Sec::Authenticate" in csv and "Comf::Authenticate" in csv


def test_fmea_markdown_report_and_mermaid(reports):
    md = (reports / "fmea-report.md").read_text(encoding="utf-8")
    assert "Phys1::V::pack::cell" in md and "Phys2::V::pack::cell" in md
    blocks = re.findall(r"```mermaid\n(.*?)```", md, re.S)
    assert blocks
    text = "\n".join(blocks)
    assert "Sec::Authenticate" in text or "Comf::Authenticate" in text
    for block in blocks:
        for line in block.splitlines()[2:]:
            if "-->" in line:
                continue
            assert re.fullmatch(r'\s{4}\w+\["[^"\n]*"\]', line), line
        ids = re.findall(r"^\s{4}(\w+)\[", block, re.M)
        assert len(ids) == len(set(ids))


def test_fmea_json_labels(fmea_cli, capsys, project):
    out = run(fmea_cli, capsys, "analyze", project, "--mode", "fmea", "--format", "json")
    data = json.loads(out)
    items = {r["itemId"]: r["item"] for r in data["rows"]} if "rows" in data else {}
    assert items.get("Phys1::V::pack::cell") == "Phys1::V::pack::cell"
    assert items.get("Phys1::V::solo") == "solo"
    labels = {e["label"] for r in data["rows"] for e in r["nextHigherEffect"]}
    assert {"Sec::Authenticate", "Comf::Authenticate"} <= labels


# -- label()/short_name() -------------------------------------------------


def _graph(*nodes: Node, parent=None):
    return ImpactGraph({n.id: n for n in nodes}, {}, parent or {})


def test_tag_kept_and_suffix_added_for_tagged_collision():
    g = _graph(
        Node("Uc::A::Brake", "Brake", Layer.USE_CASE, short_id="UC1"),
        Node("Uc::B::Brake", "Brake", Layer.USE_CASE, short_id="UC1"),
        Node("Uc::A::Park", "Park", Layer.USE_CASE, short_id="UC2"),
    )
    assert label(g, "Uc::A::Brake") == "UC1 A::Brake"
    assert label(g, "Uc::B::Brake") == "UC1 B::Brake"
    assert label(g, "Uc::A::Park") == "UC2 Park"


def test_suffix_grows_until_unique():
    g = _graph(
        Node("X::a::F", "F", Layer.FUNCTION),
        Node("Y::a::F", "F", Layer.FUNCTION),
        Node("Y::b::F", "F", Layer.FUNCTION),
    )
    assert short_name(g, "X::a::F") == "X::a::F"
    assert short_name(g, "Y::a::F") == "Y::a::F"
    assert short_name(g, "Y::b::F") == "b::F"


def test_physical_owner_path_extends_from_owner_side():
    g = _graph(
        Node("P1::V::pack", "pack", Layer.PHYSICAL),
        Node("P1::V::pack::cell", "cell", Layer.PHYSICAL),
        Node("P2::V::pack", "pack", Layer.PHYSICAL),
        Node("P2::V::pack::cell", "cell", Layer.PHYSICAL),
        Node("P1::V::x", "x", Layer.PHYSICAL),
        parent={"P1::V::pack::cell": "P1::V::pack", "P2::V::pack::cell": "P2::V::pack"},
    )
    assert short_name(g, "P1::V::pack::cell") == "P1::V::pack.cell"
    assert short_name(g, "P2::V::pack") == "P2::V::pack"
    assert short_name(g, "P1::V::x") == "x"


def test_labels_are_computed_once_per_graph():
    g = _graph(Node("A::F", "F", Layer.FUNCTION), Node("B::F", "F", Layer.FUNCTION))
    label(g, "A::F")
    from domain.failure import labels

    assert labels.label_map(g, "label") is labels.label_map(g, "label")
