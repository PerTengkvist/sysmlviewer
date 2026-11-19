"""FMEA/FMECA, SPOF and coverage tables as CSV and markdown."""

from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass

from domain.failure.model import ImpactGraph
from domain.fmea.analyze import Analysis, Row, spof_modes
from domain.fmea.schema import SeverityConfig
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


def spof_rows(analysis: Analysis, threshold: int) -> list[dict[str, str]]:
    return [
        {
            "Item": f"{r.item_name}/{r.sru}" if r.sru else r.item_name,
            "Failure mode": r.mode_id,
            "S": str(r.severity),
            "Lost functions": _join(_tail(f) for f in r.lost_functions),
            "Requirements at risk": _join(_tail(q) for q in r.requirements_at_risk),
        }
        for r in spof_modes(analysis.ranking, threshold)
    ]


def spof_to_csv(analysis: Analysis, threshold: int) -> str:
    return _csv(SPOF_COLUMNS, spof_rows(analysis, threshold))


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


def to_json_dict(analysis: Analysis) -> dict:
    """The ranked rows as plain data; the caller serialises it."""

    def effects(items):
        return [{"id": e.id, "layer": e.layer, "status": e.status.value} for e in items]

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
    from domain.failure.model import Status

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


@dataclass(frozen=True)
class SimInfo:
    trials: int
    seed: int
    mission_time_h: float
    rows: list[dict]


_LOG_MIN, _LOG_MAX = -5, 0  # C_m axis of the quadrant chart: 1e-5 .. 1


def _md_table(columns: Sequence[str], rows: Sequence[dict[str, str]]) -> list[str]:
    lines = ["| " + " | ".join(columns) + " |", "|" + "|".join("---" for _ in columns) + "|"]
    lines += ["| " + " | ".join(_cell(r[c]) for c in columns) + " |" for r in rows]
    return lines


def _mid(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "_", text)


def _quadrant(analysis: Analysis) -> list[str]:
    lines = [
        "```mermaid",
        "quadrantChart",
        "    title Failure modes by criticality and severity",
        "    x-axis Low criticality C_m --> High criticality C_m",
        "    y-axis Low severity --> High severity",
        "    quadrant-1 Act first",
        "    quadrant-2 Severe but rare",
        "    quadrant-3 Accept",
        "    quadrant-4 Frequent but mild",
    ]
    for r in analysis.ranking:
        x = (math.log10(max(r.c_m or 0.0, 1e-300)) - _LOG_MIN) / (_LOG_MAX - _LOG_MIN)
        x = min(1.0, max(0.0, x))
        lines.append(f"    {_mid(r.mode_id)}: [{x:.3f}, {r.severity / 10:.3f}]")
    return lines + ["```"]


def _matrix(analysis: Analysis, cfg: SeverityConfig) -> list[str]:
    if analysis.mode == "fmeca":
        rows_k = [c.label for c in cfg.severity_classes]
        cols_k = [p.label for p in cfg.probability_levels]
        cell = {k: [r.mode_id for r in v] for k, v in analysis.matrix.items()}
        head, corner = "Severity class", "Class"
    else:
        rows_k = sorted({str(r.severity) for r in analysis.rows}, key=int, reverse=True)
        cols_k = sorted({str(r.occurrence) for r in analysis.rows}, key=int)
        cell = {}
        for r in analysis.ranking:
            cell.setdefault((str(r.severity), str(r.occurrence)), []).append(r.mode_id)
        head, corner = "Severity (S) by occurrence (O)", "S"
    table = [{corner: k, **{c: ", ".join(cell.get((k, c), [])) for c in cols_k}} for k in rows_k]
    return [f"{head}:", ""] + _md_table([corner, *cols_k], table)


def _chain_block(r: Row, graph: ImpactGraph) -> list[str]:
    effects = {e.id: e for e in (*r.next_higher, *r.end_effect)}
    path = list(reversed(r.chain))  # failed part first, requirement last
    mode_id = "m_" + _mid(r.mode_id)
    lines = ["```mermaid", "flowchart LR", f'    {mode_id}["{r.mode_id}<br/>{r.local_effect}"]']
    ids = []
    for i, nid in enumerate(path):
        name = r.item_name if i == 0 else graph.nodes[nid].name
        status = effects[nid].status.value if nid in effects else None
        label = f"{name}<br/>{status}" if status else name
        ids.append(f"n{i}_{_mid(name)}")
        lines.append(f'    {ids[-1]}["{label}"]')
    lines.append(f"    {mode_id} -->|fails| {ids[0]}")
    for i in range(1, len(path)):
        label = next(e.label for e in graph.inputs[path[i]] if e.source == path[i - 1])
        lines.append(f"    {ids[i - 1]} -->|{label.lstrip('#')}| {ids[i]}")
    return lines + ["```"]


def _short(item_id: str) -> str:
    return item_id.split("::", 1)[1] if "::" in item_id else item_id


def to_report_markdown(
    analysis: Analysis,
    graph: ImpactGraph,
    cfg: SeverityConfig,
    cov: Coverage,
    *,
    project_name: str,
    files: Sequence[str],
    physical_total: int,
    sim: SimInfo | None = None,
) -> str:
    """One self-contained markdown report; deterministic (no timestamp)."""
    kind = analysis.mode.upper()
    columns, table = _table(analysis)
    spof = spof_rows(analysis, cfg.spof_severity_threshold)
    n_items = len({r.item_id for r in analysis.rows})
    with_modes = physical_total - len(cov.parts_without_modes)
    if analysis.mode == "fmea":
        worst = max(analysis.rows, key=lambda r: r.rpn or 0)
        peak = f"Highest RPN: {worst.rpn} ({worst.mode_id})"
        top_cols = ["Item", "Failure mode", "S", "O", "D", "RPN"]
    else:
        worst = max(analysis.rows, key=lambda r: r.c_m or 0.0)
        peak = f"Highest criticality C_m: {worst.c_m:.1e} ({worst.mode_id})"
        top_cols = ["Item", "Failure mode", "S", "Criticality", "Severity class", "Probability level"]
    out = [
        f"# {kind} report: {project_name}", "",
        "## Summary", "",
        f"- Mode: {analysis.mode}",
        f"- Items: {n_items}, failure modes: {len(analysis.rows)}, single points of failure: {len(spof)}",
        f"- {peak}",
        f"- Coverage: {with_modes} of {physical_total} physical parts have failure modes",
        "", "## Top risks", "",
    ]
    top = [{**_common(r), **(_fmea(r) if analysis.mode == "fmea" else _fmeca(r))} for r in analysis.ranking[:5]]
    out += _md_table(top_cols, top)
    out += ["", "## Single points of failure", ""]
    out += _md_table(SPOF_COLUMNS, spof) if spof else ["None."]
    out += ["", "## Criticality matrix", ""] + _matrix(analysis, cfg) + [""]
    if analysis.mode == "fmeca":
        out += _quadrant(analysis) + [""]
    out += ["## Effect chains", ""]
    severe = [r for r in analysis.ranking if r.severity >= cfg.spof_severity_threshold and r.chain]
    for r in severe:
        out += [f"### {r.item_name}: {r.mode_id} (S = {r.severity})", ""] + _chain_block(r, graph) + [""]
    if not severe:
        out += ["None.", ""]
    out += ["## Coverage", "", "Physical parts without failure modes:", ""]
    out += [f"- {_short(i)}" for i in cov.parts_without_modes] or ["- none"]
    if cov.modes_without_trace:
        out += ["", "Failure modes without a trace to the model:", ""] + [f"- {i}" for i in cov.modes_without_trace]
    if cov.requirements_without_group:
        out += ["", "Requirements without a group:", ""] + [
            f"- {_short(i)}" for i in cov.requirements_without_group
        ]
    out.append("")
    if sim is not None:
        shown = [r for r in sim.rows if r["P(LOST)"] > 0 or r["P(DEGRADED)"] > 0]
        out += [
            "## Simulation", "",
            f"{sim.trials} trials, seed {sim.seed}, mission time {sim.mission_time_h:g} h. "
            "Nodes that are never affected are left out; see simulation.csv for all.", "",
        ]
        out += _md_table(SIM_COLUMNS, _sim_cells(shown)) + [""]
    out += ["## Files", ""] + [f"- [{f}]({f})" for f in files] + [""]
    return "\n".join(out)
