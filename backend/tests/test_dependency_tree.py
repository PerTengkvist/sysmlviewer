"""Dependency tree: one chain up towards the more abstract, a tree down."""

from __future__ import annotations

import pytest

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.dependency_tree import build_dependency_tree
from domain.models import SysmlFile


def _semantic(*contents: str):
    files = [
        SysmlFile(id=f"f{i}", name=f"f{i}.sysml", content=c, path=f"f{i}.sysml")
        for i, c in enumerate(contents, start=1)
    ]
    result = SubsetSysmlParser().parse_project(files)
    assert result.warnings == [], result.warnings
    return result.elements


def _children(node: dict) -> dict[str, dict]:
    return {c["id"]: c for c in node["children"]}


REQUIREMENTS = """
package P {
  requirement def <'R-1'> R1;
  requirement def <'R-2'> R2;
  #refine dependency from R2 to R1;
  part def Pt;
  satisfy R2 by Pt;
  use case def U {
    objective R2;
  }
}
"""


def test_requirement_chain_up_and_tree_down():
    tree = build_dependency_tree(_semantic(REQUIREMENTS), "P::R2")

    assert tree["root"] == {
        "id": "P::R2",
        "name": "R2",
        "kind": "requirement",
        "shortId": "R-2",
    }
    # The package owner is not an upward step.
    assert [n["id"] for n in tree["up"]] == ["P::R1"]
    up = tree["up"][0]
    assert up["label"] == "refine"
    assert up["relationId"] == "P::dep1"
    assert up["shortId"] == "R-1"
    assert up["alternatives"] == 0

    down = tree["down"]
    assert down["id"] == "P::R2"
    kids = _children(down)
    assert set(kids) == {"P::Pt", "P::U"}
    assert kids["P::Pt"]["label"] == "satisfy"
    assert kids["P::U"]["label"] == "objective"
    assert kids["P::U"]["relationId"]
    assert tree["truncated"] is False


PARTS = """
package P {
  part def Base;
  part def Node;
  part def F :> Base {
    part a : Node;
  }
}
"""


def test_part_chain_prefers_owner_then_specialization():
    tree = build_dependency_tree(_semantic(PARTS), "P::F::a")

    # Top (most abstract) first.
    assert [n["id"] for n in tree["up"]] == ["P::Base", "P::F"]
    base, owner = tree["up"]
    assert owner["label"] == "owned by"
    assert owner["relationId"] is None
    # The typing to Node was the other candidate at that level.
    assert owner["alternatives"] == 1
    assert base["label"] == "specialization"
    # `:> Base` also sets typeRef; it is not a second candidate.
    assert base["alternatives"] == 0


def test_definition_tree_down_lists_owned_and_typed_usages():
    semantic = _semantic(PARTS)

    node = build_dependency_tree(semantic, "P::Node")["down"]
    assert {c["id"]: c["label"] for c in node["children"]} == {"P::F::a": "typed by"}

    base = build_dependency_tree(semantic, "P::Base")["down"]
    f = _children(base)["P::F"]
    assert f["label"] == "specialization"
    assert _children(f)["P::F::a"]["label"] == "owns"


CONNECTED = """
package P {
  part def Node {
    port p;
  }
  part def Sys {
    part a : Node;
    part b : Node;
    connection c connect a.p to b.p;
  }
}
"""


def test_connection_is_a_branch_both_ways_without_recursion():
    semantic = _semantic(CONNECTED)

    from_a = build_dependency_tree(semantic, "P::Sys::a")["down"]
    b = _children(from_a)["P::Sys::b"]
    assert b["label"] == "connection"
    assert b["relationId"] == "P::Sys::c"
    # Back to the root: marked, not expanded again.
    back = _children(b)["P::Sys::a"]
    assert back["repeated"] is True
    assert back["children"] == []

    from_b = build_dependency_tree(semantic, "P::Sys::b")["down"]
    assert _children(from_b)["P::Sys::a"]["label"] == "connection"

    # From the owner, a and b are expanded once; the connection between them
    # shows the other end as repeated.
    sys_tree = build_dependency_tree(semantic, "P::Sys")["down"]
    kids = _children(sys_tree)
    assert set(kids) == {"P::Sys::a", "P::Sys::b"}
    assert kids["P::Sys::a"]["repeated"] is False
    assert _children(kids["P::Sys::a"])["P::Sys::b"]["repeated"] is True


ALLOCATE_INCLUDE = """
package P {
  part def Fn {
    part ent;
  }
  part def Logic {
    part ctrl;
  }
  allocate Fn::ent to Logic::ctrl;
  use case def Brake;
  use case def Drive {
    include use case Brake;
  }
}
"""


def test_allocate_and_include():
    semantic = _semantic(ALLOCATE_INCLUDE)

    ent = build_dependency_tree(semantic, "P::Fn::ent")["down"]
    assert _children(ent)["P::Logic::ctrl"]["label"] == "allocate"

    ctrl_up = build_dependency_tree(semantic, "P::Logic::ctrl")["up"]
    # Owner beats allocation.
    assert [n["id"] for n in ctrl_up] == ["P::Logic"]
    assert ctrl_up[0]["alternatives"] == 1

    brake_up = build_dependency_tree(semantic, "P::Brake")["up"]
    assert [(n["id"], n["label"]) for n in brake_up] == [("P::Drive", "include")]


CYCLE = """
package P {
  requirement def A;
  requirement def B;
  #refine dependency from A to B;
  #refine dependency from B to A;
}
"""


def test_cycle_stops_chain_and_marks_repeated():
    tree = build_dependency_tree(_semantic(CYCLE), "P::A")
    assert [n["id"] for n in tree["up"]] == ["P::B"]
    # B is in the chain, so it is not expanded below A.
    b = _children(tree["down"])["P::B"]
    assert b["repeated"] is True
    assert b["children"] == []


def test_node_limit_truncates():
    parts = "\n".join(f"  part p{i};\n  satisfy R by p{i};" for i in range(10))
    model = f"package P {{\n  requirement def R;\n{parts}\n}}\n"
    tree = build_dependency_tree(_semantic(model), "P::R", max_nodes=5)
    assert len(tree["down"]["children"]) < 10
    assert tree["truncated"] is True
    assert tree["down"]["truncated"] is True


def test_depth_limit_truncates():
    model = """
    package P {
      requirement def R0;
      requirement def R1;
      requirement def R2;
      requirement def R3;
      #refine dependency from R1 to R0;
      #refine dependency from R2 to R1;
      #refine dependency from R3 to R2;
    }
    """
    tree = build_dependency_tree(_semantic(model), "P::R0", max_depth=2)
    r1 = _children(tree["down"])["P::R1"]
    r2 = _children(r1)["P::R2"]
    assert r2["children"] == []
    assert r2["truncated"] is True
    assert tree["truncated"] is True


def test_unknown_root_raises_key_error():
    with pytest.raises(KeyError):
        build_dependency_tree(_semantic(REQUIREMENTS), "P::Nope")
