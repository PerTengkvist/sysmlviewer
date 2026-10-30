"""Sequence (interaction) parsing: message chains and reply messages."""

from adapters.parser.subset_parser import SubsetSysmlParser
from adapters.parser.subset_serializer import serialize_file
from domain.models import ArtifactKind

CHAIN = """
package P {
  interaction def Seq {
    lifeline A;
    lifeline B;
    lifeline C;
    message first from A to B;
    then message second from B to C;
    then message third from C to A;
  }
}
"""


def _messages(result):
    return sorted(
        (e for e in result.elements.values() if e.kind == ArtifactKind.MESSAGE),
        key=lambda e: e.id,
    )


def test_then_message_chain_keeps_every_message():
    result = SubsetSysmlParser().parse(CHAIN, file_id="f1")
    msgs = _messages(result)
    assert result.warnings == []
    assert [m.name for m in msgs] == ["first", "second", "third"]
    assert [m.id for m in msgs] == ["P::Seq::msg1", "P::Seq::msg2", "P::Seq::msg3"]
    assert [(m.source_id, m.target_id) for m in msgs] == [
        ("P::Seq::A", "P::Seq::B"),
        ("P::Seq::B", "P::Seq::C"),
        ("P::Seq::C", "P::Seq::A"),
    ]
    assert all(m.parent_id == "P::Seq" for m in msgs)
    assert set(m.id for m in msgs) <= set(result.elements["P::Seq"].children)


def test_then_message_payload_with_dot():
    content = """
    package P {
      interaction def Seq {
        lifeline A;
        lifeline B;
        message A.event from A to B;
        then message B.event from B to A;
      }
    }
    """
    result = SubsetSysmlParser().parse(content, file_id="f1")
    msgs = _messages(result)
    assert [m.name for m in msgs] == ["A.event", "B.event"]
    assert msgs[1].type_ref == "B.event"


def test_then_message_bad_syntax_warns():
    content = """
    package P {
      interaction def Seq {
        lifeline A;
        lifeline B;
        message ok from A to B;
        then message broken A to B;
      }
    }
    """
    result = SubsetSysmlParser().parse(content, file_id="f1")
    msgs = _messages(result)
    assert [m.name for m in msgs] == ["ok"]
    assert any("expected 'from'" in w for w in result.warnings)


def test_reply_message_keyword():
    content = """
    package P {
      interaction def Seq {
        lifeline A;
        lifeline B;
        message ask from A to B;
        then #reply message answer from B to A;
        #reply message thanks from A to B;
      }
    }
    """
    result = SubsetSysmlParser().parse(content, file_id="f1")
    assert result.warnings == []
    msgs = _messages(result)
    assert [m.name for m in msgs] == ["ask", "answer", "thanks"]
    assert msgs[0].metadata_keywords in (None, [])
    assert msgs[1].metadata_keywords == ["reply"]
    assert msgs[2].metadata_keywords == ["reply"]
    assert (msgs[1].source_id, msgs[1].target_id) == ("P::Seq::B", "P::Seq::A")


def test_metadata_prefix_on_message_does_not_warn():
    content = """
    package P {
      interaction def Seq {
        lifeline A;
        lifeline B;
        #reply message answer from B to A;
      }
    }
    """
    result = SubsetSysmlParser().parse(content, file_id="f1")
    assert not any("metadata prefix ignored" in w for w in result.warnings)
    assert [m.name for m in _messages(result)] == ["answer"]


def test_message_chain_and_reply_round_trip_through_serializer():
    content = """
    package P {
      interaction def Seq {
        lifeline A;
        lifeline B;
        message ask from A to B;
        then #reply message answer from B to A;
        then message again from A to B;
      }
    }
    """
    parser = SubsetSysmlParser()
    first = parser.parse(content, file_id="f1")
    text = serialize_file(first.elements, "f1")
    assert "#reply message answer from B to A;" in text
    second = parser.parse(text, file_id="f1")
    before = [(m.name, m.source_id, m.target_id, m.metadata_keywords or []) for m in _messages(first)]
    after = [(m.name, m.source_id, m.target_id, m.metadata_keywords or []) for m in _messages(second)]
    assert before == after
