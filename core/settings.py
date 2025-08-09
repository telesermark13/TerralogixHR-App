import os
from pathlib import Path
from dotenv import load_dotenv
import dj_database_url
import pymysql
from datetime import timedelta  # (you already used timedelta below)

load_dotenv()
pymysql.install_as_MySQLdb()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY')
DEBUG = os.getenv('DEBUG', 'False').lower() in ['true', '1', 't']

ALLOWED_HOSTS = [
    'terralogixcorp.com',
    'www.terralogixcorp.com',
    'localhost',
    '127.0.0.1',
    'terralogixhr-app.onrender.com',
    '.onrender.com',
    'terralogixhr-app-production.up.railway.app',
]

#  Needed for admin/forms/CSRf with HTTPS origins
CSRF_TRUSTED_ORIGINS = [
    'https://terralogixcorp.com',
    'https://www.terralogixcorp.com',
    'https://terralogixhr-app-production.up.railway.app',
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'api',
    'django_filters',  # ✅ you reference DjangoFilterBackend in REST_FRAMEWORK
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',  # ✅ serve collected static files reliably on Railway
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'

# ✅ Robust DATABASE_URL handling with persistent connections
DATABASES = {
    'default': dj_database_url.config(
        env='DATABASE_URL',
        conn_max_age=600,        # keep connections open for perf
        ssl_require=False,       # set True if your MySQL host requires SSL
    )
}

if not DATABASES.get('default'):
    # Fail fast with a clear message if env var is missing
    raise RuntimeError(
        "DATABASE_URL is not set. Example (MySQL): "
        "mysql://USER:PASS@HOST:3306/DBNAME"
    )

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
# ✅ WhiteNoise compression/manifest for cache-busting
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

CORS_ALLOW_ALL_ORIGINS = True

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 10,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}
REST_FRAMEWORK.update({
    "DEFAULT_SCHEMA_CLASS": "rest_framework.schemas.openapi.AutoSchema",
})
# (Keeping your lifetimes as-is; consider reducing in production)
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=100*365),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=100*3650),
}

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('EMAIL_HOST')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'false').lower() in ['true', '1', 't']
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'false').lower() in ['true', '1', 't']
