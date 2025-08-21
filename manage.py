#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys

def main():
    """Run administrative tasks."""
    # Allow DJANGO_SETTINGS_MODULE override; default to core.settings
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", os.getenv("DJANGO_SETTINGS_MODULE", "core.settings"))

    # Optional: load .env early so manage.py commands see env vars
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
    except Exception:
        # dotenv is optional; ignore if not installed
        pass

    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
            raise ImportError(
                "Couldn't import Django. Is it installed and on PYTHONPATH? "
                "Did you activate your virtual environment?"
            ) from exc

    try:
        execute_from_command_line(sys.argv)
    except KeyboardInterrupt:
        # Graceful exit on Ctrl+C
        sys.exit(130)

if __name__ == "__main__":
    main()
