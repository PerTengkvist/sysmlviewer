"""Round trip of occurrence defs through the serializer."""

import pytest

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.models import ArtifactKind

DEFS = """
  attribute def Greeting;
  part def KeyFob { event occurrence pressed; }
  part def Car { part keyFob : KeyFob; part locks; }
  part def PartA { event occurrence sent; }
  part def PartB { event occurrence received; }
  part partA : PartA;
  part partB : PartB;
"""

FORMS = {
    "typed": "part keyFob : KeyFob; part b; message m from keyFob.pressed to b;",
    "ref_typed": "ref part keyFob : KeyFob; ref part b : PartB; message m from keyFob to b.received;",
    "chain": "ref part car : Car; ref part keyFob :> car.keyFob; part b; message m from keyFob.pressed to b;",
    "qualified": "ref part locks :> P::Car::locks; part b; message m from locks to b;",
    "redefinition": "part a :>> partA; part b :>> partB; message msg from a.sent to b.received; #Reply message ack from b to a;",
    "nested": "ref part car : Car; part b; message m from car.keyFob.pressed to car.locks; message from b to car.keyFob;",
    "local_events": "ref part a : PartA { event occurrence ping; } part b; message hello of Greeting from a.ping to b;",
}


def _tuples(r):
    el = r.elements
    parts, events, msgs = [], [], []
    for e in el.values():
        if e.kind == ArtifactKind.PART and "::S::" in e.id:
            links = sorted(
                x.target_id for x in el.values()
                if x.kind in (ArtifactKind.SUBSETTING, ArtifactKind.REDEFINITION)
                and x.source_id == e.id
            )
            parts.append((e.id, e.kind, e.is_reference, e.type_target_id, links))
        if e.kind == ArtifactKind.EVENT_OCCURRENCE:
            events.append((e.id, e.parent_id))
    for cid in el["P::S"].children:
        m = el[cid]
        if m.kind == ArtifactKind.MESSAGE:
            msgs.append((m.id, m.name, m.source_id, m.target_id, m.source_event_id,
                         m.target_event_id, m.metadata_keywords, m.type_ref))
    return sorted(parts, key=str), sorted(events), msgs


@pytest.mark.parametrize("form", FORMS)
def test_occurrence_round_trip_semantics(form):
    text = f"package P {{ {DEFS} occurrence def S {{ {FORMS[form]} }} }}"
    parser = SubsetSysmlParser()
    first = parser.parse(text, "f1")
    out = serialize_file(first.elements, "f1")
    second = parser.parse(out, "f1")
    assert _tuples(first) == _tuples(second), out
    assert second.warnings == first.warnings


def test_occurrence_serializer_text():
    text = f"""package P {{ {DEFS} occurrence def sequenceA {{
      part a :>> partA; part b :>> partB; ref part car : Car; ref part keyFob :> car.keyFob;
      ref part k : KeyFob; part c { '{' } event occurrence ping; {'}'}
      message msg from a.sent to b.received;
      message from c.ping to b;
      #Reply message ack from b to a;
    }} }}"""
    out = serialize_file(SubsetSysmlParser().parse(text, "f1").elements, "f1")
    for want in [
        "occurrence def sequenceA {",
        "part a :>> P::partA;",
        "ref part keyFob :> car.keyFob;",
        "ref part k : KeyFob;",
        "event occurrence ping;",
        "message msg from a.sent to b.received;",
        "message from c.ping to b;",
        "#Reply message ack from b to a;",
    ]:
        assert want in out, (want, out)
    assert "part def a" not in out


def test_event_occurrence_in_part_def_is_emitted():
    r = SubsetSysmlParser().parse(
        "package P { part def A { event occurrence e; event occurrence t : Sig; } attribute def Sig; }",
        "f1",
    )
    out = serialize_file(r.elements, "f1")
    assert "event occurrence e;" in out and "event occurrence t : Sig;" in out


@pytest.mark.parametrize("legacy", [True, False])
def test_serializer_keeps_message_declaration_order(legacy):
    names = [f"m{i:02d}" for i in range(12)][::-1]
    if legacy:
        body = "lifeline A; lifeline B; " + " ".join(f"message {n} from A to B;" for n in names)
        text = f"package P {{ interaction def S {{ {body} }} }}"
    else:
        body = "part a; part b; " + " ".join(f"message {n} from a to b;" for n in names)
        text = f"package P {{ occurrence def S {{ {body} }} }}"
    out = serialize_file(SubsetSysmlParser().parse(text, "f1").elements, "f1")
    order = [ln.split()[1] for ln in out.splitlines() if ln.strip().startswith("message")]
    assert order == names
