"""Pydantic models of the FMEA/FMECA data files.

Every field is optional in the schema when it is only needed in one of the two
modes; `validate(..., mode=...)` checks the per-mode requirements. The field
descriptions say which mode needs a field, so the editor shows it.

The models take already parsed mappings: reading YAML is an adapter's job.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    field_validator,
    model_validator,
)

ID_PATTERN = r"^[a-z][a-z0-9_]*$"

_RATE = "failure rate in FIT (failures per 1e9 h)."
_FMECA = "Needed for --mode fmeca."
_FMEA_O = (
    "Needed for --mode fmea, unless 'rate_fit' and 'mode_ratio' are given together with an "
    "'occurrence_scale' in severity.yaml; an explicit value always wins."
)


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LocalEffect(_Strict):
    kind: Literal["loss", "degraded", "erroneous"] = Field(
        description="What the failure does to the item. 'erroneous' is treated as loss and flagged."
    )
    fraction: float | None = Field(
        default=None,
        description="Remaining capability in (0, 1), required for 'degraded' and not allowed otherwise.",
    )

    @model_validator(mode="after")
    def _check_fraction(self) -> LocalEffect:
        if self.kind == "degraded":
            if self.fraction is None or not 0 < self.fraction < 1:
                raise ValueError("a degraded effect needs a 'fraction' in (0, 1)")
        elif self.fraction is not None:
            raise ValueError(f"a {self.kind} effect has no 'fraction'")
        return self


class Detection(_Strict):
    method: str | None = Field(default=None, description="How the failure is detected.")
    score: int | None = Field(
        default=None, ge=1, le=10, description="Detection score D, 1 (always found) to 10. Needed for --mode fmea."
    )


class _ModeFields(_Strict):
    description: str | None = Field(default=None, description="What fails, and how.")
    local_effect: LocalEffect | None = None
    mode_ratio: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description=f"Share (alpha) of the item's failures that has this mode. {_FMECA}",
    )
    effect_probability: float | None = Field(
        default=None,
        ge=0,
        le=1,
        description=f"Probability (beta) that the failure has the stated effect. {_FMECA}",
    )
    occurrence: int | None = Field(default=None, ge=1, le=10, description=f"Occurrence score O, 1 to 10. {_FMEA_O}")
    detection: Detection | None = None
    mitigation: str | None = Field(default=None, description="Design or process measure against the mode.")


class FailureMode(_ModeFields):
    id: str = Field(pattern=ID_PATTERN, description="Mode id, unique within its item or SRU.")
    local_effect: LocalEffect = Field(description="The local effect of the mode on its item.")


class ModeOverride(_ModeFields):
    id: str = Field(pattern=ID_PATTERN, description="Id of the library mode to change.")


def _check_modes(modes: list[FailureMode]) -> list[FailureMode]:
    seen: set[str] = set()
    for mode in modes:
        if mode.id in seen:
            raise ValueError(f"duplicate failure mode id '{mode.id}'")
        seen.add(mode.id)
    return modes


class Sru(_Strict):
    id: str = Field(description="Name of the sub-unit (SRU) of the item.")
    rate_fit: float | None = Field(default=None, ge=0, description=f"Rate of the SRU, {_RATE} {_FMECA}")
    failure_modes: list[FailureMode] = Field(default_factory=list)

    _modes = field_validator("failure_modes")(_check_modes)


class PartLibrary(_Strict):
    part_def: str = Field(description="Qualified name of the part definition. Applies to every usage typed by it.")
    rate_fit: float | None = Field(default=None, ge=0, description=f"Rate per item, {_RATE} {_FMECA}")
    failure_modes: list[FailureMode] = Field(default_factory=list)

    _modes = field_validator("failure_modes")(_check_modes)


class InstanceEntry(_Strict):
    part: str = Field(description="Qualified name of a part usage (an LRU, or any part with its own data).")
    rate_fit: float | None = Field(
        default=None, ge=0, description=f"Rate of the item, {_RATE} Overrides the library. {_FMECA}"
    )
    failure_modes: list[FailureMode] = Field(default_factory=list)
    srus: list[Sru] = Field(default_factory=list, description="Sub-units that are not modelled in SysML.")
    overrides: list[ModeOverride] = Field(
        default_factory=list, description="Changes to library modes, by mode id, for this usage only."
    )

    _modes = field_validator("failure_modes")(_check_modes)


class ScaleStep(_Strict):
    max_fit: float = Field(ge=0, description="Upper limit of the step in FIT (inclusive).")
    score: int = Field(ge=1, le=10)


class SeverityClass(_Strict):
    min_severity: int = Field(ge=1, le=10)
    label: str


class ProbabilityLevel(_Strict):
    min_cm: float = Field(ge=0, description="Lowest criticality C_m (inclusive) that gets this level.")
    label: str


def _default_severity_classes() -> list[SeverityClass]:
    return [SeverityClass(min_severity=s, label=l) for s, l in ((9, "I"), (7, "II"), (4, "III"), (1, "IV"))]


def _default_probability_levels() -> list[ProbabilityLevel]:
    return [
        ProbabilityLevel(min_cm=c, label=l)
        for c, l in ((0.2, "A"), (0.1, "B"), (0.01, "C"), (0.001, "D"), (0.0, "E"))
    ]


class StatusFactor(_Strict):
    LOST: float = Field(ge=0, le=1)
    DEGRADED: float = Field(ge=0, le=1)


class SeverityConfig(_Strict):
    requirement_groups: dict[str, Annotated[int, Field(ge=1, le=10)]] = Field(
        description="Severity score 1-10 per requirement group (the 'Type' of a requirement). Needed in both modes."
    )
    status_factor: StatusFactor = Field(
        description="Factor per status, 'LOST' and 'DEGRADED', each in [0, 1]. Needed in both modes."
    )
    default_group_score: int = Field(default=1, ge=1, le=10, description="Score of a requirement without group.")
    spof_severity_threshold: int = Field(default=8, ge=1, le=10, description="Smallest S of a single point of failure.")
    mission_time_h: float | None = Field(default=None, gt=0, description=f"Mission time t in hours. {_FMECA}")
    occurrence_scale: list[ScaleStep] | None = Field(
        default=None,
        description=(
            "Occurrence O from the mode rate lambda_m = rate_fit * mode_ratio, for --mode fmea. "
            "Ascending steps; a rate above the last step gets 10."
        ),
    )
    severity_classes: list[SeverityClass] = Field(
        default_factory=_default_severity_classes,
        description="Severity classes for --mode fmeca, from the most severe, by smallest S.",
    )
    probability_levels: list[ProbabilityLevel] = Field(
        default_factory=_default_probability_levels,
        description="Probability levels for --mode fmeca, from the most probable, by smallest C_m.",
    )

    @field_validator("occurrence_scale")
    @classmethod
    def _scale(cls, value: list[ScaleStep] | None) -> list[ScaleStep] | None:
        if value is not None:
            limits = [s.max_fit for s in value]
            if any(b <= a for a, b in zip(limits, limits[1:])):
                raise ValueError("occurrence_scale must have strictly ascending max_fit")
        return value

    @field_validator("severity_classes")
    @classmethod
    def _classes(cls, value: list[SeverityClass]) -> list[SeverityClass]:
        floors = [c.min_severity for c in value]
        if not value or any(b >= a for a, b in zip(floors, floors[1:])) or floors[-1] != 1:
            raise ValueError("severity_classes must descend in min_severity and end at 1")
        return value

    @field_validator("probability_levels")
    @classmethod
    def _levels(cls, value: list[ProbabilityLevel]) -> list[ProbabilityLevel]:
        floors = [p.min_cm for p in value]
        if not value or any(b >= a for a, b in zip(floors, floors[1:])) or floors[-1] != 0:
            raise ValueError("probability_levels must descend in min_cm and end at 0")
        return value


def instances_model() -> TypeAdapter[list[InstanceEntry]]:
    """`instances.yaml` is a list of entries."""
    return TypeAdapter(list[InstanceEntry])


def library_json_schema() -> dict[str, Any]:
    return PartLibrary.model_json_schema()


def instances_json_schema() -> dict[str, Any]:
    return instances_model().json_schema()


def severity_json_schema() -> dict[str, Any]:
    return SeverityConfig.model_json_schema()
