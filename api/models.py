from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
import uuid

# ========================
# CHOICES
# ========================
ROLE_CHOICES = (
    ('staff', 'Staff'),
    ('manager', 'Manager'),
    ('hr', 'HR'),
    ('client', 'Client'),
)

# ========================
# MODELS
# ========================

class Department(models.Model):
    name = models.CharField(max_length=64, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Employee(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='employee', null=True, blank=True)
    full_name = models.CharField(max_length=100)
    position = models.CharField(max_length=100, blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='staff')
    date_hired = models.DateField()
    email = models.EmailField(blank=True, null=True)
    contact_number = models.CharField(max_length=20, blank=True, null=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)

    # For payroll / payslip
    employee_id_no = models.CharField(max_length=50, blank=True, null=True)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # BASIC SALARY RATE in your sample

    # Photos
    profile_photo = models.ImageField(upload_to='profile_photos/', null=True, blank=True)
    photo = models.ImageField(upload_to='employee_photos/', null=True, blank=True)

    def __str__(self):
        return self.full_name

    def is_manager(self):
        return (self.role or '').lower() == 'manager'

    def is_hr(self):
        return (self.role or '').lower() == 'hr'


class Attendance(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendances')
    date = models.DateField(default=timezone.localdate)
    time_in = models.TimeField(null=True, blank=True)
    time_out = models.TimeField(null=True, blank=True)
    photo = models.ImageField(upload_to='attendance_photos/', null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    status = models.CharField(max_length=20, default="Present")  # Present, Absent, Late, etc.
    late_minutes = models.IntegerField(default=0)  # used for Late/Undertime deduction

    def __str__(self):
        return f"{self.employee.full_name} - {self.date}"


class Payroll(models.Model):
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payrolls')
    pay_period = models.CharField(max_length=20)  # e.g., "2025-07-15_to_2025-07-29"
    base_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonus = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    deductions = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_pay = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    def save(self, *args, **kwargs):
        self.total_pay = (self.base_salary or 0) + (self.bonus or 0) - (self.deductions or 0)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.employee.full_name} - {self.pay_period}"


class Payslip(models.Model):
    # Who/when
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='payslips')
    period_from = models.DateField()
    period_to = models.DateField()
    issued_date = models.DateField(auto_now_add=True)

    # Earnings (left block)
    daily_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0)  # snapshot of Employee.daily_rate
    days_worked = models.IntegerField(default=0)
    overtime_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # OT
    allowance = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Deductions (right block)
    late_undertime = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sss = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sss_mpf = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hdmf = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    phic = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sss_loan = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hdmf_loan = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cash_advance = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # CA

    # Totals
    gross_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Extras / snapshots for printing
    regular_holidays = models.IntegerField(default=0)
    employee_id_no = models.CharField(max_length=50, blank=True, null=True)
    position_snapshot = models.CharField(max_length=100, blank=True)
    name_snapshot = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.employee.full_name} Payslip ({self.period_from} to {self.period_to})"


class LeaveType(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.name


class LeaveRequest(models.Model):
    PENDING = 'Pending'
    APPROVED = 'Approved'
    REJECTED = 'Rejected'
    STATUS_CHOICES = [(PENDING, 'Pending'), (APPROVED, 'Approved'), (REJECTED, 'Rejected')]

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leaves')
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=PENDING)
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_leaves')
    date_requested = models.DateTimeField(auto_now_add=True)
    date_decided = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, null=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, null=True, blank=True)

    def __str__(self):
        return f"{self.employee.full_name} - {self.status} ({self.start_date} to {self.end_date})"


class PushToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    expo_push_token = models.CharField(max_length=200)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} token"


class Announcement(models.Model):
    title = models.CharField(max_length=200)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.title


class AppNotification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=120)
    body = models.TextField()
    link = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    read = models.BooleanField(default=False)
    type = models.CharField(max_length=50, default='info')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} → {self.user.username}"


class AuditLog(models.Model):
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=100)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict)

    def __str__(self):
        return f"{self.timestamp} - {self.user} - {self.action}"


class UserInvitation(models.Model):
    email = models.EmailField(unique=True)
    invited_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_invitations')
    token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    accepted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invite to {self.email} (accepted: {self.accepted})"
