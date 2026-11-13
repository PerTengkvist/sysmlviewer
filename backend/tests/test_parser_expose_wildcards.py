"""`expose P::*;`, `expose P::**;` and `expose P::*::**;` keep their kind.

`expose P;` is a membership expose (P with its contents to the diagram
levels, as before). `::*` exposes P's direct members, `::**` P and
everything under it, `::*::**` everything under P without P.
"""

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.models import SysmlFile
from domain.view_usage import effective_expose_kinds

SRC = """
package W {
  package Defs {
    part def A {
      part inner;
    }
    part def B;
  }
  package Other;
  view MembersView : GeneralView {
    expose Defs::*;
  }
  view AllView : GeneralView {
    expose Defs::**;
  }
  view AllMembersView : GeneralView {
    expose Defs::*::**;
  }
  view PlainView : GeneralView {
    expose Defs;
  }
  view MixedView : GeneralView {
    expose Defs::*;
    expose Other::**;
    expose Defs;
  }
}
"""


def _views() -> dict:
    return SubsetSysmlParser().parse(SRC, "f1").elements


def test_each_wildcard_form_records_its_kind():
    els = _views()
    assert els["W::MembersView"].expose_refs == ["W::Defs"]
    assert els["W::MembersView"].expose_kinds == {"W::Defs": "members"}
    assert els["W::AllView"].expose_kinds == {"W::Defs": "recursive"}
    assert els["W::AllMembersView"].expose_kinds == {"W::Defs": "membersRecursive"}
    # A plain expose is stored as no entry (missing means member).
    assert els["W::PlainView"].expose_kinds == {}


def test_kinds_per_id_and_the_widest_kind_wins():
    view = _views()["W::MixedView"]
    assert view.expose_refs == ["W::Defs", "W::Other"]
    # `expose Defs::*;` then `expose Defs;`: the membership expose is wider.
    assert view.expose_kinds == {"W::Other": "recursive"}


def test_wildcard_kind_survives_a_cross_file_expose():
    files = [
        SysmlFile(
            id="v",
            name="v.sysml",
            content="""
package Views {
  view TraceView : GeneralView {
    expose Lib::Parts::*;
  }
}
""",
        ),
        SysmlFile(
            id="l",
            name="l.sysml",
            content="""
package Lib {
  package Parts {
    part def P1;
  }
}
""",
        ),
    ]
    els = SubsetSysmlParser().parse_project(files).elements
    view = els["Views::TraceView"]
    assert view.expose_refs == ["Lib::Parts"]
    assert view.expose_kinds == {"Lib::Parts": "members"}


def test_a_view_usage_inherits_the_kind_from_its_definition():
    src = """
package U {
  package Defs {
    part def A;
  }
  view def MembersDef : GeneralView {
    expose Defs::*;
  }
  view v : MembersDef;
}
"""
    els = SubsetSysmlParser().parse(src, "f1").elements
    assert effective_expose_kinds(els["U::v"], els) == {"U::Defs": "members"}


def test_expose_filter_brackets_warn_and_parsing_goes_on():
    src = """
package F {
  package Defs {
    part def A;
  }
  view V : GeneralView {
    expose Defs::*[@PartUsage];
    filter @PartUsage;
  }
}
"""
    result = SubsetSysmlParser().parse(src, "f1")
    view = result.elements["F::V"]
    assert view.expose_kinds == {"F::Defs": "members"}
    assert view.view_filters, "the filter after the bracketed expose is parsed"
    assert any("expose filter" in w for w in result.warnings)


def test_serializer_writes_the_wildcard_back():
    els = _views()
    text = serialize_file(els, "f1")
    assert "expose Defs::*;" in text
    assert "expose Defs::**;" in text
    assert "expose Defs::*::**;" in text
    assert "expose Defs;" in text
