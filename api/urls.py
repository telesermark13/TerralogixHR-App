from django.urls import path, include
from rest_framework.routers import DefaultRouter
from django.contrib.auth import views as auth_views
from .views import (
    hello_world, my_profile, register_user, change_password,
    generate_attendance_qr, qr_attendance_checkin, time_in, time_out,
    export_attendance_csv, export_attendance_excel, save_push_token,
    admin_dashboard_stats, attendance_trend, admin_list_employees, admin_list_leaves,
    admin_decide_leave, admin_list_users, admin_demote_user, admin_reset_password,
    invite_user, accept_invite, admin_create_payslip, export_payslips_csv, export_payslip_pdf,
    export_payslips_excel, EmployeePhotoUploadView,send_push_notification,employee_photo_upload,
    UserViewSet, EmployeeViewSet, PayrollViewSet, PayslipViewSet, AttendanceViewSet,
    DepartmentViewSet, LeaveTypeViewSet, LeaveRequestViewSet, AnnouncementViewSet,AuditLogList,
    NotificationViewSet, AuditLogViewSet, UserInvitationViewSet, PushTokenViewSet,dashboard_stats
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'employees', EmployeeViewSet)
router.register(r'payrolls', PayrollViewSet)
router.register(r'payslips', PayslipViewSet)
router.register(r'attendances', AttendanceViewSet, basename='attendances')
router.register(r'departments', DepartmentViewSet)
router.register(r'leave-types', LeaveTypeViewSet)
router.register(r'leaves', LeaveRequestViewSet, basename='leaves')
router.register(r'announcements', AnnouncementViewSet)
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'audit-logs', AuditLogViewSet, basename='auditlog')
router.register(r'invitations', UserInvitationViewSet, basename='invitation')
router.register(r'push-tokens', PushTokenViewSet, basename='pushtoken')

urlpatterns = [
    path('hello/', hello_world, name='hello'),
    path('profile/', my_profile, name='profile'),
    path('register/', register_user, name='register'),
    path('change-password/', change_password, name='change-password'),

    path('attendance/qr/', generate_attendance_qr, name='attendance-generate-qr'),
    path('attendance/qr/checkin/', qr_attendance_checkin, name='attendance-qr-checkin'),
    path('attendance/time-in/', time_in, name='attendance-time-in'),
    path('attendance/time-out/', time_out, name='attendance-time-out'),
    path('attendance/export/csv/', export_attendance_csv, name='attendance-export-csv'),
    path('attendance/export/excel/', export_attendance_excel, name='attendance-export-excel'),
    path('save-push-token/', save_push_token, name='save-push-token'),
    path('admin/send-push/', send_push_notification, name='send-push'),
    path('admin/dashboard-stats/', admin_dashboard_stats, name='admin-dashboard-stats'),
    path('admin/attendance-trend/', attendance_trend, name='attendance-trend'),
    path('admin/employees/', admin_list_employees, name='admin-list-employees'),
    path('admin/leaves/', admin_list_leaves, name='admin-list-leaves'),
    path('admin/leave/<int:pk>/decide/', admin_decide_leave, name='admin-decide-leave'),
    path('admin/users/', admin_list_users, name='admin-list-users'),
    path('admin/users/<int:user_id>/demote/', admin_demote_user, name='admin-demote-user'),
    path('admin/users/<int:user_id>/reset_password/', admin_reset_password, name='admin-reset-password'),
    path('admin/invite-user/', invite_user, name='invite-user'),
    path('accept-invite/', accept_invite, name='accept-invite'),
    path('audit-logs/', AuditLogList.as_view(), name='auditlog-list'),
    
    path('password_reset/', auth_views.PasswordResetView.as_view(), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),
    
    path('employees/<int:pk>/upload_photo/', employee_photo_upload, name='employee-photo-upload'),
    path('admin/payslips/export/csv/', export_payslips_csv, name='export-payslips-csv'),
    path('admin/payslips/export/excel/', export_payslips_excel, name='export-payslips-excel'),
    path('admin/create-payslip/', admin_create_payslip, name='admin-create-payslip'),
    path('admin/export-payslip-pdf/<int:payslip_id>/', export_payslip_pdf, name='export-payslip-pdf'),
    path('admin/list-users/', admin_list_users, name='admin-list-users'),
    path('admin/demote-user/<int:user_id>/', admin_demote_user, name='admin-demote-user'),
    path('admin/reset-password/<int:user_id>/', admin_reset_password, name='admin-reset-password'),
    path('admin/dashboard-stats/', dashboard_stats, name='dashboard-stats'),
    path('admin/payslips/export/pdf/<int:employee_id>/', export_payslip_pdf, name='export-payslip-pdf'),
    path('employees/<int:pk>/upload_photo/', EmployeePhotoUploadView.as_view(), name='employee-photo-upload'),
    path('admin/payslips/export/pdf/<int:employee_id>/<str:period>/', export_payslip_pdf, name='export-payslip-pdf'),
    path('', include(router.urls)),
]
