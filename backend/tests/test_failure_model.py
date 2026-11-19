"""Failure specs (`--fail`) and status thresholds."""

from __future__ import annotations

import pytest

from domain.failure.model import FailureKind, Status, parse_failure_spec, status_of


def test_parse_loss():
    assert parse_failure_spec("electricMotor:loss") == (
        "electricMotor",
        FailureKind.LOSS,
        None,
        None,
    )


def test_parse_loss_with_count():
    assert parse_failure_spec("batteryPack.modules:loss:2") == (
        "batteryPack.modules",
        FailureKind.LOSS,
        None,
        2,
    )


def test_parse_degraded():
    assert parse_failure_spec("driveEcu:degraded:0.5") == (
        "driveEcu",
        FailureKind.DEGRADED,
        0.5,
        None,
    )
    assert parse_failure_spec("m:degraded:0.8:1") == ("m", FailureKind.DEGRADED, 0.8, 1)


def test_parse_erroneous():
    assert parse_failure_spec("x:erroneous")[1] is FailureKind.ERRONEOUS


@pytest.mark.parametrize(
    "spec, message",
    [
        ("x", "expected <name>:<kind>"),
        ("x:broken", "unknown kind 'broken'"),
        ("x:degraded", "degraded needs a fraction"),
        ("x:degraded:1.0", "fraction must be in (0, 1)"),
        ("x:degraded:0", "fraction must be in (0, 1)"),
        ("x:loss:0", "count must be a positive integer"),
        ("x:loss:-1", "count must be a positive integer"),
        ("x:loss:a", "count must be a positive integer"),
    ],
)
def test_parse_errors(spec, message):
    with pytest.raises(ValueError) as exc:
        parse_failure_spec(spec)
    assert message in str(exc.value)


def test_status_thresholds():
    assert status_of(1.0) is Status.OK
    assert status_of(1 - 1e-12) is Status.OK
    assert status_of(0.5) is Status.DEGRADED
    assert status_of(1e-12) is Status.LOST
    assert status_of(0.0) is Status.LOST
