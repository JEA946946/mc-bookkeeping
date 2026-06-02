"""Base settings for dmc-bookkeeping."""

from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = "django-insecure-bookkeeping-dev-key-change-in-production"

DEBUG = False

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "corsheaders",
    # Local apps
    "accounts",
    "journals",
    "sales",
    "purchases",
    "core",
]

MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "dmc_bookkeeping",
        "USER": "postgres",
        "PASSWORD": "securepassword123",
        "HOST": "dmc-cmr-db",
        "PORT": "5432",
    }
}

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Casablanca"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": None,
    "DEFAULT_THROTTLE_RATES": {
        "auth": "10/min",
    },
}

# SimpleJWT
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "userId",
    "TOKEN_OBTAIN_SERIALIZER": "rest_framework_simplejwt.serializers.TokenObtainPairSerializer",
}

# CMR API integration
CMR_API_BASE = "http://dmc_cmr_django_local_django:8000/api/v1"
CMR_API_TOKEN = ""  # Set via env var

# Google Places API
GOOGLE_PLACES_API_KEY = ""

# Default admin password (used for password resets)
DEFAULT_ADMIN_PASSWORD = "Nima2001Fesoy1996@"
