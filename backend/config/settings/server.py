"""Server settings for production deployment."""

import os

from .base import *  # noqa: F401,F403

DEBUG = False
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", SECRET_KEY)  # noqa: F405
ALLOWED_HOSTS = os.environ.get(
    "DJANGO_ALLOWED_HOSTS", "bookkeeping.vmmorocco.com"
).split(",")

DATABASES["default"]["HOST"] = os.environ.get("DB_HOST", "dmc-cmr-db")  # noqa: F405
DATABASES["default"]["PASSWORD"] = os.environ.get(  # noqa: F405
    "DB_PASSWORD", "securepassword123"
)

CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS", "https://bookkeeping.vmmorocco.com"
).split(",")
CORS_ALLOW_CREDENTIALS = True

CMR_API_TOKEN = os.environ.get("CMR_API_TOKEN", "")
CMR_API_BASE = os.environ.get(
    "CMR_API_BASE", "http://dmc_cmr_django_local_django:8000/api/v1"
)

GOOGLE_PLACES_API_KEY = os.environ.get(
    "GOOGLE_PLACES_API_KEY", "AIzaSyBiq1ihjEaJkJlJuG7aLQtGzfm3RvrH4tQ"
)

DEFAULT_ADMIN_PASSWORD = os.environ.get(
    "DEFAULT_ADMIN_PASSWORD", "Nima2001Fesoy1996@"
)

# Security (SSL handled by Nginx/Certbot)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# SimpleJWT — use production secret key for signing
SIMPLE_JWT["SIGNING_KEY"] = SECRET_KEY  # noqa: F405
