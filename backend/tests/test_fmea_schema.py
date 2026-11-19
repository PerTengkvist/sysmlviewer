"""Pydantic schema of the FMEA/FMECA data files (step 14)."""

from __future__ import annotations

import copy
import json
import tomllib
from pathlib import Path

import pytest
from pydantic import ValidationError

from domain.fmea.schema import (
    InstanceEntry,
    PartLibrary,
    SeverityConfig,
    instances_json_schema,
    instances_model,
    library_json_schema,
    severity_json_schema,
)

REPO = Path(__file__).resolve().parents[2]

BATTERY = {
    "part_def": "PhysicalArchitecture::BatteryModule",
    "rate_fit": 500,
    "failure_modes": [
        {
            "id": "cell_short",
            "description": "Internal short circuit in a cell",
            "local_effect": {"kind": "loss"},
            "mode_ratio": 0.25,
            "effect_probability": 1.0,
            "occurrence": 5,
            "detection": {"method": "BMS cell voltage monitoring", "score": 3},
        },
        {
            "id": "capacity_fade",
            "local_effect": {"kind": "degraded", "fraction": 0.8},
            "mode_ratio": 0.75,
            "effect_probability": 1.0,
            "occurrence": 6,
            "detection": {"score": 2},
        },
    ],
}

SEVERITY = {
    "requirement_groups": {"Safety": 10, "Comfort": 3},
    "status_factor": {"LOST": 1.0, "DEGRADED": 0.6},
}


def test_valid_library_both_modes():
    lib = PartLibrary.model_validate(BATTERY)
    assert lib.rate_fit == 500
    assert len(lib.failure_modes) == 2
    first = lib.failure_modes[0]
    assert (first.occurrence, first.mode_ratio, first.effect_probability) == (5, 0.25, 1.0)
    assert first.detection.score == 3
    assert lib.failure_modes[1].local_effect.fraction == 0.8


def test_valid_library_fmea_only():
    data = {
        "part_def": "P::D",
        "failure_modes": [
            {"id": "a", "local_effect": {"kind": "loss"}, "occurrence": 4, "detection": {"score": 5}}
        ],
    }
    lib = PartLibrary.model_validate(data)
    assert lib.rate_fit is None and lib.failure_modes[0].mode_ratio is None


def test_valid_library_fmeca_only():
    data = {
        "part_def": "P::D",
        "rate_fit": 10,
        "failure_modes": [
            {"id": "a", "local_effect": {"kind": "loss"}, "mode_ratio": 1.0, "effect_probability": 1.0}
        ],
    }
    lib = PartLibrary.model_validate(data)
    assert lib.failure_modes[0].occurrence is None and lib.failure_modes[0].detection is None


def test_valid_instances_with_srus_and_overrides():
    entries = instances_model().validate_python(
        [
            {
                "part": "P::V::driveEcu",
                "srus": [
                    {
                        "id": "powerSupply",
                        "rate_fit": 50,
                        "failure_modes": [
                            {"id": "psu_dead", "local_effect": {"kind": "loss"}, "mode_ratio": 1.0}
                        ],
                    }
                ],
            },
            {"part": "P::V::modules", "overrides": [{"id": "cell_short", "mode_ratio": 0.3}]},
        ]
    )
    assert entries[0].srus[0].id == "powerSupply"
    assert entries[1].overrides[0].mode_ratio == 0.3


def _mutate(base, fn):
    data = copy.deepcopy(base)
    fn(data)
    return data


def _mode(data, **changes):
    data["failure_modes"][0].update(changes)


@pytest.mark.parametrize(
    "mutation, where",
    [
        (lambda d: _mode(d, local_effect={"kind": "degraded"}), "local_effect"),
        (lambda d: _mode(d, local_effect={"kind": "degraded", "fraction": 1.0}), "local_effect"),
        (lambda d: _mode(d, local_effect={"kind": "loss", "fraction": 0.5}), "local_effect"),
        (lambda d: d.update(rate_fit=-1), "rate_fit"),
        (lambda d: _mode(d, mode_ratio=1.2), "mode_ratio"),
        (lambda d: _mode(d, effect_probability=-0.1), "effect_probability"),
        (lambda d: _mode(d, occurrence=0), "occurrence"),
        (lambda d: _mode(d, occurrence=11), "occurrence"),
        (lambda d: _mode(d, detection={"score": 0}), "score"),
        (lambda d: _mode(d, detection={"score": 11}), "score"),
        (lambda d: _mode(d, colour="red"), "colour"),
        (lambda d: d.update(severity="high"), "severity"),
        (lambda d: _mode(d, id="Cell Short"), "id"),
        (lambda d: d["failure_modes"].append(dict(d["failure_modes"][0])), "failure_modes"),
        (lambda d: _mode(d, mode_ratio=0.9), "failure_modes"),  # 0.9 + 0.75 > 1
    ],
)
def test_invalid_library(mutation, where):
    with pytest.raises(ValidationError) as exc:
        PartLibrary.model_validate(_mutate(BATTERY, mutation))
    locs = [".".join(str(p) for p in e["loc"]) for e in exc.value.errors()]
    assert any(where in loc or where in e["msg"] for loc, e in zip(locs, exc.value.errors())), locs


def test_invalid_instance_ratio_sum_per_sru():
    entry = {
        "part": "P::V::x",
        "srus": [
            {
                "id": "s",
                "failure_modes": [
                    {"id": "a", "local_effect": {"kind": "loss"}, "mode_ratio": 0.7},
                    {"id": "b", "local_effect": {"kind": "loss"}, "mode_ratio": 0.7},
                ],
            }
        ],
    }
    with pytest.raises(ValidationError) as exc:
        InstanceEntry.model_validate(entry)
    assert "mode ratios sum to 1.4" in str(exc.value)


def test_invalid_severity_missing_lost():
    with pytest.raises(ValidationError) as exc:
        SeverityConfig.model_validate({**SEVERITY, "status_factor": {"DEGRADED": 0.6}})
    assert "LOST" in str(exc.value)


def test_invalid_occurrence_scale_not_ascending():
    scale = [{"max_fit": 10, "score": 2}, {"max_fit": 5, "score": 3}]
    with pytest.raises(ValidationError) as exc:
        SeverityConfig.model_validate({**SEVERITY, "occurrence_scale": scale})
    assert "occurrence_scale" in str(exc.value)


def test_severity_defaults():
    cfg = SeverityConfig.model_validate(SEVERITY)
    assert cfg.mission_time_h is None and cfg.occurrence_scale is None
    assert cfg.default_group_score == 1 and cfg.spof_severity_threshold == 8
    assert [(c.min_severity, c.label) for c in cfg.severity_classes] == [
        (9, "I"), (7, "II"), (4, "III"), (1, "IV")
    ]
    assert [(p.min_cm, p.label) for p in cfg.probability_levels] == [
        (0.2, "A"), (0.1, "B"), (0.01, "C"), (0.001, "D"), (0.0, "E")
    ]


def test_mode_ratio_sum_below_one_warns():
    data = _mutate(BATTERY, lambda d: _mode(d, mode_ratio=0.05))
    lib = PartLibrary.model_validate(data)
    assert lib.warnings() == ["PhysicalArchitecture::BatteryModule: mode ratios sum to 0.8"]


def test_mode_ratio_sum_one_has_no_warning():
    assert PartLibrary.model_validate(BATTERY).warnings() == []


SCHEMA_FILES = {
    "fmea-library.schema.json": library_json_schema,
    "fmea-instances.schema.json": instances_json_schema,
    "fmea-severity.schema.json": severity_json_schema,
}


@pytest.mark.parametrize("name", sorted(SCHEMA_FILES))
def test_json_schema_matches_committed(name):
    committed = json.loads((REPO / "docs" / "schemas" / name).read_text(encoding="utf-8"))
    assert SCHEMA_FILES[name]() == committed


def test_json_schema_marks_fields_by_mode():
    schema = library_json_schema()
    mode = schema["$defs"]["FailureMode"]["properties"]
    assert "--mode fmeca" in mode["mode_ratio"]["description"]
    assert "--mode fmea" in mode["occurrence"]["description"]


def test_pyyaml_is_declared():
    project = tomllib.loads((REPO / "backend" / "pyproject.toml").read_text(encoding="utf-8"))
    assert any(d.lower().startswith("pyyaml") for d in project["project"]["dependencies"])
