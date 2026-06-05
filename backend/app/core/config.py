from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Smart Gym API"


settings = Settings()
