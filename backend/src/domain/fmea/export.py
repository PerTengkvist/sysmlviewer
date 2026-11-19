"""FMEA/FMECA, SPOF and coverage tables as CSV and markdown."""

from __future__ import annotations

from domain.fmea.analyze import Analysis, Row, spof_modes
from domain.fmea.validate import Coverage

COMMON_COLUMNS = [
    "Item", "Qty", "SRU", "Function", "Failure mode", "Local effect", "Next higher effect",
    "End effect", "S", "Flags", "Detection method",
]
FMEA_COLUMNS = ["O", "D", "RPN"]
FMECA_COLUMNS = [
    "Rate (FIT)", "Mode ratio", "Effect probability", "Mission time (h)", "Criticality",
    "Severity class", "Probability level",
]
SPOF_COLUMNS = ["Item", "Failure mode", "S", "Lost functions", "Requirements at risk"]
COVERAGE_COLUMNS = ["Kind", "Id"]


def _num(x: float | None) -> str:
    return "" if x is None else f"{x:g}"


def _opt(x: object) -> str:
    return "" if x is None else str(x)


def _join(items) -> str:
    return "; ".join(items)


def _tail(nid: str) -> str:
    return nid.split("::", 1)[1] if "::" in nid else nid


def _common(r: Row) -> dict[str, str]:
    return {
        "Item": r.item_name,
        "Qty": str(r.qty),
        "SRU": r.sru or "",
        "Function": _join(r.functions),
        "Failure mode": r.mode_id,
        "Local effect": r.local_effect,
        "Next higher effect": _join(e.text for e in r.next_higher),
        "End effect": _join(e.text for e in r.end_effect),
        "S": str(r.severity),
        "Flags": _join(sorted(f.replace("_", " ") for f in r.flags)),
        "Detection method": r.detection_method or "",
    }


def _fmea(r: Row) -> dict[str, str]:
    return {"O": _opt(r.occurrence), "D": _opt(r.detection), "RPN": _opt(r.rpn)}


def _fmeca(r: Row) -> dict[str, str]:
    return {
        "Rate (FIT)": _num(r.rate_fit),
        "Mode ratio": _num(r.mode_ratio),
        "Effect probability": _num(r.effect_probability),
        "Mission time (h)": _num(r.mission_time_h),
        "Criticality": "" if r.c_m is None else f"{r.c_m:.1e}",
        "Severity class": r.severity_class or "",
        "Probability level": r.probability_level or "",
    }


def _table(analysis: Analysis) -> tuple[list[str], list[dict[str, str]]]:
    if analysis.mode == "fmea":
        columns, extra = COMMON_COLUMNS + FMEA_COLUMNS, _fmea
    else:
        columns, extra = COMMON_COLUMNS + FMECA_COLUMNS, _fmeca
    return columns, [{**_common(r), **extra(r)} for r in analysis.ranking]


def _field(text: str) -> str:
    """Quote fields with `,`, `;`, a quote or a line break."""
    if any(ch in text for ch in ',;"\n\r'):
        return '"' + text.replace('"', '""') + '"'
    return text


def _csv(columns: list[str], rows: list[dict[str, str]]) -> str:
    lines = [",".join(_field(c) for c in columns)]
    lines += [",".join(_field(r[c]) for c in columns) for r in rows]
    return "\n".join(lines) + "\n"


def to_csv(analysis: Analysis) -> str:
    return _csv(*_table(analysis))


def spof_to_csv(analysis: Analysis, threshold: int) -> str:
    rows = [
        {
            "Item": f"{r.item_name}/{r.sru}" if r.sru else r.item_name,
            "Failure mode": r.mode_id,
            "S": str(r.severity),
            "Lost functions": _join(_tail(f) for f in r.lost_functions),
            "Requirements at risk": _join(_tail(q) for q in r.requirements_at_risk),
        }
        for r in spof_modes(analysis.ranking, threshold)
    ]
    return _csv(SPOF_COLUMNS, rows)


def coverage_to_csv(cov: Coverage) -> str:
    rows = [{"Kind": "part-without-modes", "Id": i} for i in cov.parts_without_modes]
    rows += [{"Kind": "mode-without-trace", "Id": i} for i in cov.modes_without_trace]
    rows += [{"Kind": "requirement-without-group", "Id": i} for i in cov.requirements_without_group]
    return _csv(COVERAGE_COLUMNS, rows)


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def to_markdown_table(analysis: Analysis) -> str:
    columns, rows = _table(analysis)
    lines = ["| " + " | ".join(columns) + " |", "|" + "|".join("---" for _ in columns) + "|"]
    lines += ["| " + " | ".join(_cell(r[c]) for c in columns) + " |" for r in rows]
    return "\n".join(lines) + "\n"
