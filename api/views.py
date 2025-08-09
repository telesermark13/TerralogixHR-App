from django.shortcuts import render
from django.http import HttpResponse, JsonResponse, FileResponse
from django.urls import reverse
from django.conf import settings

from rest_framework import status, generics, permissions, filters, viewsets
from rest_framework.decorators import api_view, permission_classes, action, parser_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth.hashers import make_password

from django.utils import timezone
from datetime import datetime, timedelta, date

from io import BytesIO
import base64
import csv
import openpyxl
import qrcode
import requests
import os

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from xhtml2pdf import pisa
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .utils import compute_payroll, send_expo_push, log_action
from .permissions import IsHR

from .models import (
    Employee, Payroll, Attendance, Payslip, Department, LeaveType, LeaveRequest,
    Announcement, AppNotification, AuditLog, PushToken, UserInvitation
)
from .serializers import (
    EmployeeSerializer, PayrollSerializer, AttendanceSerializer, PayslipSerializer,
    DepartmentSerializer, LeaveTypeSerializer, LeaveRequestSerializer,
    AnnouncementSerializer, NotificationSerializer, AuditLogSerializer,
    RegisterSerializer, UserInvitationSerializer
)


def home(request):
    return JsonResponse({'message': 'Welcome to TerralogixHR API'})


# --- Basic/test endpoints ---
@api_view(['GET'])
def hello_world(request):
    return Response({"message": "Hello from Terralogix HR backend!"})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_profile(request):
    return Response({
        "username": request.user.username,
        "email": request.user.email,
        "message": "This is your secure profile!"
    })


# --- User Registration ---
@api_view(['POST'])
def register_user(request):
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# --- Admin Employee & Leave List ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_list_employees(request):
    if not request.user.is_staff:
        return Response({'error': 'Forbidden'}, status=403)
    employees = Employee.objects.all()
    serializer = EmployeeSerializer(employees, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def create_employee(request):
    # Placeholder to avoid runtime error. Implement as needed.
    return Response({'detail': 'Not implemented'}, status=501)


class AuditLogList(generics.ListAPIView):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminUser]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_list_leaves(request):
    if not request.user.is_staff:
        return Response({'error': 'Forbidden'}, status=403)
    leaves = LeaveRequest.objects.all().order_by('-date_requested')
    serializer = LeaveRequestSerializer(leaves, many=True)
    return Response(serializer.data)


# --- Admin Approve/Reject Leave ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def admin_decide_leave(request, pk):
    if not request.user.is_staff:
        return Response({'error': 'Forbidden'}, status=403)
    try:
        leave = LeaveRequest.objects.get(pk=pk)
    except LeaveRequest.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)

    status_val = request.data.get('status')
    remarks = request.data.get('remarks', '')
    if status_val not in ['Approved', 'Rejected']:
        return Response({'error': 'Invalid status'}, status=400)

    leave.status = status_val
    leave.remarks = remarks
    leave.approved_by = request.user
    leave.date_decided = timezone.now()
    leave.save()
    return Response({'status': status_val, 'leave_id': leave.id})


# --- Dashboard Stats ---
@api_view(['GET'])
@permission_classes([IsAdminUser])  # Only admins can access
def admin_dashboard_stats(request):
    today = date.today()
    return Response({
        'employee_count': Employee.objects.count(),
        'present_today': Attendance.objects.filter(date=today, status='present').count(),
        'on_leave_today': LeaveRequest.objects.filter(start_date__lte=today, end_date__gte=today, status='approved').count(),
        'pending_leaves': LeaveRequest.objects.filter(status='pending').count(),
        'payroll_count': Payroll.objects.count(),
    })


# --- Change Password ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    user = request.user
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')
    if not old_password or not new_password:
        return Response({'error': 'Please provide both old and new password.'}, status=400)
    if not user.check_password(old_password):
        return Response({'error': 'Old password is incorrect.'}, status=400)
    user.set_password(new_password)
    user.save()
    return Response({'status': 'Password changed successfully.'})


# --- Push Notification (server → Expo) ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_push_notification_api(request):
    if not request.user.is_staff:
        return Response({'error': 'Forbidden'}, status=403)
    user_id = request.data.get('user_id')
    title = request.data.get('title', 'Notification')
    body = request.data.get('body', '')
    data = request.data.get('data', {})
    if not user_id or not body:
        return Response({'error': 'Missing user_id or body'}, status=400)
    try:
        push_token = PushToken.objects.get(user__id=user_id)
    except PushToken.DoesNotExist:
        return Response({'error': 'User has no push token'}, status=404)
    result = send_expo_push(push_token.expo_push_token, title, body, data)
    return Response({'result': result})


# --- Attendance Trend (last 30 days) ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def attendance_trend(request):
    today = timezone.now().date()
    days = 30
    data = []
    for i in range(days):
        day = today - timedelta(days=i)
        count = Attendance.objects.filter(date=day).count()
        data.append({'date': day.strftime('%Y-%m-%d'), 'count': count})
    return Response(list(reversed(data)))


# --- Attendance QR Generation (base64 PNG) ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def generate_attendance_qr(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    if not employee:
        return Response({'error': 'Employee not found'}, status=404)
    today = timezone.localdate()
    qr_data = f"{employee.id}|{today.strftime('%Y-%m-%d')}"
    qr_img = qrcode.make(qr_data)
    buffer = BytesIO()
    qr_img.save(buffer, format='PNG')
    img_str = base64.b64encode(buffer.getvalue()).decode()
    return Response({'qr_code': img_str})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def qr_attendance_checkin(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    if not employee:
        return Response({'error': 'Employee not found'}, status=404)

    qr_data = request.data.get('qr_data')
    if not qr_data:
        return Response({'error': 'No QR data provided'}, status=400)

    try:
        emp_id_str, date_str = qr_data.split('|')
        qr_emp_id = int(emp_id_str)
        qr_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except Exception:
        return Response({'error': 'Invalid QR code data'}, status=400)

    if qr_emp_id != employee.id or qr_date != timezone.localdate():
        return Response({'error': 'QR code not valid for this user or today'}, status=403)

    today = timezone.localdate()
    attendance, created = Attendance.objects.get_or_create(employee=employee, date=today)
    if attendance.time_in:
        return Response({'message': 'Already timed in for today.'})

    now = timezone.localtime().time()
    attendance.time_in = now
    attendance.save()
    return Response({'message': 'Time-in recorded via QR!', 'time_in': str(now)})


# --- Time In/Out API ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def time_in(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    if not employee:
        return Response({"detail": "No employee record found."}, status=400)

    now = timezone.localtime()
    today_date = now.date()
    current_time = now.time()
    today = Attendance.objects.filter(employee=employee, date=today_date).first()
    if today and today.time_in:
        return Response({"detail": "You have already timed in for today."}, status=400)

    latitude = request.data.get('latitude')
    longitude = request.data.get('longitude')
    data = {
        'employee': employee.id,
        'date': today_date,
        'time_in': current_time,
        'latitude': latitude,
        'longitude': longitude,
    }
    serializer = AttendanceSerializer(data=data)
    if serializer.is_valid():
        serializer.save(employee=employee, date=today_date, time_in=current_time, latitude=latitude, longitude=longitude)
        return Response(serializer.data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def time_out(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    if not employee:
        return Response({"detail": "No employee record found."}, status=400)

    now = timezone.localtime()
    today_date = now.date()
    current_time = now.time()

    today = Attendance.objects.filter(employee=employee, date=today_date).first()
    if not today or not today.time_in:
        return Response({"detail": "You need to time in first."}, status=400)
    if today.time_out:
        return Response({"detail": "You have already timed out for today."}, status=400)

    latitude = request.data.get('latitude')
    longitude = request.data.get('longitude')
    today.time_out = current_time
    if latitude is not None:
        today.latitude = latitude
    if longitude is not None:
        today.longitude = longitude
    today.save()

    serializer = AttendanceSerializer(today)
    return Response(serializer.data)


# --- Attendance Export (CSV, PDF, Excel) ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_attendance_csv(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    queryset = Attendance.objects.filter(employee=employee)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="attendance_{employee.full_name}.csv"'

    writer = csv.writer(response)
    writer.writerow(['Date', 'Time In', 'Time Out', 'Status', 'Latitude', 'Longitude'])
    for attendance in queryset:
        writer.writerow([
            attendance.date, attendance.time_in, attendance.time_out,
            attendance.status, attendance.latitude, attendance.longitude
        ])
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_attendance_pdf(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    attendances = Attendance.objects.filter(employee=employee)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="attendance_report.pdf"'

    p = canvas.Canvas(response, pagesize=A4)
    width, height = A4

    p.setFont("Helvetica-Bold", 16)
    p.drawString(100, height - 50, f"Attendance Report for {employee.full_name}")
    p.setFont("Helvetica", 10)

    y = height - 80
    p.drawString(50, y, "Date")
    p.drawString(120, y, "Time In")
    p.drawString(190, y, "Time Out")
    p.drawString(260, y, "Status")
    p.drawString(330, y, "Lat")
    p.drawString(400, y, "Lng")
    y -= 20

    for att in attendances:
        p.drawString(50, y, str(att.date))
        p.drawString(120, y, str(att.time_in))
        p.drawString(190, y, str(att.time_out or "-"))
        p.drawString(260, y, att.status)
        p.drawString(330, y, str(att.latitude or ""))
        p.drawString(400, y, str(att.longitude or ""))
        y -= 18
        if y < 60:
            p.showPage()
            y = height - 50
    p.save()
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_attendance_excel(request):
    user = request.user
    employee = Employee.objects.filter(user=user).first()
    attendances = Attendance.objects.filter(employee=employee)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Attendance"
    ws.append(["Date", "Time In", "Time Out", "Status", "Latitude", "Longitude"])
    for att in attendances:
        ws.append([str(att.date), str(att.time_in), str(att.time_out or ""), att.status, att.latitude, att.longitude])

    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename=attendance_report.xlsx'
    wb.save(response)
    return response


# --- PUSH TOKEN save ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_push_token(request):
    user = request.user
    expo_push_token = request.data.get('expo_push_token')
    if not expo_push_token:
        return Response({'error': 'No token'}, status=400)
    PushToken.objects.update_or_create(user=user, defaults={'expo_push_token': expo_push_token})
    return Response({'status': 'saved'})


# --- Simple HR Only Endpoint ---
@api_view(['GET'])
@permission_classes([IsHR])
def hr_only_view(request):
    return Response({"ok": True, "msg": "HR only!"})


# --- User Invitation ---
@api_view(['POST'])
@permission_classes([IsAdminUser])
def invite_user(request):
    email = request.data.get('email')
    if not email:
        return Response({"error": "No email provided."}, status=400)

    invitation, created = UserInvitation.objects.get_or_create(
        email=email,
        defaults={'invited_by': request.user}
    )
    if not created and invitation.accepted:
        return Response({"error": "User already accepted invitation."}, status=400)

    invite_url = f"https://terralogixhr-app-production.up.railway.app/accept-invite/{invitation.token}/"
    send_mail(
        subject="You're invited to Terralogix HR!",
        message=f"Welcome! Click here to register: {invite_url}",
        from_email="Terralogix HR <noreply@terralogixhr.com>",
        recipient_list=[email],
        fail_silently=False,
    )
    return Response({
        "status": "Invitation sent",
        "invite_url": invite_url,
        "email": email,
    })


@api_view(['POST'])
def accept_invite(request):
    token = request.data.get('token')
    password = request.data.get('password')
    invite = UserInvitation.objects.filter(token=token, is_accepted=False).first()
    if not invite:
        return Response({'detail': 'Invalid or used token'}, status=400)

    user = User.objects.create(
        username=invite.email,
        email=invite.email,
        password=make_password(password)
    )
    invite.is_accepted = True
    invite.save()
    return Response({'status': 'Account created'})


# --- ViewSets ---
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['username', 'email']
    ordering_fields = ['username', 'email']
    ordering = ['username']


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['full_name', 'email', 'position']
    ordering_fields = ['full_name', 'position', 'date_hired']
    ordering = ['-date_hired']
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Employee.objects.all()
        return Employee.objects.filter(user=user)

    @action(detail=True, methods=['patch'], permission_classes=[permissions.IsAuthenticated], url_path='upload-photo')
    def upload_photo(self, request, pk=None):
        employee = self.get_object()
        photo = request.FILES.get('photo')
        if not photo:
            return Response({'error': 'No photo uploaded'}, status=400)
        employee.profile_photo.save(photo.name, photo)
        employee.save()
        return Response({'status': 'Profile photo updated', 'photo_url': employee.profile_photo.url})


class PayrollViewSet(viewsets.ModelViewSet):
    queryset = Payroll.objects.all()
    serializer_class = PayrollSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__full_name', 'pay_period']
    ordering_fields = ['pay_period', 'created_at']
    ordering = ['-pay_period']

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Payroll.objects.all()
        return Payroll.objects.filter(employee__user=user)


class PayslipViewSet(viewsets.ModelViewSet):
    queryset = Payslip.objects.all()
    serializer_class = PayslipSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__full_name']
    ordering_fields = ['issued_date', 'period_from', 'period_to']
    ordering = ['-issued_date']

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return Payslip.objects.all()
        return Payslip.objects.filter(employee__user=user)


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__full_name', 'date']
    ordering_fields = ['date', 'employee__full_name']
    ordering = ['-date']

    def get_queryset(self):
        user = self.request.user
        employee = Employee.objects.filter(user=user).first()
        if employee:
            return Attendance.objects.filter(employee=employee)
        return Attendance.objects.none()

    @action(detail=False, methods=['get'])
    def export_csv(self, request):
        return Response({'message': 'CSV export coming soon.'})


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']
    ordering = ['name']


class LeaveTypeViewSet(viewsets.ModelViewSet):
    queryset = LeaveType.objects.all()
    serializer_class = LeaveTypeSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']
    ordering = ['name']


class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.all()
    serializer_class = LeaveRequestSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__full_name', 'status']
    ordering_fields = ['start_date', 'status', 'date_requested']
    ordering = ['-date_requested']

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return LeaveRequest.objects.all()
        employee = Employee.objects.filter(user=user).first()
        return LeaveRequest.objects.filter(employee=employee)

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def approve(self, request, pk=None):
        leave = self.get_object()
        if leave.status != 'Pending':
            return Response({'error': 'Leave request already processed.'}, status=400)
        leave.status = 'Approved'
        leave.approved_by = request.user
        leave.date_decided = timezone.now()
        leave.save()
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'], permission_classes=[permissions.IsAdminUser])
    def reject(self, request, pk=None):
        leave = self.get_object()
        if leave.status != 'Pending':
            return Response({'error': 'Leave request already processed.'}, status=400)
        leave.status = 'Rejected'
        leave.approved_by = request.user
        leave.date_decided = timezone.now()
        leave.save()
        return Response({'status': 'rejected'})


class AnnouncementViewSet(viewsets.ModelViewSet):
    queryset = Announcement.objects.all().order_by('-created_at')
    serializer_class = AnnouncementSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'message']
    ordering_fields = ['created_at', 'title']
    ordering = ['-created_at']


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'message']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return AppNotification.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.read = True
        notif.save()
        return Response({'status': 'read'})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all().order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['action', 'user__username']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']


class UserInvitationViewSet(viewsets.ModelViewSet):
    queryset = UserInvitation.objects.all()
    serializer_class = UserInvitationSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter]
    search_fields = ['email']


class PushTokenViewSet(viewsets.ModelViewSet):
    queryset = PushToken.objects.all()
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__username', 'expo_push_token']

    def get_queryset(self):
        user = self.request.user
        if user.is_staff or user.is_superuser:
            return PushToken.objects.all()
        return PushToken.objects.filter(user=user)


# --- Dashboard Stats (alt) ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def dashboard_stats(request):
    today = timezone.localdate()
    total_employees = Employee.objects.count()
    present_today = Attendance.objects.filter(date=today, status='Present').count()
    on_leave_today = Attendance.objects.filter(date=today, status='On Leave').count()
    pending_leaves = Attendance.objects.filter(status='Pending').count()
    payroll_count = Payslip.objects.count()
    return Response({
        'employee_count': total_employees,
        'present_today': present_today,
        'on_leave_today': on_leave_today,
        'pending_leaves': pending_leaves,
        'payroll_count': payroll_count,
    })


@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_attendance_summary(request):
    today = date.today()
    period_start = today - timedelta(days=14)
    summary = []
    for emp in Employee.objects.all():
        att = Attendance.objects.filter(employee=emp, date__gte=period_start, date__lte=today)
        days_present = att.filter(status__iexact="present").count()
        days_late = att.filter(status__iexact="late").count()
        summary.append({
            'employee': emp.full_name,
            'days_present': days_present,
            'days_late': days_late,
            'total_attendance': att.count(),
        })
    return Response(summary)


# --- Admin User List / Demote / Reset Password ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_list_users(request):
    users = User.objects.all().values('id', 'username', 'email', 'is_staff', 'is_superuser')
    return Response(list(users))


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_demote_user(request, user_id):
    try:
        user = User.objects.get(pk=user_id)
        user.is_staff = False
        user.save()
        return Response({'status': 'User demoted'})
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_reset_password(request, user_id):
    try:
        user = User.objects.get(pk=user_id)
        token = default_token_generator.make_token(user)
        reset_url = request.build_absolute_uri(reverse('password_reset_confirm', args=[user.pk, token]))
        send_mail(
            subject="Password Reset",
            message=f"Reset your password: {reset_url}",
            from_email="no-reply@yourdomain.com",
            recipient_list=[user.email]
        )
        return Response({'status': 'Password reset email sent', 'reset_url': reset_url})
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)


# --- Payroll Calculation and Payslip Creation ---
@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_create_payslip(request):
    """
    Admin: Generate payslip for an employee and period.
    POST: employee_id, period_from, period_to
    """
    emp_id = request.data.get('employee_id')
    period_from = request.data.get('period_from')
    period_to = request.data.get('period_to')

    try:
        employee = Employee.objects.get(pk=emp_id)
    except Employee.DoesNotExist:
        return Response({'error': 'Employee not found'}, status=404)

    base_salary_per_day = float(employee.basic_salary_rate)  # customize as needed

    payroll = compute_payroll(employee, period_from, period_to, base_salary_per_day)
    payslip = Payslip.objects.create(
        employee=employee,
        period_from=period_from,
        period_to=period_to,
        issued_date=timezone.now().date(),
        basic_salary=payroll['gross_pay'],
        days_worked=payroll['days_worked'],
        late_deduction=payroll['late_deduction'],
        sss=payroll['sss'],
        hdmf=payroll['hdmf'],
        phic=payroll['phic'],
        tax=payroll['tax'],
        total_deductions=payroll['total_deductions'],
        net_pay=payroll['net_pay'],
        employee_id_no=employee.id,
    )
    return Response({'status': 'Payslip generated', 'payslip_id': payslip.id})


class EmployeePhotoUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        employee = Employee.objects.filter(pk=pk).first()
        if not employee:
            return Response({"error": "Employee not found"}, status=404)
        photo = request.FILES.get('photo')
        if not photo:
            return Response({"error": "No photo uploaded"}, status=400)
        employee.photo.save(photo.name, photo)
        employee.save()
        return Response({"status": "Photo uploaded!", "photo_url": employee.photo.url})


# --- Payslip PDF Exports (names are unique; no conflicts) ---

# 1) Single payslip (ReportLab – no system deps)
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf_single(request, payslip_id):
    try:
        payslip = Payslip.objects.get(pk=payslip_id)
    except Payslip.DoesNotExist:
        return Response({'error': 'Payslip not found'}, status=404)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = (
        f'attachment; filename="payslip_{payslip.employee.full_name}_{payslip.period_from}.pdf"'
    )

    p = canvas.Canvas(response, pagesize=A4)
    width, height = A4
    y = height - 50

    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, y, f"Payslip for {payslip.employee.full_name}")
    y -= 20

    p.setFont("Helvetica", 11)
    lines = [
        f"Period: {payslip.period_from} to {payslip.period_to}",
        f"Issued: {payslip.issued_date}",
        f"Days worked: {payslip.days_worked}",
        f"Late deduction: {payslip.late_deduction}",
        f"SSS: {payslip.sss}  HDMF: {payslip.hdmf}  PHIC: {payslip.phic}  TAX: {payslip.tax}",
        f"Basic Salary (Gross): {payslip.basic_salary}",
        f"Total Deductions: {payslip.total_deductions}",
        f"Net Pay: {payslip.net_pay}",
    ]
    for line in lines:
        p.drawString(50, y, str(line))
        y -= 16
        if y < 60:
            p.showPage()
            y = height - 50

    p.showPage()
    p.save()
    return response


# 2) All payslips for an employee (ReportLab)
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslips_pdf_employee(request, employee_id):
    payslips = Payslip.objects.filter(employee_id=employee_id).order_by('period_from')
    if not payslips.exists():
        return Response({'error': 'No payslips for this employee'}, status=404)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslips_{employee_id}.pdf"'

    p = canvas.Canvas(response, pagesize=A4)
    width, height = A4
    y = height - 40

    p.setFont("Helvetica-Bold", 14)
    p.drawString(50, y, f"Payslips for Employee ID: {employee_id}")
    y -= 24

    p.setFont("Helvetica", 11)
    for ps in payslips:
        for line in [
            f"Period: {ps.period_from} to {ps.period_to}",
            f"Issued: {ps.issued_date}",
            f"Gross: {ps.basic_salary}  Deductions: {ps.total_deductions}  Net: {ps.net_pay}",
        ]:
            p.drawString(50, y, str(line))
            y -= 16
            if y < 60:
                p.showPage()
                y = height - 40
        y -= 8

    p.showPage()
    p.save()
    return response


# 3) Payslip by employee + period string "YYYY-MM-DD_to_YYYY-MM-DD" (xhtml2pdf)
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf_by_period(request, employee_id, period):
    try:
        period_from, period_to = period.split('_to_')
    except Exception:
        return Response({'error': 'Invalid period format'}, status=400)

    payslip = Payslip.objects.filter(
        employee_id=employee_id, period_from=period_from, period_to=period_to
    ).first()
    if not payslip:
        return Response({'error': 'Payslip not found'}, status=404)

    logo_path = os.path.join(settings.BASE_DIR, 'api', 'assets', 'logo.png')
    logo_url = f'file://{logo_path}' if os.path.exists(logo_path) else ''

    html = render_to_string('api/payslip_template.html', {
        'payslip': payslip,
        'logo_url': logo_url
    })

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslip_{employee_id}_{period}.pdf"'
    pisa_status = pisa.CreatePDF(html, dest=response)
    if pisa_status.err:
        return HttpResponse('PDF generation error', status=500)
    return response


# --- Payslips CSV/Excel (fields fixed) ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslips_csv(request):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="payslips.csv"'
    w = csv.writer(response)
    w.writerow(['Employee', 'Period From', 'Period To', 'Net Pay'])
    for ps in Payslip.objects.select_related('employee'):
        w.writerow([ps.employee.full_name, ps.period_from, ps.period_to, ps.net_pay])
    return response


@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslips_excel(request):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Payslips"
    ws.append(['Employee', 'Period From', 'Period To', 'Net Pay'])
    for ps in Payslip.objects.select_related('employee'):
        ws.append([ps.employee.full_name, str(ps.period_from), str(ps.period_to), float(ps.net_pay)])
    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="payslips.xlsx"'
    wb.save(response)
    return response
