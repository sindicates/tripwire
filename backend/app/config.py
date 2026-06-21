import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", "../.env.local", ".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/tripwire"
    REDIS_URL: str = "redis://localhost:6379/0"

    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    SUPABASE_URL: str = ""
    SUPABASE_PUBLIC_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""

    COLLEGE_SCORECARD_API_KEY: str = ""

    SENDGRID_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = ""

    SECRET_KEY: str = "change-me-in-production"
    ENVIRONMENT: str = "development"
    # Stored as str so pydantic-settings never tries to JSON-parse it from env
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    def allowed_origins(self) -> list[str]:
        """Parse ALLOWED_ORIGINS as JSON array or comma-separated string."""
        try:
            result = json.loads(self.ALLOWED_ORIGINS)
            return result if isinstance(result, list) else [self.ALLOWED_ORIGINS]
        except (json.JSONDecodeError, TypeError):
            return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]


settings = Settings()
