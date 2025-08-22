from django.http import HttpResponse, JsonResponse
from django.urls import reverse
from django.conf import settings

from rest_framework import status, generics, permissions, filters, viewsets
from rest_framework.decorators import api_view, permission_classes, action
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
import os

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from xhtml2pdf import pisa
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .utils import compute_payroll, send_expo_push, log_action
from .permissions import IsAdmin, IsHR, IsEmployee

from .models import (
    Employee, Payroll, Attendance, Payslip, Department, LeaveType, LeaveRequest,
    Announcement, AppNotification, AuditLog, PushToken, UserInvitation
)
from .serializers import (
    EmployeeSerializer, PayrollSerializer, AttendanceSerializer, PayslipSerializer,
    DepartmentSerializer, LeaveTypeSerializer, LeaveRequestSerializer,
    AnnouncementSerializer, NotificationSerializer, AuditLogSerializer,
    RegisterSerializer, UserInvitationSerializer, PushTokenSerializer
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
    return Response({"username": request.user.username, "email": request.user.email, "message": "This is your secure profile!"})

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

class AuditLogList(generics.ListAPIView):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminUser]

@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_leaves(request):
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
@permission_classes([IsAdminUser])
def admin_dashboard_stats(request):
    today = date.today()
    return Response({
        'employee_count': Employee.objects.count(),
        'present_today': Attendance.objects.filter(date=today, status__iexact='Present').count(),
        'on_leave_today': LeaveRequest.objects.filter(start_date__lte=today, end_date__gte=today, status__iexact='Approved').count(),
        'pending_leaves': LeaveRequest.objects.filter(status__iexact='Pending').count(),
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
@permission_classes([IsAdmin])
def send_push_notification(request):
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
    employee = Employee.objects.filter(user=request.user).first()
    if not employee:
        return Response({'error': 'Employee not found'}, status=404)
    today = timezone.localdate()
    qr_data = f"{employee.id}|{today.strftime('%Y-%m-%d')}"
    img = qrcode.make(qr_data)
    buf = BytesIO()
    img.save(buf, format='PNG')
    return Response({'qr_code': base64.b64encode(buf.getvalue()).decode()})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def qr_attendance_checkin(request):
    employee = Employee.objects.filter(user=request.user).first()
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
    att, _ = Attendance.objects.get_or_create(employee=employee, date=today)
    if att.time_in:
        return Response({'message': 'Already timed in for today.'})
    now = timezone.localtime().time()
    att.time_in = now
    att.save()
    return Response({'message': 'Time-in recorded via QR!', 'time_in': str(now)})

# --- Time In/Out API ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def time_in(request):
    employee = Employee.objects.filter(user=request.user).first()
    if not employee:
        return Response({"detail": "No employee record found."}, status=400)
    now = timezone.localtime()
    today_date = now.date()
    if Attendance.objects.filter(employee=employee, date=today_date, time_in__isnull=False).exists():
        return Response({"detail": "You have already timed in for today."}, status=400)
    serializer = AttendanceSerializer(data={
        'employee': employee.id,
        'date': today_date,
        'time_in': now.time(),
        'latitude': request.data.get('latitude'),
        'longitude': request.data.get('longitude'),
    })
    serializer.is_valid(raise_exception=True)
    serializer.save(employee=employee, date=today_date)
    return Response(serializer.data, status=201)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def time_out(request):
    employee = Employee.objects.filter(user=request.user).first()
    if not employee:
        return Response({"detail": "No employee record found."}, status=400)
    now = timezone.localtime()
    today_date = now.date()
    att = Attendance.objects.filter(employee=employee, date=today_date).first()
    if not att or not att.time_in:
        return Response({"detail": "You need to time in first."}, status=400)
    if att.time_out:
        return Response({"detail": "You have already timed out for today."}, status=400)
    att.time_out = now.time()
    if request.data.get('latitude') is not None: att.latitude = request.data.get('latitude')
    if request.data.get('longitude') is not None: att.longitude = request.data.get('longitude')
    att.save()
    return Response(AttendanceSerializer(att).data)

# --- Attendance Export (CSV/Excel) ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_attendance_csv(request):
    employee = Employee.objects.filter(user=request.user).first()
    qs = Attendance.objects.filter(employee=employee)
    resp = HttpResponse(content_type='text/csv')
    resp['Content-Disposition'] = f'attachment; filename="attendance_{employee.full_name}.csv"'
    w = csv.writer(resp)
    w.writerow(['Date', 'Time In', 'Time Out', 'Status', 'Latitude', 'Longitude'])
    for a in qs:
        w.writerow([a.date, a.time_in, a.time_out, a.status, a.latitude, a.longitude])
    return resp

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_attendance_excel(request):
    employee = Employee.objects.filter(user=request.user).first()
    qs = Attendance.objects.filter(employee=employee)
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = "Attendance"
    ws.append(["Date", "Time In", "Time Out", "Status", "Latitude", "Longitude"])
    for a in qs:
        ws.append([str(a.date), str(a.time_in), str(a.time_out or ""), a.status, a.latitude, a.longitude])
    resp = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename=attendance_report.xlsx'
    wb.save(resp)
    return resp

# --- PUSH TOKEN save ---
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_push_token(request):
    token = request.data.get('expo_push_token')
    if not token:
        return Response({'error': 'No token'}, status=400)
    PushToken.objects.update_or_create(user=request.user, defaults={'expo_push_token': token})
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
    invite, created = UserInvitation.objects.get_or_create(email=email, defaults={'invited_by': request.user})
    if not created and invite.accepted:
        return Response({"error": "User already accepted invitation."}, status=400)
    invite_url = f"https://terralogixhr-app-production.up.railway.app/accept-invite/{invite.token}/"
    send_mail(
        subject="You're invited to Terralogix HR!",
        message=f"Welcome! Click here to register: {invite_url}",
        from_email="Terralogix HR <noreply@terralogixhr.com>",
        recipient_list=[email],
        fail_silently=False,
    )
    return Response({"status": "Invitation sent", "invite_url": invite_url, "email": email})

@api_view(['POST'])
def accept_invite(request):
    token = request.data.get('token')
    password = request.data.get('password')
    invite = UserInvitation.objects.filter(token=token, accepted=False).first()
    if not invite:
        return Response({'detail': 'Invalid or used token'}, status=400)
    user = User.objects.create(username=invite.email, email=invite.email, password=make_password(password))
    invite.accepted = True
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
        u = self.request.user
        if u.groups.filter(name='Admin').exists() or u.groups.filter(name='HR').exists():
            return Employee.objects.all()
        return Employee.objects.filter(user=u)

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
    ordering_fields = ['pay_period']
    ordering = ['-pay_period']

    def get_queryset(self):
        u = self.request.user
        if u.groups.filter(name='Admin').exists() or u.groups.filter(name='HR').exists():
            return Payroll.objects.all()
        return Payroll.objects.filter(employee__user=u)

class PayslipViewSet(viewsets.ModelViewSet):
    queryset = Payslip.objects.all()
    serializer_class = PayslipSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__full_name']
    ordering_fields = ['issued_date', 'period_from', 'period_to']
    ordering = ['-issued_date']

    def get_queryset(self):
        u = self.request.user
        if u.groups.filter(name='Admin').exists() or u.groups.filter(name='HR').exists():
            return Payslip.objects.all()
        return Payslip.objects.filter(employee__user=u)

class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['employee__full_name', 'date']
    ordering_fields = ['date', 'employee__full_name']
    ordering = ['-date']

    def get_queryset(self):
        emp = Employee.objects.filter(user=self.request.user).first()
        return Attendance.objects.filter(employee=emp) if emp else Attendance.objects.none()

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdmin]
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
        u = self.request.user
        if u.groups.filter(name='Admin').exists() or u.groups.filter(name='HR').exists():
            return LeaveRequest.objects.all()
        emp = Employee.objects.filter(user=u).first()
        return LeaveRequest.objects.filter(employee=emp)

    @action(detail=True, methods=['post'], permission_classes=[IsHR])
    def approve(self, request, pk=None):
        leave = self.get_object()
        if leave.status != 'Pending':
            return Response({'error': 'Leave request already processed.'}, status=400)
        leave.status = 'Approved'
        leave.approved_by = request.user
        leave.date_decided = timezone.now()
        leave.save()
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'], permission_classes=[IsHR])
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
    queryset = AppNotification.objects.all()
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['title', 'body']
    ordering_fields = ['created_at']
    ordering = ['-created_at']

    def get_queryset(self):
        return AppNotification.objects.filter(user=self.request.user)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        n = self.get_object()
        n.read = True
        n.save()
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
    permission_classes = [IsAdmin]
    filter_backends = [filters.SearchFilter]
    search_fields = ['email']

class PushTokenViewSet(viewsets.ModelViewSet):
    queryset = PushToken.objects.all()
    serializer_class = PushTokenSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['user__username', 'expo_push_token']

    def get_queryset(self):
        u = self.request.user
        return PushToken.objects.all() if (u.is_staff or u.is_superuser) else PushToken.objects.filter(user=u)

# --- Dashboard Stats (alt) ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def dashboard_stats(request):
    today = timezone.localdate()
    return Response({
        'employee_count': Employee.objects.count(),
        'present_today': Attendance.objects.filter(date=today, status__iexact='Present').count(),
        'on_leave_today': LeaveRequest.objects.filter(start_date__lte=today, end_date__gte=today, status__iexact='Approved').count(),
        'pending_leaves': LeaveRequest.objects.filter(status__iexact='Pending').count(),
        'payroll_count': Payslip.objects.count(),
    })

# --- Admin: Create Payslip from Attendance ---
@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_create_payslip(request):
    emp_id = request.data.get('employee_id')
    period_from = request.data.get('period_from')
    period_to = request.data.get('period_to')
    if not (emp_id and period_from and period_to):
        return Response({'error': 'employee_id, period_from, period_to are required'}, status=400)

    try:
        employee = Employee.objects.get(pk=emp_id)
    except Employee.DoesNotExist:
        return Response({'error': 'Employee not found'}, status=404)

    # daily rate: override or employee.daily_rate
    daily_rate = float(request.data.get('daily_rate', employee.daily_rate or 0))
    overtime_pay = float(request.data.get('overtime_pay', 0) or 0)
    allowance = float(request.data.get('allowance', 0) or 0)

    payroll = compute_payroll(employee, period_from, period_to, daily_rate, overtime_pay=overtime_pay, allowance=allowance)

    # allow admin overrides for deductions if provided
    def num(name, default):
        v = request.data.get(name)
        return float(v) if v not in (None, '') else float(default)

    ps = Payslip.objects.create(
        employee=employee,
        period_from=period_from,
        period_to=period_to,
        daily_rate=daily_rate,
        days_worked=payroll['days_worked'],
        overtime_pay=num('overtime_pay', payroll['overtime_pay']),
        allowance=num('allowance', payroll['allowance']),
        late_undertime=num('late_undertime', payroll['late_undertime']),
        sss=num('sss', payroll['sss']),
        sss_mpf=num('sss_mpf', 0),
        hdmf=num('hdmf', payroll['hdmf']),
        phic=num('phic', payroll['phic']),
        tax=num('tax', payroll['tax']),
        sss_loan=num('sss_loan', 0),
        hdmf_loan=num('hdmf_loan', 0),
        cash_advance=num('cash_advance', 0),
        gross_pay=payroll['gross_pay'],
        total_deductions=payroll['total_deductions'],
        net_pay=payroll['net_pay'],
        regular_holidays=int(request.data.get('regular_holidays', 0) or 0),
        employee_id_no=employee.employee_id_no,
        position_snapshot=employee.position or '',
        name_snapshot=employee.full_name or '',
    )
    return Response({'status': 'Payslip generated', 'payslip_id': ps.id})

# --- Payslip PDF (ReportLab: single) ---
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf_single(request, payslip_id):
    try:
        ps = Payslip.objects.select_related('employee').get(pk=payslip_id)
    except Payslip.DoesNotExist:
        return Response({'error': 'Payslip not found'}, status=404)

    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslip_{ps.employee.full_name}_{ps.period_from}.pdf"'
    p = canvas.Canvas(response, pagesize=A4)
    w, h = A4

    # Left column
    y = h - 60; left = 50
    p.setFont("Helvetica-Bold", 14); p.drawString(left, y, "Terralogix Payslip"); y -= 24
    p.setFont("Helvetica", 10)
    for line in [
        f"FROM: {ps.period_from}",
        f"TO: {ps.period_to}",
        f"NAME: {ps.name_snapshot or ps.employee.full_name}",
        f"ID NO: {ps.employee_id_no or ''}",
        f"POSITION: {ps.position_snapshot or ps.employee.position}",
        f"BASIC SALARY RATE: {ps.daily_rate}",
        f"NO. OF DAYS WORKED: {ps.days_worked}",
        f"REGULAR HOLIDAYS: {ps.regular_holidays}",
    ]:
        p.drawString(left, y, line); y -= 14

    # Right column
    right = 330; y = h - 60
    for line in [
        f"GROSS PAY: {ps.gross_pay}",
        f"OT: {ps.overtime_pay}",
        f"ALLOWANCE: {ps.allowance}",
        "",
        "DEDUCTIONS",
        f"LATE/UNDERTIME: {ps.late_undertime}",
        f"SSS: {ps.sss}",
        f"SSS MPF: {ps.sss_mpf}",
        f"HDMF: {ps.hdmf}",
        f"PHIC: {ps.phic}",
        f"TAX: {ps.tax}",
        f"SSS LOAN: {ps.sss_loan}",
        f"HDMF LOAN: {ps.hdmf_loan}",
        f"CA: {ps.cash_advance}",
        f"TOTAL DEDUCTIONS: {ps.total_deductions}",
        "",
        f"NET PAY: {ps.net_pay}",
    ]:
        if line == "": y -= 6
        else: p.drawString(right, y, line); y -= 14

    p.showPage(); p.save()
    return response

@api_view(['GET'])
@permission_classes([IsAdminUser])
def admin_list_users(request):
    users = User.objects.all()  # Or add filters as needed
    serializer = RegisterSerializer(users, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_demote_user(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    if not user.is_staff:
        return Response({'error': 'User is not an admin'}, status=400)

    user.is_staff = False
    user.save()
    return Response({'status': 'User demoted successfully'})

@api_view(['POST'])
@permission_classes([IsAdminUser])
def admin_reset_password(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=404)

    new_password = request.data.get('new_password')
    if not new_password:
        return Response({'error': 'New password is required'}, status=400)

    user.set_password(new_password)
    user.save()
    return Response({'status': 'Password reset successfully'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_payslips_csv(request):
    queryset = Payslip.objects.all()  # Example, you can filter as needed
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="payslips.csv"'
    writer = csv.writer(response)
    writer.writerow(['Employee Name', 'Period From', 'Period To', 'Gross Pay', 'Net Pay'])  # Add your fields
    for payslip in queryset:
        writer.writerow([payslip.employee.full_name, payslip.period_from, payslip.period_to, payslip.gross_pay, payslip.net_pay])
    return response

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def export_payslips_excel(request):
    employee = Employee.objects.filter(user=request.user).first()
    qs = Payslip.objects.filter(employee=employee)
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Payslips"
    ws.append(["Employee Name", "Period From", "Period To", "Gross Pay", "Net Pay"])  # Add your fields here
    for payslip in qs:
        ws.append([payslip.employee.full_name, payslip.period_from, payslip.period_to, payslip.gross_pay, payslip.net_pay])
    resp = HttpResponse(content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename=payslips_report.xlsx'
    wb.save(resp)
    return resp


class EmployeePhotoUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        employee = Employee.objects.filter(user=request.user).first()
        if not employee:
            return Response({"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)
        
        photo = request.FILES.get("photo")
        if not photo:
            return Response({"error": "No photo provided."}, status=status.HTTP_400_BAD_REQUEST)
        
        employee.profile_photo.save(photo.name, photo)
        employee.save()

        serializer = EmployeeSerializer(employee)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslips_pdf_employee(request, employee_id):
    try:
        employee = Employee.objects.get(pk=employee_id)
    except Employee.DoesNotExist:
        return Response({'error': 'Employee not found'}, status=404)

    # Logic to generate the payslip PDF for the employee
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslip_{employee.full_name}.pdf"'

    # Use the canvas or any PDF generation method here
    p = canvas.Canvas(response, pagesize=A4)
    p.drawString(100, 750, f"Payslip for {employee.full_name}")
    # Add more logic to populate the payslip content

    p.showPage()
    p.save()

    return response    

@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf_by_period(request, employee_id, period):
    try:
        employee = Employee.objects.get(pk=employee_id)
    except Employee.DoesNotExist:
        return Response({'error': 'Employee not found'}, status=404)

    # Logic to generate the payslip PDF for the given employee and period
    response = HttpResponse(content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="payslip_{employee.full_name}_{period}.pdf"'

    p = canvas.Canvas(response, pagesize=A4)
    p.drawString(100, 750, f"Payslip for {employee.full_name} for the period {period}")
    # You can add more logic here to generate payslip content for the period

    p.showPage()
    p.save()

    return response


@api_view(['GET'])
@permission_classes([IsAdminUser])
def export_payslip_pdf_single(request, payslip_id=None, employee_id=None):
    try:
        if payslip_id:
            ps = Payslip.objects.select_related('employee').get(pk=payslip_id)
        elif employee_id:
            # Get latest payslip for employee
            ps = Payslip.objects.filter(employee_id=employee_id).latest('period_to')
        else:
            return Response({'error': 'Missing identifier'}, status=400)
    except Payslip.DoesNotExist:
        return Response({'error': 'Payslip not found'}, status=404)

    # Create HTTP response with PDF
    response = HttpResponse(content_type='application/pdf')
    filename = f"payslip_{ps.employee.full_name}_{ps.period_from}.pdf"
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    
    # Create PDF canvas
    p = canvas.Canvas(response, pagesize=A4)
    width, height = A4
    
    # ===== HEADER SECTION =====
    p.setFont("Helvetica-Bold", 16)
    p.drawCentredString(width/2, height-50, "TERRALOGIX HR")
    p.setFont("Helvetica-Bold", 14)
    p.drawCentredString(width/2, height-80, "EMPLOYEE PAYSLIP")
    
    # ===== COMPANY & EMPLOYEE INFO =====
    p.setFont("Helvetica", 10)
    p.drawString(50, height-110, f"Generated on: {timezone.now().strftime('%Y-%m-%d %H:%M')}")
    p.drawString(width-200, height-110, "Terralogix Inc.")
    
    # Employee info box
    p.rect(50, height-180, width-100, 60)
    p.setFont("Helvetica-Bold", 12)
    p.drawString(60, height-140, "EMPLOYEE INFORMATION")
    p.setFont("Helvetica", 10)
    
    employee_info = [
        ("Name:", ps.name_snapshot or ps.employee.full_name),
        ("ID No:", ps.employee_id_no or "N/A"),
        ("Position:", ps.position_snapshot or ps.employee.position or "N/A"),
        ("Department:", ps.employee.department.name if ps.employee.department else "N/A")
    ]
    
    y_pos = height-160
    for label, value in employee_info:
        p.drawString(60, y_pos, label)
        p.drawString(120, y_pos, value)
        y_pos -= 20

    # ===== PAY PERIOD SECTION =====
    p.setFont("Helvetica-Bold", 12)
    p.drawString(50, height-250, "PAY PERIOD")
    p.setFont("Helvetica", 10)
    p.drawString(50, height-270, f"From: {ps.period_from}")
    p.drawString(200, height-270, f"To: {ps.period_to}")
    p.drawString(350, height-270, f"Pay Date: {ps.issued_date}")

    # ===== EARNINGS SECTION =====
    p.setFont("Helvetica-Bold", 12)
    p.drawString(50, height-310, "EARNINGS")
    p.setFont("Helvetica", 10)
    
    earnings = [
        ("Basic Salary", f"{ps.daily_rate} × {ps.days_worked} days", ps.daily_rate * ps.days_worked),
        ("Overtime Pay", "", ps.overtime_pay),
        ("Allowance", "", ps.allowance),
        ("Holiday Pay", f"{ps.regular_holidays} days", 0),  # Add actual calculation if available
    ]
    
    y_pos = height-330
    for item, description, amount in earnings:
        p.drawString(60, y_pos, item)
        p.drawString(200, y_pos, description)
        p.drawString(450, y_pos, f"₱{amount:,.2f}")
        y_pos -= 20
    
    # Gross Pay
    p.setFont("Helvetica-Bold", 10)
    p.drawString(400, y_pos-10, "--------------")
    p.drawString(60, y_pos-30, "GROSS PAY")
    p.drawString(450, y_pos-30, f"₱{ps.gross_pay:,.2f}")
    p.drawString(400, y_pos-40, "==============")

    # ===== DEDUCTIONS SECTION =====
    p.setFont("Helvetica-Bold", 12)
    p.drawString(50, y_pos-70, "DEDUCTIONS")
    p.setFont("Helvetica", 10)
    
    deductions = [
        ("Late/Undertime", "", ps.late_undertime),
        ("SSS Contribution", "", ps.sss),
        ("SSS Loan", "", ps.sss_loan),
        ("HDMF Contribution", "", ps.hdmf),
        ("HDMF Loan", "", ps.hdmf_loan),
        ("PHIC Contribution", "", ps.phic),
        ("Withholding Tax", "", ps.tax),
        ("Cash Advance", "", ps.cash_advance),
    ]
    
    y_pos -= 90
    for item, description, amount in deductions:
        p.drawString(60, y_pos, item)
        p.drawString(450, y_pos, f"₱{amount:,.2f}")
        y_pos -= 20

    # Total Deductions
    p.setFont("Helvetica-Bold", 10)
    p.drawString(400, y_pos-10, "--------------")
    p.drawString(60, y_pos-30, "TOTAL DEDUCTIONS")
    p.drawString(450, y_pos-30, f"₱{ps.total_deductions:,.2f}")
    p.drawString(400, y_pos-40, "==============")

    # ===== NET PAY SECTION =====
    p.setFont("Helvetica-Bold", 14)
    p.drawString(60, y_pos-70, "NET PAY")
    p.drawString(450, y_pos-70, f"₱{ps.net_pay:,.2f}")
    p.setLineWidth(2)
    p.line(60, y_pos-75, 500, y_pos-75)

    # ===== FOOTER =====
    p.setFont("Helvetica", 8)
    p.drawCentredString(width/2, 50, "This is a computer-generated document and does not require a signature")
    p.drawCentredString(width/2, 35, "Terralogix HR System | https://terralogixhr.com")

    # Finalize PDF
    p.showPage()
    p.save()
    return response
# (Optional) All-payslips-for-employee and by-period endpoints can stay as in your file if you need them.
