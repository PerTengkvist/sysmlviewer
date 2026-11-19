"""FMEA/FMECA, SPOF and coverage tables as CSV and markdown."""

from __future__ import annotations

from domain.failure.model import Status
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


def _spof_rows(analysis: Analysis, threshold: int) -> list[dict[str, str]]:
    return [
        {
            "Item": f"{r.item_name}/{r.sru}" if r.sru else r.item_name,
            "Failure mode": r.mode_id,
            "S": str(r.severity),
            "Lost functions": _join(_tail(f) for f in r.lost_functions),
            "Requirements at risk": _join(e.label for e in r.end_effect if e.layer == "requirement"),
        }
        for r in spof_modes(analysis.ranking, threshold)
    ]


def spof_to_csv(analysis: Analysis, threshold: int) -> str:
    return _csv(SPOF_COLUMNS, _spof_rows(analysis, threshold))


def spof_to_markdown(analysis: Analysis, threshold: int) -> str:
    return _markdown(SPOF_COLUMNS, _spof_rows(analysis, threshold))


def spof_to_json_list(analysis: Analysis, threshold: int) -> list[dict]:
    return [
        {
            "item": f"{r.item_name}/{r.sru}" if r.sru else r.item_name,
            "itemId": r.item_id, "failureMode": r.mode_id, "severity": r.severity,
            "lostFunctions": list(r.lost_functions), "requirementsAtRisk": list(r.requirements_at_risk),
            "requirements": [
                {"id": e.id, "label": e.label, "shortId": e.short_id}
                for e in r.end_effect if e.layer == "requirement"
            ],
        }
        for r in spof_modes(analysis.ranking, threshold)
    ]


def coverage_to_csv(cov: Coverage) -> str:
    rows = [{"Kind": "part-without-modes", "Id": i} for i in cov.parts_without_modes]
    rows += [{"Kind": "mode-without-trace", "Id": i} for i in cov.modes_without_trace]
    rows += [{"Kind": "requirement-without-group", "Id": i} for i in cov.requirements_without_group]
    return _csv(COVERAGE_COLUMNS, rows)


def _cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _markdown(columns: list[str], rows: list[dict[str, str]]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "|" + "|".join("---" for _ in columns) + "|"]
    lines += ["| " + " | ".join(_cell(r[c]) for c in columns) + " |" for r in rows]
    return "\n".join(lines) + "\n"


FMECA_NOTE = "C_m and C_r are per instance; for a group usage multiply by Qty."


def to_markdown_table(analysis: Analysis) -> str:
    text = _markdown(*_table(analysis))
    return text + f"\n{FMECA_NOTE}\n" if analysis.mode == "fmeca" else text


def to_json_dict(analysis: Analysis) -> dict:
    """The ranked rows as plain data; the caller serialises it."""

    def effects(items):
        return [
            {"id": e.id, "label": e.label, "shortId": e.short_id, "layer": e.layer, "status": e.status.value}
            for e in items
        ]

    return {
        "mode": analysis.mode,
        "missionTimeH": analysis.mission_time_h,
        "rows": [
            {
                "itemId": r.item_id, "item": r.item_name, "qty": r.qty, "sru": r.sru,
                "failureMode": r.mode_id, "localEffect": r.local_effect, "functions": list(r.functions),
                "nextHigherEffect": effects(r.next_higher), "endEffect": effects(r.end_effect),
                "chain": list(r.chain), "severity": r.severity, "occurrence": r.occurrence,
                "detection": r.detection, "rpn": r.rpn, "rateFit": r.rate_fit,
                "modeRatio": r.mode_ratio, "effectProbability": r.effect_probability,
                "criticality": r.c_m, "severityClass": r.severity_class,
                "probabilityLevel": r.probability_level, "flags": sorted(r.flags),
                "detectionMethod": r.detection_method,
            }
            for r in analysis.ranking
        ],
    }


SIM_COLUMNS = ["Node", "Layer", "P(LOST)", "P(DEGRADED)"]
_SIM_LAYERS = ("function", "useCase", "requirement")


def simulation_rows(graph, result) -> list[dict]:
    """Functions, use cases and requirements, by layer and id."""
    rows = []
    for layer in _SIM_LAYERS:
        for nid in sorted(n for n, node in graph.nodes.items() if node.layer.value == layer):
            rows.append(
                {
                    "Node": nid,
                    "Layer": layer,
                    "P(LOST)": result.p(nid, Status.LOST),
                    "P(DEGRADED)": result.p(nid, Status.DEGRADED),
                }
            )
    return rows


def _sim_cells(rows: list[dict]) -> list[dict[str, str]]:
    return [
        {**r, "P(LOST)": f"{r['P(LOST)']:.4f}", "P(DEGRADED)": f"{r['P(DEGRADED)']:.4f}"} for r in rows
    ]


def simulation_to_csv(rows: list[dict]) -> str:
    return _csv(SIM_COLUMNS, _sim_cells(rows))


def simulation_to_markdown(rows: list[dict]) -> str:
    cells = _sim_cells(rows)
    lines = ["| " + " | ".join(SIM_COLUMNS) + " |", "|" + "|".join("---" for _ in SIM_COLUMNS) + "|"]
    lines += ["| " + " | ".join(_cell(r[c]) for c in SIM_COLUMNS) + " |" for r in cells]
    return "\n".join(lines) + "\n"
