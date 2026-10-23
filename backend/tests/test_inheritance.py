from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def test_typed_usage_inherits_nested_parts():
    content = """
package Logical {
  part def Engine {
    port p;
  }
  part def Vehicle {
    part engine : Engine;
  }
}
package Physical {
  part def Site {
    part logical : Vehicle;
    connection c connect logical.engine.p to logical.engine.p;
  }
}
"""
    parser = SubsetSysmlParser()
    result = parser.parse(content, "physical/site.sysml")
    nested_engine = "Physical::Site::logical::engine"
    nested_port = f"{nested_engine}::p"
    assert nested_engine in result.elements
    assert nested_port in result.elements
    assert result.elements[nested_port].parent_id == nested_engine


def test_part_multiplicity_before_type_is_parsed():
    content = """
package P {
  part def Child { port p; }
  part def Parent {
    part child [0..*] : Child;
  }
}
"""
    result = SubsetSysmlParser().parse(content, "p.sysml")
    usage = result.elements["P::Parent::child"]
    assert usage.type_ref == "Child"
    assert usage.multiplicity == "0..*"
    assert "P::Parent::child::p" in result.elements


def test_repeated_part_type_inherits_ports_on_every_sibling():
    """Specialization must expand ports for every sibling of the same type."""
    content = """
package Rack {
  part def PDU {
    port pwrIn;
    port pwrOut;
  }
  part def GenericRack {
    part pduA : PDU;
    part pduB : PDU;
  }
  part def ComputeRack :> GenericRack;
  part def Room {
    part rack : ComputeRack;
    interface pduB_srv connect rack.pduB.pwrOut to rack.pduA.pwrIn;
  }
}
"""
    result = SubsetSysmlParser().parse(content, "rack.sysml")

    # Base definition: both siblings keep ports (independent expand roots).
    assert "Rack::GenericRack::pduA::pwrOut" in result.elements
    assert "Rack::GenericRack::pduB::pwrOut" in result.elements

    # Specialization: both siblings must inherit ports (B used to be empty).
    for sibling in ("pduA", "pduB"):
        for port in ("pwrIn", "pwrOut"):
            assert f"Rack::ComputeRack::{sibling}::{port}" in result.elements

    # Usage of the specialization must also carry both sides.
    assert "Rack::Room::rack::pduA::pwrOut" in result.elements
    assert "Rack::Room::rack::pduB::pwrOut" in result.elements

    iface = result.elements["Rack::Room::pduB_srv"]
    assert iface.source_id in result.elements
    assert iface.target_id in result.elements
    assert result.elements[iface.source_id].kind == ArtifactKind.PORT
    assert result.elements[iface.target_id].kind == ArtifactKind.PORT


def test_recursive_part_type_stops_at_cycle():
    """A part type that nests itself expands one level then stops."""
    content = """
package P {
  part def Node {
    port p;
    part child : Node;
  }
  part def Box {
    part n : Node;
  }
}
"""
    result = SubsetSysmlParser().parse(content, "cycle.sysml")
    assert "P::Box::n::p" in result.elements
    assert "P::Box::n::child" in result.elements
    assert "P::Box::n::child::p" not in result.elements
    assert "P::Box::n::child::child" not in result.elements
