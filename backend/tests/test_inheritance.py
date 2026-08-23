from adapters.parser.subset_parser import SubsetSysmlParser


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
