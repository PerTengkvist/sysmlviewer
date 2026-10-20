"""Energy Icons fetcher via Iconify API."""

from __future__ import annotations

import httpx
import pytest

from adapters.icons.energy import (
    DEFAULT_STYLE,
    ICONIFY_API,
    ICONIFY_PREFIX,
    EnergyIconsError,
    EnergyIconsFetcher,
    resolve_iconify_name,
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


def test_resolve_appends_master_suffix():
    assert resolve_iconify_name("busbar", "20") == "busbar-20"
    assert resolve_iconify_name("busbar", "48-bold") == "busbar-48-bold"


def test_resolve_keeps_existing_master_suffix():
    assert resolve_iconify_name("busbar-20", "48") == "busbar-20"
    assert resolve_iconify_name("pylon-48-bold", "20") == "pylon-48-bold"


def test_svg_url_uses_iconify_api():
    fetcher, _ = _fetcher()
    url = fetcher.svg_url("busbar")
    assert url.startswith(ICONIFY_API)
    assert f"/{ICONIFY_PREFIX}/busbar-20.svg" in url


def test_svg_url_accepts_iconify_style_slug():
    fetcher, _ = _fetcher(style="20")
    assert fetcher.svg_url("busbar-20").endswith("/energy-icons/busbar-20.svg")


def test_svg_url_bold_48_master():
    fetcher, _ = _fetcher(style="48-bold")
    assert fetcher.svg_url("wind-turbine").endswith(
        "/energy-icons/wind-turbine-48-bold.svg"
    )


def test_invalid_style_rejected():
    with pytest.raises(EnergyIconsError):
        EnergyIconsFetcher(style="outline")


def test_fetch_returns_trimmed_svg():
    fetcher, transport = _fetcher()
    url = fetcher.svg_url("busbar")
    transport.routes[url] = (200, "  <svg xmlns='http://www.w3.org/2000/svg'></svg>\n")
    assert fetcher.fetch("busbar").startswith("<svg")


def test_fetch_http_404_raises():
    fetcher, transport = _fetcher()
    transport.routes[fetcher.svg_url("missing")] = (404, "missing")
    with pytest.raises(EnergyIconsError):
        fetcher.fetch("missing")


def test_fetch_non_svg_raises():
    fetcher, transport = _fetcher()
    transport.routes[fetcher.svg_url("busbar")] = (200, "not-svg")
    with pytest.raises(EnergyIconsError):
        fetcher.fetch("busbar")


def test_fetch_network_error_raises():
    class BoomTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

    fetcher = EnergyIconsFetcher(client=httpx.Client(transport=BoomTransport()))
    with pytest.raises(EnergyIconsError):
        fetcher.fetch("busbar")
