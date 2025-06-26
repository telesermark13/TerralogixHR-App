from django.contrib.auth.models import User
from rest_framework import serializers
from .models import AuditLog
from .models import (
    Employee, Payroll, Attendance, Payslip, LeaveRequest, Announcement,
    AppNotification, AuditLog, LeaveType, Department, UserInvitation
)

# --- Register/Login ---
class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=True, min_length=6)
    class Meta:
        model = User
        fields = ('username', 'email', 'password')

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password']
        )
        return user

# --- Main Employee CRUD serializer (use for listing, admin, etc) ---
class EmployeeSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()
    profile_photo = serializers.ImageField(required=False)

    class Meta:
        model = Employee
        fields = '__all__'

    def get_profile_photo_url(self, obj):
        request = self.context.get('request', None)
        if obj.profile_photo and hasattr(obj.profile_photo, 'url'):
            url = obj.profile_photo.url
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        return None

# --- Profile endpoint serializer (just id, full_name, email, photo) ---
class EmployeeProfileSerializer(serializers.ModelSerializer):
    email = serializers.SerializerMethodField()
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = ['id', 'full_name', 'email', 'profile_photo_url']

    def get_email(self, obj):
        return obj.user.email

    def get_profile_photo_url(self, obj):
        request = self.context.get('request', None)
        if obj.profile_photo and hasattr(obj.profile_photo, 'url'):
            url = obj.profile_photo.url
            if request is not None:
                return request.build_absolute_uri(url)
            return url
        return None

# --- Other app serializers ---

class PayrollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payroll
        fields = '__all__'

class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = '__all__'

class LeaveRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveRequest
        fields = '__all__'

class AnnouncementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Announcement
        fields = ['id', 'title', 'message', 'created_at', 'created_by']
        read_only_fields = ['id', 'created_at', 'created_by']

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppNotification
        fields = '__all__'

class PayslipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payslip
        fields = '__all__'

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = '__all__'

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class UserInvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserInvitation
        fields = '__all__'

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'
        
class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'