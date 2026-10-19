"""Energy Icons fetcher: CDN URL, optical masters, failure modes."""

from __future__ import annotations

import httpx
import pytest

from adapters.icons.energy import (
    DEFAULT_STYLE,
    ENERGY_PACKAGE,
    ENERGY_VERSION,
    EnergyIconsError,
    EnergyIconsFetcher,
)


class FakeTransport(httpx.BaseTransport):
    def __init__(self, routes: dict[str, tuple[int, str]]) -> None:
        self.routes = routes
        self.requests: list[str] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)
        if url in self.routes:
            status, body = self.routes[url]
            return httpx.Response(status, text=body, request=request)
        return httpx.Response(404, text="not found", request=request)


def _fetcher(
    style: str = DEFAULT_STYLE,
    routes: dict[str, tuple[int, str]] | None = None,
) -> tuple[EnergyIconsFetcher, FakeTransport]:
    transport = FakeTransport(routes or {})
    client = httpx.Client(transport=transport)
    return EnergyIconsFetcher(client=client, style=style), transport


def test_svg_url_uses_pinned_package_and_default_master():
    fetcher, _ = _fetcher()
    url = fetcher.svg_url("pylon")
    assert ENERGY_VERSION in url
    assert ENERGY_PACKAGE in url
    assert url.endswith("/svg/pylon/20.svg")
    assert url.startswith("https://cdn.jsdelivr.net/npm/")


def test_svg_url_bold_48_master():
    fetcher, _ = _fetcher(style="48-bold")
    assert fetcher.svg_url("wind-turbine").endswith("/svg/wind-turbine/48-bold.svg")


def test_invalid_style_rejected():
    with pytest.raises(EnergyIconsError):
        EnergyIconsFetcher(style="outline")


def test_fetch_returns_trimmed_svg():
    fetcher, transport = _fetcher()
    url = fetcher.svg_url("pylon")
    transport.routes[url] = (200, "  <svg xmlns='http://www.w3.org/2000/svg'></svg>\n")
    assert fetcher.fetch("pylon").startswith("<svg")


def test_fetch_http_404_raises():
    fetcher, transport = _fetcher()
    transport.routes[fetcher.svg_url("pylon")] = (404, "missing")
    with pytest.raises(EnergyIconsError):
        fetcher.fetch("pylon")


def test_fetch_non_svg_raises():
    fetcher, transport = _fetcher()
    transport.routes[fetcher.svg_url("pylon")] = (200, "not-svg")
    with pytest.raises(EnergyIconsError):
        fetcher.fetch("pylon")


def test_fetch_network_error_raises():
    class BoomTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

    fetcher = EnergyIconsFetcher(client=httpx.Client(transport=BoomTransport()))
    with pytest.raises(EnergyIconsError):
        fetcher.fetch("pylon")
