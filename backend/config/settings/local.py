"""Local development settings."""

import os

from .base import *  # noqa: F401,F403

DEBUG = True

ALLOWED_HOSTS = ["*"]

# Override database host for local development (Docker vs host)
DATABASES["default"]["HOST"] = os.environ.get("DB_HOST", "dmc-cmr-db")  # noqa: F405
DATABASES["default"]["PASSWORD"] = os.environ.get("DB_PASSWORD", "securepassword123")  # noqa: F405

# CORS — allow frontend dev server
CORS_ALLOW_ALL_ORIGINS = True

# CMR API token from environment
CMR_API_TOKEN = os.environ.get("CMR_API_TOKEN", "")  # noqa: F811
CMR_API_BASE = os.environ.get("CMR_API_BASE", "http://dmc_cmr_django_local_django:8000/api/v1")  # noqa: F811
