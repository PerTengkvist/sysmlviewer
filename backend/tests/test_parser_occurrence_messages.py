"""`message` in an occurrence def: names, payload types, dotted ends, order."""

from adapters.parser.subset_parser import SubsetSysmlParser
from domain.models import ArtifactKind


def _parse(body: str, extra: str = ""):
    text = f"package P {{ {extra} occurrence def S {{ part a; part b; {body} }} }}"
    return SubsetSysmlParser().parse(text, file_id="f1")


def _messages(r):
    return [r.elements[c] for c in r.elements["P::S"].children if r.elements[c].kind == ArtifactKind.MESSAGE]


def test_named_message_id_and_name():
    r = _parse("message msg from a to b;")
    msg = r.elements["P::S::msg"]
    assert msg.kind == ArtifactKind.MESSAGE
    assert msg.name == "msg"
    assert msg.type_ref is None
    assert (msg.source_id, msg.target_id) == ("P::S::a", "P::S::b")
    assert r.warnings == []


def test_anonymous_message_is_numbered():
    r = _parse("message from a to b; message named from b to a; message from a to b;")
    assert [m.id for m in _messages(r)] == ["P::S::msg1", "P::S::named", "P::S::msg2"]


def test_message_of_payload_type():
    r = _parse(
        "message hello of Greeting from a to b; message of Greeting from b to a;",
        extra="attribute def Greeting;",
    )
    assert r.elements["P::S::hello"].type_ref == "Greeting"
    assert r.elements["P::S::hello"].type_target_id == "P::Greeting"
    assert r.elements["P::S::msg1"].type_ref == "Greeting"
    assert r.warnings == []


def test_reply_metadata_capital_and_lower():
    r = _parse("#Reply message ack from b to a; then #reply message ack2 from a to b;")
    assert r.elements["P::S::ack"].metadata_keywords == ["Reply"]
    assert r.elements["P::S::ack2"].metadata_keywords == ["reply"]
    assert r.warnings == []


def test_then_is_tolerated():
    r = _parse("message m1 from a to b; then message m2 from b to a;")
    assert [m.id for m in _messages(r)] == ["P::S::m1", "P::S::m2"]
    assert not [e for e in r.elements.values() if e.kind == ArtifactKind.SUCCESSION]
    assert r.warnings == []


def test_declaration_order_with_twelve_messages():
    names = [f"m{i:02d}" for i in range(12)]
    body = " ".join(f"message {n} from a to b;" for n in reversed(names))
    r = _parse(body)
    assert [m.name for m in _messages(r)] == list(reversed(names))


def test_dotted_ends_are_read():
    r = _parse("message m from a.sent to b.inner.received;")
    assert not any("'from'" in w or "'to'" in w for w in r.warnings)
    assert r.elements["P::S::m"].source_id == "P::S::a"


def test_message_name_clash_warns():
    r = _parse("message a from a to b;")
    assert any(
        w.endswith("message name 'a' already names a member of 'P::S'") for w in r.warnings
    )
    assert "P::S::a#2" in r.elements


def test_missing_to_warns_as_before():
    r = _parse("message m from a;")
    assert any("message expected 'to'" in w for w in r.warnings)


def test_legacy_interaction_is_unchanged():
    r = SubsetSysmlParser().parse(
        "package P { interaction def I { lifeline A; lifeline B; message hi from A to B; } }",
        "f",
    )
    msg = r.elements["P::I::msg1"]
    assert (msg.name, msg.type_ref, msg.source_id) == ("hi", "hi", "P::I::A")
