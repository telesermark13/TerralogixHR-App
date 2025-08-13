from django.urls import path, include
from rest_framework.routers import DefaultRouter
from django.contrib.auth import views as auth_views
from .views import (
    hello_world, my_profile, register_user, change_password,
    generate_attendance_qr, qr_attendance_checkin, time_in, time_out,
    export_attendance_csv, export_attendance_excel, save_push_token, send_push_notification,
    admin_dashboard_stats, attendance_trend, dashboard_stats,
    admin_list_employees, admin_list_leaves, admin_decide_leave,
    admin_list_users, admin_demote_user, admin_reset_password,
    invite_user, accept_invite,
    admin_create_payslip, export_payslips_csv, export_payslips_excel, export_payslip_pdf_single,
    EmployeePhotoUploadView,
    UserViewSet, EmployeeViewSet, PayrollViewSet, PayslipViewSet, AttendanceViewSet,
    DepartmentViewSet, LeaveTypeViewSet, LeaveRequestViewSet,
    AnnouncementViewSet, NotificationViewSet, AuditLogViewSet,
    UserInvitationViewSet, AuditLogList
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

urlpatterns = [
    # basics
    path('hello/', hello_world),
    path('profile/', my_profile),
    path('register/', register_user),
    path('change-password/', change_password),

    # attendance
    path('attendance/qr/', generate_attendance_qr),
    path('attendance/qr/checkin/', qr_attendance_checkin),
    path('attendance/time-in/', time_in),
    path('attendance/time-out/', time_out),
    path('attendance/export/csv/', export_attendance_csv),
    path('attendance/export/excel/', export_attendance_excel),

    # push
    path('save-push-token/', save_push_token),
    path('admin/send-push/', send_push_notification),

    # admin stats & lists
    path('admin/dashboard-stats/', admin_dashboard_stats),
    path('admin/attendance-trend/', attendance_trend),
    path('admin/dashboard-stats/summary/', dashboard_stats),
    path('admin/employees/', admin_list_employees),
    path('admin/leaves/', admin_list_leaves),
    path('admin/leave/<int:pk>/decide/', admin_decide_leave),
    path('admin/users/', admin_list_users),
    path('admin/users/<int:user_id>/demote/', admin_demote_user),
    path('admin/users/<int:user_id>/reset_password/', admin_reset_password),

    # invites
    path('admin/invite-user/', invite_user),
    path('accept-invite/', accept_invite),

    # audit (CBV list kept)
    path('audit-logs/', AuditLogList.as_view()),

    # password reset flow
    path('password_reset/', auth_views.PasswordResetView.as_view(), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(), name='password_reset_complete'),

    # employee photo (class endpoint)
    path('employees/<int:pk>/upload_photo/class/', EmployeePhotoUploadView.as_view()),

    # payslips
    path('admin/create-payslip/', admin_create_payslip),
    path('admin/payslips/export/csv/', export_payslips_csv),
    path('admin/payslips/export/excel/', export_payslips_excel),
    path('admin/payslips/<int:payslip_id>/pdf/', export_payslip_pdf_single),

    path('', include(router.urls)),
]
