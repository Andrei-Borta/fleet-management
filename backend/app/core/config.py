from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://fleet:fleet@localhost:5432/fleet"
    cors_origins: str = "http://localhost:4200"


settings = Settings()
