from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind

from helpers import resolve_example_path


def _parse(content: str, file_id: str = "f1"):
    return SubsetSysmlParser().parse(content, file_id=file_id)


def _rels(result, kind: ArtifactKind):
    return [e for e in result.elements.values() if e.kind == kind]


def test_parse_dependency_single_target():
    content = """
    package P {
      part def A;
      part def B;
      dependency from A to B;
    }
    """
    result = _parse(content)
    deps = _rels(result, ArtifactKind.DEPENDENCY)
    assert len(deps) == 1
    assert deps[0].source_id == "P::A"
    assert deps[0].target_id == "P::B"


def test_parse_dependency_multi_target():
    content = """
    package P {
      part def A;
      part def B;
      part def C;
      dependency multiDep from A to B, C;
    }
    """
    result = _parse(content)
    deps = _rels(result, ArtifactKind.DEPENDENCY)
    assert len(deps) == 2
    targets = {d.target_id for d in deps}
    assert targets == {"P::B", "P::C"}
    assert all(d.source_id == "P::A" for d in deps)
    assert all(d.name.startswith("multiDep") for d in deps)


def test_parse_allocation():
    content = """
    package P {
      part logical;
      part physical;
      allocate logical to physical;
    }
    """
    result = _parse(content)
    allocs = _rels(result, ArtifactKind.ALLOCATION)
    assert len(allocs) == 1
    assert allocs[0].source_id == "P::logical"
    assert allocs[0].target_id == "P::physical"


def test_parse_binding():
    content = """
    package P {
      part def System {
        attribute temp;
        attribute reading;
        bind temp = reading;
      }
    }
    """
    result = _parse(content)
    bindings = _rels(result, ArtifactKind.BINDING)
    assert len(bindings) == 1
    assert bindings[0].source_id == "P::System::temp"
    assert bindings[0].target_id == "P::System::reading"


def test_parse_flow():
    content = """
    package P {
      part a {
        port pout;
      }
      part b {
        port pin;
      }
      flow power from a.pout to b.pin;
    }
    """
    result = _parse(content)
    flows = _rels(result, ArtifactKind.FLOW)
    assert len(flows) == 1
    assert flows[0].source_id == "P::a::pout"
    assert flows[0].target_id == "P::b::pin"


def test_parse_specialization_edge():
    content = """
    package P {
      part def Base;
      part def Small :> Base;
    }
    """
    result = _parse(content)
    assert result.elements["P::Small"].type_ref == "Base"
    specs = _rels(result, ArtifactKind.SPECIALIZATION)
    assert len(specs) == 1
    assert specs[0].source_id == "P::Small"
    assert specs[0].target_id == "P::Base"


def test_parse_subsetting_on_part():
    content = """
    package P {
      part def Base;
      part child subsets Base;
    }
    """
    result = _parse(content)
    subsets = _rels(result, ArtifactKind.SUBSETTING)
    assert len(subsets) == 1
    assert subsets[0].source_id == "P::child"
    assert subsets[0].target_id == "P::Base"


def test_parse_redefines_on_part():
    content = """
    package P {
      part def Base;
      part baseEng : Base;
      part eng redefines baseEng;
    }
    """
    result = _parse(content)
    redefs = _rels(result, ArtifactKind.REDEFINITION)
    assert len(redefs) == 1
    assert redefs[0].source_id == "P::eng"
    assert redefs[0].target_id == "P::baseEng"


def test_existing_connection_unchanged():
    content = resolve_example_path("vehicle.sysml").read_text(encoding="utf-8")
    result = _parse(content, file_id="vehicle.sysml")
    connections = _rels(result, ArtifactKind.CONNECTION)
    assert len(connections) >= 1
    conn = connections[0]
    assert conn.source_id == "Example::Vehicle::powerOut"
    assert conn.target_id == "Example::Vehicle::engine::powerIn"


def test_parse_part_relationships_fixture():
    content = resolve_example_path("part_relationships.sysml").read_text(encoding="utf-8")
    result = _parse(content, file_id="part_relationships.sysml")
    assert len(_rels(result, ArtifactKind.CONNECTION)) >= 1
    assert len(_rels(result, ArtifactKind.DEPENDENCY)) >= 2
    assert len(_rels(result, ArtifactKind.ALLOCATION)) >= 1
    assert len(_rels(result, ArtifactKind.BINDING)) >= 1
    assert len(_rels(result, ArtifactKind.FLOW)) >= 1
    assert len(_rels(result, ArtifactKind.SPECIALIZATION)) >= 1
    assert len(_rels(result, ArtifactKind.SUBSETTING)) >= 1
    assert len(_rels(result, ArtifactKind.REDEFINITION)) >= 1
