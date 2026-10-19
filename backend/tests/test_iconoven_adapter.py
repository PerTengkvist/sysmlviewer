"""IconOven fetcher: flat CDN URL, style round/sharp, failure modes."""

from __future__ import annotations

import httpx
import pytest

from adapters.icons.iconoven import (
    ICONOVEN_PACKAGE,
    ICONOVEN_VERSION,
    IconOvenError,
    IconOvenFetcher,
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
    style: str = "round",
    routes: dict[str, tuple[int, str]] | None = None,
) -> tuple[IconOvenFetcher, FakeTransport]:
    transport = FakeTransport(routes or {})
    client = httpx.Client(transport=transport)
    return IconOvenFetcher(client=client, style=style), transport


def test_svg_url_uses_pinned_package_and_round_style():
    fetcher, _ = _fetcher()
    url = fetcher.svg_url("home")
    assert ICONOVEN_VERSION in url
    assert ICONOVEN_PACKAGE in url
    assert url.endswith("/round/home.svg")
    assert url.startswith("https://cdn.jsdelivr.net/npm/")


def test_svg_url_sharp_style():
    fetcher, _ = _fetcher(style="sharp")
    assert fetcher.svg_url("home").endswith("/sharp/home.svg")


def test_invalid_style_rejected():
    with pytest.raises(IconOvenError):
        IconOvenFetcher(style="duotone")


def test_fetch_returns_trimmed_svg():
    fetcher, transport = _fetcher()
    url = fetcher.svg_url("home")
    transport.routes[url] = (200, "  <svg xmlns='http://www.w3.org/2000/svg'></svg>\n")
    assert fetcher.fetch("home").startswith("<svg")


def test_fetch_http_404_raises():
    fetcher, transport = _fetcher()
    transport.routes[fetcher.svg_url("home")] = (404, "missing")
    with pytest.raises(IconOvenError):
        fetcher.fetch("home")


def test_fetch_non_svg_raises():
    fetcher, transport = _fetcher()
    transport.routes[fetcher.svg_url("home")] = (200, "not-svg")
    with pytest.raises(IconOvenError):
        fetcher.fetch("home")


def test_fetch_network_error_raises():
    class BoomTransport(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom", request=request)

    fetcher = IconOvenFetcher(client=httpx.Client(transport=BoomTransport()))
    with pytest.raises(IconOvenError):
        fetcher.fetch("home")
