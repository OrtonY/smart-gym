from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Smart Gym API"
    database_url: str = "postgresql+psycopg://smart_gym:smart_gym@localhost:5432/smart_gym"
    jwt_secret_key: str = "change-me-in-dev"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    local_storage_dir: str = "storage"

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )


settings = Settings()
