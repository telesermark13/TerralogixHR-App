"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views.
https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

from api import views as api  # <-- add this to reference export endpoints
from api.views import home
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT endpoints
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/token/verify/', TokenVerifyView.as_view(), name='token_verify'),

    # Your API app routes (routers, other endpoints)
    path('api/', include('api.urls')),

    # Payslip export endpoints (unique names; no conflicts)
    path('admin/payslips/<int:payslip_id>/pdf/', api.export_payslip_pdf_single, name='export_payslip_pdf_single'),
    path('admin/payslips/employee/<int:employee_id>/pdf/', api.export_payslips_pdf_employee, name='export_payslips_pdf_employee'),
    path('admin/payslips/<int:employee_id>/<str:period>/pdf/', api.export_payslip_pdf_by_period, name='export_payslip_pdf_by_period'),
    path('admin/payslips/export/csv/', api.export_payslips_csv, name='export_payslips_csv'),
    path('admin/payslips/export/excel/', api.export_payslips_excel, name='export_payslips_excel'),

    # Root
    path('', home, name='home'),
]

# Serve media in DEBUG
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
