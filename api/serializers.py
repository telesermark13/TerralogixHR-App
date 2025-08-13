from django.contrib.auth.models import User
from rest_framework import serializers
from .models import (
    Employee, Payroll, Attendance, Payslip, LeaveRequest, Announcement,
    AppNotification, AuditLog, LeaveType, Department, UserInvitation, PushToken
)

# ========== Auth ==========
class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)

# ========== Master data ==========
class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    profile_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = '__all__'

    def get_profile_photo_url(self, obj):
        request = self.context.get('request')
        if obj.profile_photo and hasattr(obj.profile_photo, 'url'):
            return request.build_absolute_uri(obj.profile_photo.url) if request else obj.profile_photo.url
        return None

class PayrollSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payroll
        fields = '__all__'

class AttendanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Attendance
        fields = '__all__'

class PayslipSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payslip
        fields = '__all__'

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
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

class UserInvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserInvitation
        fields = '__all__'

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'

class PushTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushToken
        fields = '__all__'
