"""Impact graph extraction on small synthetic models."""

from __future__ import annotations

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Edge, Gate, GateKind, Layer
from domain.models import SysmlFile


def _graph(*texts: str):
    files = [
        SysmlFile(id=f"f{i}.sysml", name=f"f{i}.sysml", content=t, path=f"f{i}.sysml")
        for i, t in enumerate(texts)
    ]
    result = SubsetSysmlParser().parse_project(files)
    assert result.warnings == []
    return build_impact_graph(result.elements)


def _layer(graph, node_id):
    node = graph.nodes.get(node_id)
    return node.layer if node else None


def test_implements_makes_physical_and_logical():
    g = _graph(
        """package P {
          part def Phys { part a; part b { part c; } }
          part def Log { part l; }
          #implements dependency from Phys::a to Log::l;
        }"""
    )
    assert _layer(g, "P::Phys::a") == Layer.PHYSICAL
    assert _layer(g, "P::Log::l") == Layer.LOGICAL
    assert g.inputs["P::Log::l"] == [Edge("P::Phys::a", "implements")]
    assert "P::Phys::b" not in g.nodes
    assert "P::Phys::b::c" not in g.nodes


def test_implementing_def_makes_descendants_physical():
    g = _graph(
        """package P {
          part def Phys { part a; part b { part c; } }
          part def Log;
          #implements dependency from Phys to Log;
        }"""
    )
    for pid in ("P::Phys::a", "P::Phys::b", "P::Phys::b::c"):
        assert _layer(g, pid) == Layer.PHYSICAL
    assert g.parent["P::Phys::b::c"] == "P::Phys::b"
    assert "P::Phys" not in g.parent.values()


def test_implements_from_port_lifts_to_part():
    g = _graph(
        """package P {
          part def Phys { part a { port p; } }
          part def Log { part l; }
          #implements dependency from Phys::a.p to Log::l;
        }"""
    )
    assert g.inputs["P::Log::l"] == [Edge("P::Phys::a", "implements")]


def test_allocate_function_node_and_function():
    g = _graph(
        """package P {
          part def Log { part l; }
          part def F { part n; }
          allocate F::n to Log::l;
        }"""
    )
    assert _layer(g, "P::F::n") == Layer.FUNCTION_NODE
    assert g.inputs["P::F::n"] == [Edge("P::Log::l", "allocate")]
    assert _layer(g, "P::F") == Layer.FUNCTION
    assert Edge("P::F::n", "node") in g.inputs["P::F"]


_FUNCS = """package P {
  part def Log { part l; }
  part def F { part n; }
  part def G { part m; }
  allocate F::n to Log::l;
  allocate G::m to Log::l;
  %s
}"""


def test_function_dependency_hard_and_soft():
    hard = _graph(_FUNCS % "#Energy dependency from F to G;")
    assert Edge("P::G", "#Energy", soft=False) in hard.inputs["P::F"]
    soft = _graph(_FUNCS % "#Soft #Speed dependency from F to G;")
    assert Edge("P::G", "#Speed", soft=True) in soft.inputs["P::F"]
    trace = _graph(_FUNCS % "#refine dependency from F to G;")
    assert all(e.source != "P::G" for e in trace.inputs["P::F"])


def test_refine_include_objective_satisfy():
    g = _graph(
        """package P {
          part def Log { part l; }
          part def F { part n; }
          allocate F::n to Log::l;
          requirement def R;
          use case def U { objective P::R; }
          use case def W { include use case U; }
          #refine dependency from F to U;
          #refine dependency from F::n to U;
          satisfy R by Log::l;
        }"""
    )
    assert _layer(g, "P::U") == Layer.USE_CASE
    assert g.inputs["P::U"] == [Edge("P::F", "refine"), Edge("P::F::n", "refine")]
    assert g.inputs["P::W"] == [Edge("P::U", "include")]
    assert _layer(g, "P::R") == Layer.REQUIREMENT
    assert g.inputs["P::R"] == [Edge("P::U", "objective"), Edge("P::Log::l", "satisfy")]


_POOL = """package P {
  part def M { attribute capacityKWh = 7.5; }
  part def L { part l; }
  part def V {
    part pack {
      #Pool part modules[8] : M;
      attribute required = 45;
    }
    #implements dependency from pack.modules to L::l;
  }
}"""


def test_pool_gate():
    g = _graph(_POOL)
    assert g.nodes["P::V::pack::modules"].gate == Gate(GateKind.POOL, 8, 45.0, (7.5,) * 8)


def _gate_model(usage: str, owner_extra: str = "") -> str:
    return f"""package P {{
      part def B;
      part def L {{ part l; }}
      part def V {{
        {usage}
        {owner_extra}
        #implements dependency from V::x to L::l;
      }}
    }}"""


def test_kofn_gate_named_required():
    g = _graph(_gate_model("#Redundant part x[2] : B;", "attribute xRequired = 1;"))
    assert g.nodes["P::V::x"].gate == Gate(GateKind.KOFN, 2, 1.0, (1.0, 1.0))


def test_kofn_without_required_defaults_to_one():
    files = [SysmlFile("f.sysml", "f.sysml", _gate_model("#Redundant part x[2] : B;"), path="f.sysml")]
    elements = SubsetSysmlParser().parse_project(files).elements
    g = build_impact_graph(elements)
    assert g.nodes["P::V::x"].gate == Gate(GateKind.KOFN, 2, 1.0, (1.0, 1.0))
    assert g.warnings == ["redundant 'P::V::x' has no required attribute; using 1"]


def test_single_multiplicity_is_and_gate():
    g = _graph(_gate_model("part x[4];"))
    assert g.nodes["P::V::x"].gate == Gate(GateKind.AND, 4, 4.0, (1.0,) * 4)


def test_unbounded_multiplicity_warns():
    files = [SysmlFile("f.sysml", "f.sysml", _gate_model("#Pool part x[0..*];"), path="f.sysml")]
    g = build_impact_graph(SubsetSysmlParser().parse_project(files).elements)
    assert g.nodes["P::V::x"].gate is None
    assert g.warnings == [
        "cannot evaluate multiplicity '0..*' of 'P::V::x'; treated as one instance"
    ]


def test_pool_without_capacity_counts_instances():
    g = _graph(_gate_model("#Pool part x[4];", "attribute required = 3;"))
    assert g.nodes["P::V::x"].gate == Gate(GateKind.POOL, 4, 3.0, (1.0,) * 4)


def test_bounded_range_uses_upper_bound():
    g = _graph(_gate_model("part x[1..3];"))
    assert g.nodes["P::V::x"].gate.n == 3
