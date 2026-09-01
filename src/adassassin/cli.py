from __future__ import annotations

import argparse
import webbrowser
from threading import Timer

import uvicorn

from adassassin import DEFAULT_HOST, DEFAULT_PORT, __version__
from adassassin.app import create_app
from adassassin.config import get_settings


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="adassassin",
        description="ADAssassin web console for authorized AD assessments.",
    )
    parser.add_argument("--host", default=DEFAULT_HOST, help="Bind address (default 127.0.0.1)")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--version", action="version", version=f"adassassin {__version__}")
    args = parser.parse_args(argv)

    settings = get_settings()
    settings.host = args.host
    settings.port = args.port
    settings.open_browser = not args.no_browser

    url = f"http://{settings.host}:{settings.port}"
    if settings.open_browser:
        Timer(0.8, lambda: webbrowser.open(url)).start()

    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, log_level="info")
    return 0
