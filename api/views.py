from django.shortcuts import render
from rest_framework.decorators import api_view, permission_classes, action, parser_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status, generics, permissions, filters, viewsets
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import HttpResponse, JsonResponse, FileResponse
from django.urls import reverse
from django.core.mail import send_mail
from django.contrib.auth.tokens import default_token_generator
from io import BytesIO
from datetime import datetime, timedelta
import base64
import csv
import openpyxl
import qrcode
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from datetime import date
from rest_framework.views import APIView
import requests
from rest_framework.permissions import IsAdminUser
from .utils import compute_payroll
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAdminUser
from django.contrib.auth.hashers import make_password
from .utils import log_action
from .serializers import AuditLogSerializer
import secrets
from .models import (
    Employee, Payroll, Attendance, Payslip, Department, LeaveType, LeaveRequest,
    Announcement, AppNotification, AuditLog, PushToken, UserInvitation,Payroll
)
from .serializers import (
    EmployeeSerializer, PayrollSerializer, AttendanceSerializer, PayslipSerializer,
    DepartmentSerializer, LeaveTypeSerializer, LeaveRequestSerializer,
    AnnouncementSerializer, NotificationSerializer, AuditLogSerializer,
    RegisterSerializer, UserInvitationSerializer
)
from .utils import send_expo_push, log_action
from .permissions import IsHR
from django.conf import settings
from xhtml2pdf import pisa
from django.template.loader import render_to_string
from .push_notifications import send_push_notification
import os
from django.template.loader import render_to_string
import weasyprint
from django.http import JsonResponse

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
    # ... your logic to create a new employee ...
    new_employee = Employee.objects.create(...)  # for example
    log_action(request.user, 'created employee', {'employee_id': new_employee.id})
    return Response({'status': 'employee created'})

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

# --- Push Notification ---
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

# --- Attendance Trend ---
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

# --- Attendance QR Generation (only ONE version, base64 for logged-in user) ---
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

# --- User Invitation (only one version for POST/GET) ---
@api_view(['POST'])
@permission_classes([IsAdminUser])
def invite_user(request):
    email = request.data.get('email')
    if not email:
        return Response({"error": "No email provided."}, status=400)

    # Check for existing invitation
    invitation, created = UserInvitation.objects.get_or_create(
        email=email,
        defaults={'invited_by': request.user}
    )
    # You may want to allow resending if not yet accepted
    if not created and invitation.accepted:
        return Response({"error": "User already accepted invitation."}, status=400)

    invite_url = f"https://terralogixhr-app-production.up.railway.app/accept-invite/{invitation.token}/"
    send_mail(
        subject="You're invited to Terralogix HR!",
        message=f"Welcome! Click here   to register: {invite_url}",
        from_email="Terralogix HR <noreply@terralogixhr.com>",  # Use your actual sender
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

# --- ModelViewSets for all CRUD ---
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
    ordering_fields = ['issued_date', 'period_from', 'period_to']  # <-- valid fields
    ordering = ['-issued_date']  # <-- valid field
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
        # Add your CSV export logic here
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
    
# --- Dashboard Stats ---
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
    # Last 15 days (same as your payslip period)
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


# --- Admin User List ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_list_users(request):
    users = User.objects.all().values('id', 'username', 'email', 'is_staff', 'is_superuser')
    return Response(list(users))

# --- Admin Demote User ---
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
        from .models import Employee
        employee = Employee.objects.filter(pk=pk).first()
        if not employee:
            return Response({"error": "Employee not found"}, status=404)
        photo = request.FILES.get('photo')
        if not photo:
            return Response({"error": "No photo uploaded"}, status=400)
        employee.photo.save(photo.name, photo)
        employee.save()
        return Response({"status": "Photo uploaded!", "photo_url": employee.photo.url})

# --- Payslip PDF Export ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf(request, payslip_id):
    payslip = Payslip.objects.get(pk=payslip_id)
    html_string = render_to_string('api/payslip_template.html', {'payslip': payslip})
    pdf_file = weasyprint.HTML(string=html_string).write_pdf()
    response = HttpResponse(pdf_file, content_type='application/pdf')
    response['Content-Disposition'] = f'filename="payslip_{payslip.employee.full_name}_{payslip.period_from}.pdf"'
    return response
    
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslips_csv(request):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="payslips.csv"'
    writer = csv.writer(response)
    writer.writerow(['Employee', 'Period Start', 'Period End', 'Amount'])

    for payslip in Payslip.objects.all():
        writer.writerow([payslip.employee.name, payslip.period_start, payslip.period_end, payslip.amount])
    return response

@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslips_excel(request):
    from openpyxl import Workbook
    wb = Workbook()
    ws = wb.active
    ws.append(['Employee', 'Period Start', 'Period End', 'Amount'])
    for payslip in Payslip.objects.all():
        ws.append([payslip.employee.name, str(payslip.period_start), str(payslip.period_end), float(payslip.amount)])

    response = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = 'attachment; filename="payslips.xlsx"'
    wb.save(response)
    return response


# For EmployeePhotoUploadView, if it's a CBV:


    

@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf(request, employee_id):
    payslips = Payslip.objects.filter(employee_id=employee_id)
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslip_{employee_id}.pdf"'

    p = canvas.Canvas(response)
    y = 800
    p.drawString(100, y, f"Payslip for Employee ID: {employee_id}")
    for payslip in payslips:
        y -= 30
        p.drawString(100, y, f"Period: {payslip.period_start} to {payslip.period_end} | Amount: {payslip.amount}")
    p.showPage()
    p.save()
    return response


@api_view(['POST'])
@permission_classes([IsAdminUser])
def send_push_notification(request):
    token = request.data.get('token')
    title = request.data.get('title', 'Notification')
    message = request.data.get('message', '')
    if not token or not message:
        return Response({'detail': 'Token and message required'}, status=400)
    expo_url = "https://exp.host/--/api/v2/push/send"
    payload = {
        "to": token,
        "title": title,
        "body": message
    }
    headers = {
        "Content-Type": "application/json"
    }
    response = requests.post(expo_url, json=payload, headers=headers)
    try:
        result = response.json()
    except Exception:
        result = {"error": response.text}
    if response.status_code == 200:
        return Response({'detail': 'Notification sent', 'expo_response': result})
    else:
        return Response({'detail': 'Expo push failed', 'expo_response': result}, status=500)

@api_view(['POST'])
@permission_classes([IsAdminUser])
@parser_classes([MultiPartParser, FormParser])
def employee_photo_upload(request, pk):
    employee = Employee.objects.get(pk=pk)
    employee.photo = request.FILES['photo']
    employee.save()
    return Response({'status': 'photo uploaded'})

@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf(request, employee_id, period):
    # Example period = "2025-05-15_to_2025-05-29"
    try:
        period_from, period_to = period.split('_to_')
    except Exception:
        return Response({'error': 'Invalid period format'}, status=400)
    # Get the payslip for this employee/period
    payslip = Payslip.objects.filter(employee_id=employee_id, period_from=period_from, period_to=period_to).first()
    if not payslip:
        return Response({'error': 'Payslip not found'}, status=404)

    # Generate absolute path for logo if needed
    logo_path = os.path.join(settings.BASE_DIR, 'api', 'assets', 'logo.png')
    if not os.path.exists(logo_path):
        logo_url = ''
    else:
        logo_url = f'file://{logo_path}'

    html = render_to_string('api/payslip_template.html', {
        'payslip': payslip,
        'logo_url': logo_url
    })

    # Generate PDF
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslip_{employee_id}_{period}.pdf"'
    pisa_status = pisa.CreatePDF(html, dest=response)
    if pisa_status.err:
        return HttpResponse('PDF generation error', status=500)
    return response
