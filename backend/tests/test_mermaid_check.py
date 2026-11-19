"""The test helper itself: it must accept what the generators write and reject the rest."""

from __future__ import annotations

from mermaid_check import check_mermaid, mermaid_blocks

GOOD_FLOW = 'flowchart LR\n    a["A<br/>LOST"]\n    b["B"]\n    a -->|implements| b'


def test_accepts_flowchart():
    assert check_mermaid(GOOD_FLOW) == []


def test_accepts_quadrant():
    src = "quadrantChart\n    title T\n    x-axis Low --> High\n    y-axis Low --> High\n    m1 a: [0.2, 0.9]"
    assert check_mermaid(src) == []


def test_rejects_undeclared_node():
    assert any("undeclared" in p for p in check_mermaid(GOOD_FLOW + "\n    b -->|x| c"))


def test_rejects_quote_in_label_and_bad_edge_label():
    assert check_mermaid('flowchart LR\n    a["say "hi""]')
    assert check_mermaid('flowchart LR\n    a["A"]\n    b["B"]\n    a --> b')


def test_rejects_bad_id_unbalanced_and_unknown_type():
    assert any("bad node id" in p for p in check_mermaid('flowchart LR\n    1a["A"]'))
    assert any("unbalanced" in p for p in check_mermaid('flowchart LR\n    a["A("]'))
    assert check_mermaid("pie\n a")


def test_rejects_quadrant_out_of_range_and_missing_axis():
    src = "quadrantChart\n    x-axis a --> b\n    m1: [1.2, 0.5]"
    problems = check_mermaid(src)
    assert any("y-axis" in p for p in problems) and any("outside" in p for p in problems)


def test_rejects_underscore_in_quadrant_point_name():
    src = "quadrantChart\n    x-axis a --> b\n    y-axis a --> b\n    winding_open: [0.1, 0.2]"
    assert any("point name" in p for p in check_mermaid(src))


def test_rejects_one_point_zero_in_quadrant_point():
    src = "quadrantChart\n    x-axis a --> b\n    y-axis a --> b\n    m a: [0.1, 1.000]"
    assert any("write 1" in p for p in check_mermaid(src))


def test_mermaid_blocks_extracts_in_order():
    md = "x\n```mermaid\nflowchart LR\n```\ny\n```mermaid\nquadrantChart\n```\n"
    assert mermaid_blocks(md) == ["flowchart LR", "quadrantChart"]
