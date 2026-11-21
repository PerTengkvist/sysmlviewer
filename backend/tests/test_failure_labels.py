"""Unambiguous labels when two nodes share a simple name in different namespaces."""

from __future__ import annotations

import importlib.util
import json
import re
import shutil

import pytest

from adapters.api.static_paths import resolve_repo_root
from domain.failure.model import Impact, ImpactGraph, Layer, Node, Status
from domain.failure.labels import label, name_of, short_name, tail_name
from domain.failure.report import to_text

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
    assert "Sec::Authenticate" in md and "Comf::Authenticate" in md


def test_common_cause_list_is_distinct(impact_cli, capsys, project):
    out = run(impact_cli, capsys, project, "--fail", "Phys1.V.solo:loss")
    assert "[common cause: Log2::L::l, Log::L::l]" in out


# -- FMEA ---------------------------------------------------------------


@pytest.fixture(scope="module")
def reports(fmea_cli, project, tmp_path_factory):
    out = tmp_path_factory.mktemp("docs")
    code = fmea_cli.main(["analyze", str(project), "--mode", "fmea", "--out", str(out)])
    assert code == 0
    return out


def test_fmea_csv_items_and_functions(reports):
    csv = (reports / "fmea-table.csv").read_text(encoding="utf-8")
    assert "Phys1::V::pack::cell" in csv and "Phys2::V::pack::cell" in csv
    assert "Sec::Authenticate" in csv and "Comf::Authenticate" in csv
    assert re.search(r"^solo,", csv, re.M)  # unique part: plain name
    assert not re.search(r"^Phys1::V::solo,", csv, re.M)
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
    assert "Sec::Authenticate" in text
    assert "Phys1::V::pack::cell<br/>" in text
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
    items = {r["itemId"]: r["item"] for r in data["rows"]}
    assert items["Phys1::V::pack::cell"] == "Phys1::V::pack::cell"
    assert items["Phys1::V::solo"] == "solo"
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


# -- graph-wide uniqueness (tail style, mixed depth) ----------------------


def test_tail_labels_unique_graph_wide():
    g = _graph(
        Node("Phys1::V::x", "x", Layer.PHYSICAL),
        Node("Phys2::V::x", "x", Layer.PHYSICAL),
        Node("Root::Phys1::V::x", "x", Layer.PHYSICAL),
    )
    texts = [tail_name(g, n) for n in g.nodes]
    assert len(set(texts)) == 3
    assert tail_name(g, "Phys2::V::x") == "Phys2::V::x"


def test_mixed_depth_names_are_unique_and_minimal():
    g = _graph(
        Node("F", "F", Layer.FUNCTION),
        Node("A::F", "F", Layer.FUNCTION),
        Node("B::A::F", "F", Layer.FUNCTION),
    )
    assert [name_of(g, n) for n in g.nodes] == ["F", "A::F", "B::A::F"]


def test_cross_layer_names_are_qualified():
    g = _graph(Node("Funcs::Brake", "Brake", Layer.FUNCTION), Node("Log::Brake", "Brake", Layer.LOGICAL))
    assert name_of(g, "Funcs::Brake") == "Funcs::Brake"
    assert name_of(g, "Log::Brake") == "Log::Brake"


# -- cache ------------------------------------------------------------------


def test_replace_gives_a_fresh_cache():
    import dataclasses

    g = _graph(Node("A::F", "F", Layer.FUNCTION), Node("B::G", "G", Layer.FUNCTION))
    assert name_of(g, "A::F") == "F"
    g2 = dataclasses.replace(
        g, nodes={"A::F": Node("A::F", "F", Layer.FUNCTION), "B::F": Node("B::F", "F", Layer.FUNCTION)}
    )
    assert name_of(g2, "A::F") == "A::F"
    assert name_of(g, "A::F") == "F"


# -- redundancy flag lines --------------------------------------------------

GATES = """package Log { part def L { part l; part m; } }
package B { part def Cell; }
package Phys1 {
  part def V {
    #Redundant part pack[2] : B::Cell;
    attribute packRequired = 1;
    #implements dependency from pack to Log::L::l;
  }
}
package Phys2 {
  part def V {
    #Redundant part pack[2] : B::Cell;
    attribute packRequired = 1;
    #implements dependency from pack to Log::L::m;
  }
}
"""


def test_flag_lines_name_each_group(impact_cli, capsys, tmp_path):
    (tmp_path / "m.sysml").write_text(GATES, encoding="utf-8")
    out = run(
        impact_cli, capsys, tmp_path, "--fail", "Phys1.V.pack:loss:1", "--fail", "Phys2.V.pack:loss:1"
    )
    flags = [l for l in out.splitlines() if "redundancy exhausted" in l]
    assert len(flags) == 2
    assert any("Phys1::V::pack " in l for l in flags)
    assert any("Phys2::V::pack " in l for l in flags)


# -- FMEA item names and C_r --------------------------------------------------


def test_item_names_unique_across_graph_and_non_graph_parts():
    from domain.fmea.analyze import _item_names

    g = _graph(
        Node("P::V::pack", "pack", Layer.PHYSICAL),
        Node("P::V::pack::cell", "cell", Layer.PHYSICAL),
        parent={"P::V::pack::cell": "P::V::pack"},
    )
    names = _item_names(g, ["P::V::pack::cell", "Q::W::pack::cell", "R::pack::cell"])
    assert len(set(names.values())) == 3
    assert names["P::V::pack::cell"] != "pack.cell" or names["Q::W::pack::cell"] != "pack.cell"


def test_item_names_unchanged_when_unique():
    from domain.fmea.analyze import _item_names

    g = _graph(Node("P::V::a", "a", Layer.PHYSICAL))
    assert _item_names(g, ["P::V::a", "Q::W::b::c"]) == {"P::V::a": "a", "Q::W::b::c": "b.c"}


def test_item_criticality_keys_on_item_id():
    from types import SimpleNamespace as NS

    from domain.fmea.export import _item_criticality

    rows = [
        NS(item_id="A::x", item_name="pack.cell", c_m=1.0, severity_class="I"),
        NS(item_id="B::x", item_name="pack.cell", c_m=2.0, severity_class="I"),
    ]
    cfg = NS(severity_classes=[NS(label="I")])
    lines = _item_criticality(NS(rows=rows), cfg)
    assert sum(1 for l in lines if l.startswith("| pack.cell |")) == 2


def test_tail_names_for_coverage_lists():
    from domain.failure.labels import tail_names

    ids = ["Phys1::V::pack", "Phys2::V::pack", "Phys1::V::solo"]
    assert tail_names(ids) == {
        "Phys1::V::pack": "Phys1::V::pack",
        "Phys2::V::pack": "Phys2::V::pack",
        "Phys1::V::solo": "V::solo",
    }
