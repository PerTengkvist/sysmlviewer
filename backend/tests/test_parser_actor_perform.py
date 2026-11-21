"""`actor X { perform step; doc /* … */ }`: the actor performs the use case step."""

from __future__ import annotations

from pathlib import Path

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.models import ArtifactKind, SysmlFile
from domain.perform import resolve_performers

FIXTURE = Path(__file__).parent / "fixtures" / "realization_probe.sysml"
P = "RealizationProbe"
START = f"{P}::UC::Start"

MODEL = """
package P {
  use case def Start {
    actor Driver {
      doc /* The person at the wheel. */
      perform pressStart;
    }
    action pressStart;
    action checkKey;
  }
}
"""


def _parse(text: str):
    return SubsetSysmlParser().parse_project(
        [SysmlFile(id="f.sysml", name="f.sysml", content=text, path="f.sysml")]
    )


def test_actor_body_is_not_skipped():
    r = _parse(FIXTURE.read_text(encoding="utf-8"))
    assert r.elements[f"{START}::Driver"].children  # red before the parser reads the body


def test_actor_body_perform_becomes_child():
    r = _parse(FIXTURE.read_text(encoding="utf-8"))
    assert r.warnings == []
    actor = r.elements[f"{START}::Driver"]
    (cid,) = actor.children
    perform = r.elements[cid]
    assert perform.kind == ArtifactKind.ACTION
    assert perform.metadata_keywords == ["perform"]
    assert perform.parent_id == actor.id
    assert perform.perform_target_id == f"{START}::pressStart"


def test_actor_body_doc():
    r = _parse(MODEL)
    assert r.warnings == []
    assert r.elements["P::Start::Driver"].documentation == "The person at the wheel."


def test_actor_body_unknown_member_warns_and_parsing_continues():
    r = _parse(
        """
        package P {
          action step;
          actor Driver { weird thing; perform step; }
          part after;
        }
        """
    )
    assert any("actor" in w and "weird" in w for w in r.warnings)
    assert r.elements["P::Driver"].children
    assert "P::after" in r.elements


def test_actor_without_body_unchanged():
    r = _parse("package P { actor A; actor B; part x; }")
    assert r.warnings == []
    assert r.elements["P::A"].children == []
    assert "P::x" in r.elements


def test_resolve_performers_includes_actors():
    r = _parse(FIXTURE.read_text(encoding="utf-8"))
    performers = resolve_performers(r.elements)
    assert performers[f"{START}::pressStart"] == [f"{START}::Driver"]
    assert performers[f"{P}::UC::Unlock::pressUnlock"] == [f"{P}::UC::Unlock::Driver"]


def test_serializer_roundtrip_actor_perform():
    text = """
package P {
  action pressStart;
  actor Driver {
    doc /* The person at the wheel. */
    perform pressStart;
  }
}
"""
    first = _parse(text)
    out = serialize_file(first.elements, "f.sysml")
    second = _parse(out)

    def tree(r):
        return sorted(
            (e.id, e.kind, e.name, e.parent_id, e.metadata_keywords, e.type_ref,
             e.perform_target_id, e.documentation)
            for e in r.elements.values()
        )

    assert second.warnings == []
    assert tree(second) == tree(first)
