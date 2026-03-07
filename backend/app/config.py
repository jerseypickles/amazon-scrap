from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load .env with override=True so .env values take precedence
# over empty shell env vars (e.g. ANTHROPIC_API_KEY='' set by tools)
load_dotenv(override=True)


class Settings(BaseSettings):
    scraper_api_key: str = ""
    mongodb_uri: str = ""
    cors_origins: str = "http://localhost:3000"
    anthropic_api_key: str = ""
    keepa_api_key: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
