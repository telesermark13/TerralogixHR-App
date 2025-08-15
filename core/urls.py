"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views.
https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""
from django.contrib import admin
from django.contrib.admin.views.decorators import staff_member_required
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

from api import views as api
from api.views import home
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

urlpatterns = [
    # Django Admin
    path("admin/", admin.site.urls),

    # JWT Auth
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/verify/", TokenVerifyView.as_view(), name="token_verify"),

    # App API routes
    path("api/", include("api.urls")),

    # === Payslip export endpoints (moved away from /admin/) ===
    path(
        "exports/payslips/<int:payslip_id>/pdf/",
        staff_member_required(api.export_payslip_pdf_single),
        name="export_payslip_pdf_single",
    ),
    path(
        "exports/payslips/employee/<int:employee_id>/pdf/",
        staff_member_required(api.export_payslips_pdf_employee),  # Corrected to the correct function name
        name="export_payslips_pdf_employee",  # Corrected name
    ),
    path(
        "exports/payslips/export/csv/",
        staff_member_required(api.export_payslips_csv),
        name="export_payslips_csv",
    ),
    path(
        "exports/payslips/export/excel/",
        staff_member_required(api.export_payslips_excel),
        name="export_payslips_excel",
    ),
    # === End exports ===

    # Root
    path("", home, name="home"),
]

# Serve media in DEBUG
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
