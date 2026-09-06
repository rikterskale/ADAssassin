from __future__ import annotations

import argparse
import webbrowser
from threading import Timer

import uvicorn

from adassassin import DEFAULT_HOST, DEFAULT_PORT, __version__
from adassassin.app import create_app
from adassassin.config import get_settings, is_loopback_host


def _port(value: str) -> int:
    try:
        port = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("port must be an integer") from exc
    if not 1 <= port <= 65535:
        raise argparse.ArgumentTypeError("port must be between 1 and 65535")
    return port


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="adassassin",
        description="ADAssassin web console for authorized AD assessments.",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="Loopback bind address only (default 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=_port, default=None, help=f"Local port (default {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--no-browser", action="store_true", help="Do not open the browser on startup"
    )
    parser.add_argument("--version", action="version", version=f"adassassin {__version__}")
    args = parser.parse_args(argv)

    settings = get_settings()
    settings.host = args.host or settings.host or DEFAULT_HOST
    if not is_loopback_host(settings.host):
        parser.error(
            "ADAssassin is a local single-operator console and refuses non-loopback binds. "
            "Use 127.0.0.1 or localhost."
        )
    if args.port is not None:
        settings.port = args.port
    settings.open_browser = settings.open_browser and not args.no_browser

    url = f"http://{settings.host}:{settings.port}"
    if settings.open_browser:
        Timer(0.8, lambda: webbrowser.open(url)).start()

    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")
    return 0
