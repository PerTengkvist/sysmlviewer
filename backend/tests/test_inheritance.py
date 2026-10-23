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


def test_inherited_relations_follow_port_copies():
    """Connections/interfaces declared on a general part must copy onto usages."""
    content = """
package Rack {
  part def PDU {
    port pwrIn;
    port pwrOut;
    interface loop connect pwrIn to pwrOut;
  }
  part def GenericRack {
    part pduA : PDU;
    part pduB : PDU;
    connection bus connect pduA.pwrOut to pduB.pwrIn;
  }
  part def ComputeRack :> GenericRack;
  part def Room {
    part rack1 : ComputeRack;
    part rack2 : ComputeRack;
  }
}
"""
    result = SubsetSysmlParser().parse(content, "rack.sysml")
    els = result.elements

    # Original on the general definition is unchanged.
    bus = els["Rack::GenericRack::bus"]
    assert bus.kind == ArtifactKind.CONNECTION
    assert bus.source_id == "Rack::GenericRack::pduA::pwrOut"
    assert bus.target_id == "Rack::GenericRack::pduB::pwrIn"

    # Specialization inherits the connection with retargeted ends.
    cr_bus = els["Rack::ComputeRack::bus"]
    assert cr_bus.kind == ArtifactKind.CONNECTION
    assert cr_bus.parent_id == "Rack::ComputeRack"
    assert cr_bus.source_id == "Rack::ComputeRack::pduA::pwrOut"
    assert cr_bus.target_id == "Rack::ComputeRack::pduB::pwrIn"

    # Each usage of the specialization gets its own copy.
    for rack in ("rack1", "rack2"):
        copy = els[f"Rack::Room::{rack}::bus"]
        assert copy.kind == ArtifactKind.CONNECTION
        assert copy.parent_id == f"Rack::Room::{rack}"
        assert copy.source_id == f"Rack::Room::{rack}::pduA::pwrOut"
        assert copy.target_id == f"Rack::Room::{rack}::pduB::pwrIn"

        # Nested interface declared on PDU follows each nested PDU usage.
        loop = els[f"Rack::Room::{rack}::pduA::loop"]
        assert loop.kind == ArtifactKind.INTERFACE
        assert loop.parent_id == f"Rack::Room::{rack}::pduA"
        assert loop.source_id == f"Rack::Room::{rack}::pduA::pwrIn"
        assert loop.target_id == f"Rack::Room::{rack}::pduA::pwrOut"


def test_external_endpoint_relation_is_not_copied():
    """A relation with an end outside the type def is not inherited."""
    content = """
package P {
  part def Other { port q; }
  part def Box {
    port p;
    part other : Other;
  }
  part def Host {
    part peer : Other;
    part box : Box;
    // Declared on Host, ends span box + peer — not a child of Box to copy.
  }
  part def Typed {
    port p;
    // Connects typed port to an external name that is not under Typed.
    connection cross connect p to peer.q;
  }
  part usage : Typed;
}
"""
    result = SubsetSysmlParser().parse(content, "ext.sysml")
    # cross is a child of Typed but target is outside Typed → not copied.
    assert "P::Typed::cross" in result.elements
    assert "P::usage::cross" not in result.elements


def test_inherited_relations_across_files_regardless_of_order():
    """Fixpoint inheritance copies relations even when the def file is last."""
    from domain.models import SysmlFile

    usages = SysmlFile(
        id="f-usages",
        name="usages.sysml",
        content=(
            "private import Types::*;\n"
            "package Main {\n"
            "  part rack : GenericRack;\n"
            "}\n"
        ),
        path="usages.sysml",
    )
    types = SysmlFile(
        id="f-types",
        name="types.sysml",
        content=(
            "package Types {\n"
            "  part def PDU {\n"
            "    port pwrIn;\n"
            "    port pwrOut;\n"
            "    interface loop connect pwrIn to pwrOut;\n"
            "  }\n"
            "  part def GenericRack {\n"
            "    part pduA : PDU;\n"
            "    part pduB : PDU;\n"
            "    connection bus connect pduA.pwrOut to pduB.pwrIn;\n"
            "  }\n"
            "}\n"
        ),
        path="types.sysml",
    )
    # Usage file first — inheritance must still expand after both are merged.
    result = SubsetSysmlParser().parse_project([usages, types])
    bus = result.elements["Main::rack::bus"]
    assert bus.kind == ArtifactKind.CONNECTION
    assert bus.source_id == "Main::rack::pduA::pwrOut"
    assert bus.target_id == "Main::rack::pduB::pwrIn"
    loop = result.elements["Main::rack::pduA::loop"]
    assert loop.kind == ArtifactKind.INTERFACE
    assert loop.source_id == "Main::rack::pduA::pwrIn"
    assert loop.target_id == "Main::rack::pduA::pwrOut"
