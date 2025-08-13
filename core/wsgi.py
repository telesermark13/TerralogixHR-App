"""
WSGI config for core project.

This module exposes the WSGI callable as a module-level variable named ``application``.

WSGI is used by traditional hosting services (Gunicorn, uWSGI, etc.) to serve Django.

For more information:
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os
from django.core.wsgi import get_wsgi_application

# Ensure the correct settings module is loaded
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    os.getenv("DJANGO_SETTINGS_MODULE", "core.settings")
)

# Create the WSGI application object
application = get_wsgi_application()
