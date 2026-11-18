"""Capability propagation on small synthetic models."""

from __future__ import annotations

import pytest

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.failure.extract import build_impact_graph
from domain.failure.model import Failure, FailureKind, Status
from domain.failure.propagate import chain, evaluate, failure_flags
from domain.models import SysmlFile

LOSS, DEGR, ERR = FailureKind.LOSS, FailureKind.DEGRADED, FailureKind.ERRONEOUS


def _graph(text: str):
    files = [SysmlFile(id="f.sysml", name="f.sysml", content=text, path="f.sysml")]
    result = SubsetSysmlParser().parse_project(files)
    assert result.warnings == []
    return build_impact_graph(result.elements)


def loss(part, instances=None):
    return Failure(part, LOSS, None, instances)


def degraded(part, fraction, instances=None):
    return Failure(part, DEGR, fraction, instances)


CHAIN = """package P {
  part def Phys { part a; }
  part def Log { part l; }
  part def F { part n; }
  allocate F::n to Log::l;
  requirement def R;
  use case def U { objective P::R; }
  #implements dependency from Phys::a to Log::l;
  #refine dependency from F to U;
}"""
A, L, N, F, U, R = (f"P::{x}" for x in ("Phys::a", "Log::l", "F::n", "F", "U", "R"))


def test_no_failure_everything_ok():
    g = _graph(CHAIN)
    result = evaluate(g, [])
    assert set(result) == set(g.nodes)
    for impact in result.values():
        assert impact.capability == 1.0
        assert impact.status is Status.OK
        assert impact.flags == frozenset()
        assert impact.limited_by is None


def test_single_loss_reaches_requirement():
    result = evaluate(_graph(CHAIN), [loss(A)])
    for node in (A, L, N, F, U, R):
        assert result[node].status is Status.LOST
    assert result[A].limited_by == (A, "failure")
    assert result[L].limited_by == (A, "implements")
    assert result[N].limited_by == (L, "allocate")
    assert result[F].limited_by == (N, "node")
    assert result[U].limited_by == (F, "refine")
    assert result[R].limited_by == (U, "objective")
    assert chain(result, R) == [U, F, N, L, A]


CONTAIN = """package P {
  part def Phys { part b { part c; } }
  part def Log { part l; }
  #implements dependency from Phys::b to Log::l;
}"""


def test_containment_downwards_only():
    g = _graph(CONTAIN)
    down = evaluate(g, [loss("P::Phys::b")])
    assert down["P::Phys::b::c"].status is Status.LOST
    assert down["P::Phys::b::c"].limited_by == ("P::Phys::b", "contained in")
    up = evaluate(g, [loss("P::Phys::b::c")])
    assert up["P::Phys::b"].status is Status.OK


TWO = """package P {
  part def Phys { part a; part b; }
  part def Log { part l; }
  #implements dependency from Phys::a to Log::l;
  #implements dependency from Phys::b to Log::l;
}"""


def test_logical_takes_min_of_implementers():
    result = evaluate(_graph(TWO), [degraded("P::Phys::a", 0.5)])
    assert result["P::Log::l"].capability == 0.5
    assert result["P::Log::l"].status is Status.DEGRADED


POOL = """package P {
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
MODULES = "P::V::pack::modules"


def test_pool_above_at_and_below_required():
    g = _graph(POOL)
    one = evaluate(g, [loss(MODULES, 1)])
    assert one[MODULES].capability == pytest.approx(0.875)
    assert one[MODULES].status is Status.DEGRADED
    assert "pool_at_minimum" not in one[MODULES].flags
    two = evaluate(g, [loss(MODULES, 2)])
    assert two[MODULES].capability == pytest.approx(0.75)
    assert two[MODULES].status is Status.DEGRADED
    assert "pool_at_minimum" in two[MODULES].flags
    assert two[MODULES].limited_by == (MODULES, "pool")
    three = evaluate(g, [loss(MODULES, 3)])
    assert three[MODULES].status is Status.LOST
    with pytest.raises(ValueError, match="has 8 instances"):
        evaluate(g, [loss(MODULES, 9)])


def test_pool_degraded_instance():
    result = evaluate(_graph(POOL), [degraded(MODULES, 0.8, 1)])
    assert result[MODULES].capability == pytest.approx((7 * 7.5 + 6) / 60)


def _kofn(n: int, k: int) -> str:
    return f"""package P {{
      part def B;
      part def L {{ part l; }}
      part def V {{
        #Redundant part x[{n}] : B;
        attribute xRequired = {k};
        #implements dependency from V::x to L::l;
      }}
    }}"""


def test_kofn():
    g = _graph(_kofn(2, 1))
    one = evaluate(g, [loss("P::V::x", 1)])
    assert one["P::V::x"].capability == 1.0
    assert one["P::V::x"].status is Status.OK
    assert "redundancy_exhausted" in one["P::V::x"].flags
    assert "redundancy_exhausted" in one["P::L::l"].flags
    assert evaluate(g, [loss("P::V::x", 2)])["P::V::x"].status is Status.LOST
    g3 = _graph(_kofn(3, 2))
    assert evaluate(g3, [degraded("P::V::x", 0.5, 1)])["P::V::x"].capability == 1.0
    both = evaluate(g3, [loss("P::V::x", 1), degraded("P::V::x", 0.5, 1)])
    assert both["P::V::x"].capability == 0.5


def test_and_gate_multiplicity():
    g = _graph(
        """package P {
          part def L { part l; }
          part def V { part w[4]; #implements dependency from V::w to L::l; }
        }"""
    )
    assert evaluate(g, [loss("P::V::w", 1)])["P::V::w"].status is Status.LOST


def test_loss_count_on_single_part_rejected():
    with pytest.raises(ValueError):
        evaluate(_graph(CHAIN), [loss(A, 2)])


FUNCS = """package P {
  part def Phys { part a; part g; }
  part def Log { part l; part k; }
  part def F { part n; }
  part def G { part m; }
  allocate F::n to Log::l;
  allocate G::m to Log::k;
  #implements dependency from Phys::a to Log::l;
  #implements dependency from Phys::g to Log::k;
  %s
}"""


def test_function_min_over_nodes_and_hard_deps():
    g = _graph(FUNCS % "#Energy dependency from F to G;")
    result = evaluate(g, [degraded("P::Phys::g", 0.6)])
    assert result["P::F"].capability == pytest.approx(0.6)
    assert result["P::F"].limited_by == ("P::G", "#Energy")


def test_soft_dependency_floor():
    g = _graph(FUNCS % "#Soft #Speed dependency from F to G;")
    result = evaluate(g, [loss("P::Phys::g")])
    assert result["P::F"].capability == 0.5
    assert result["P::F"].status is Status.DEGRADED
    assert result["P::G"].status is Status.LOST


def test_cycle_terminates():
    g = _graph(FUNCS % "#Energy dependency from F to G; #Energy dependency from G to F;")
    result = evaluate(g, [loss("P::Phys::a")])
    for fn in ("P::F", "P::G"):
        assert result[fn].status is Status.LOST
        assert "cycle" in result[fn].flags
    assert "cycle" not in result["P::F::n"].flags


def test_include_propagates():
    g = _graph(CHAIN[:-1] + "  use case def W { include use case U; }\n}")
    result = evaluate(g, [loss(A)])
    assert result["P::W"].status is Status.LOST
    assert result["P::W"].limited_by == (U, "include")


def test_satisfy_puts_requirement_at_risk():
    g = _graph(
        """package P {
          part def Phys { part a; }
          part def Log { part l; }
          requirement def R;
          #implements dependency from Phys::a to Log::l;
          satisfy R by Log::l;
        }"""
    )
    result = evaluate(g, [loss("P::Phys::a")])
    assert result["P::R"].status is Status.LOST
    assert result["P::R"].limited_by == ("P::Log::l", "satisfy")


def test_erroneous_is_loss_and_flagged():
    g = _graph(CHAIN)
    result = evaluate(g, [Failure(A, ERR)])
    for node in (A, L, N, F, U, R):
        assert result[node].status is Status.LOST
        assert "erroneous_as_loss" in result[node].flags


def test_tie_break_own_failure_then_model_order():
    g = _graph(
        """package P {
          part def Phys { part a { part c; } }
          part def Log { part l; }
          #implements dependency from Phys::a.c to Log::l;
          #implements dependency from Phys::a to Log::l;
        }"""
    )
    result = evaluate(g, [degraded("P::Phys::a", 0.5)])
    assert result["P::Log::l"].capability == 0.5
    assert result["P::Log::l"].limited_by == ("P::Phys::a", "implements")


def test_common_cause_flag():
    g = _graph(
        """package P {
          part def Phys { part a { part c; } }
          part def Log { part l1; part l2; }
          #implements dependency from Phys::a to Log::l1;
          #implements dependency from Phys::a.c to Log::l2;
        }"""
    )
    assert failure_flags(g, loss("P::Phys::a")) == frozenset({"common_cause"})
    assert failure_flags(g, loss("P::Phys::a::c")) == frozenset()


def test_logical_part_can_fail_directly():
    result = evaluate(_graph(CHAIN), [loss(L)])
    assert result[N].status is Status.LOST
    assert result[F].status is Status.LOST
    assert result[A].status is Status.OK


def test_failure_on_unknown_part_is_ignored():
    g = _graph(CHAIN)
    assert evaluate(g, [loss("Spare::Kit::looseBolt")]) == evaluate(g, [])


def test_two_failures_on_single_part_take_the_minimum():
    result = evaluate(_graph(CHAIN), [degraded(A, 0.7), degraded(A, 0.4)])
    assert result[A].capability == 0.4
    result = evaluate(_graph(CHAIN), [degraded(A, 0.7), loss(A)])
    assert result[A].capability == 0.0
