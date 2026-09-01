from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

from adassassin import DEFAULT_HOST, DEFAULT_PORT


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ADASSASSIN_", extra="ignore")

    host: str = DEFAULT_HOST
    port: int = DEFAULT_PORT
    data_dir: Path = Path.home() / ".adassassin"
    open_browser: bool = True
    # When true, capability runs execute inline instead of on a background
    # thread. Production leaves this false (non-blocking runs + live progress);
    # tests enable it so a run completes within the POST for deterministic
    # assertions.
    run_synchronous: bool = False

    @property
    def engagements_dir(self) -> Path:
        return self.data_dir / "engagements"


def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.engagements_dir.mkdir(parents=True, exist_ok=True)
    return settings
