# permissions.py

from rest_framework.permissions import BasePermission

class IsManager(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, 'employee') and request.user.employee.role == 'manager'

class IsHR(BasePermission):
    def has_permission(self, request, view):
        return hasattr(request.user, 'employee') and request.user.employee.role == 'hr'
