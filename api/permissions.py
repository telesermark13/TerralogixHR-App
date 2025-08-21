# permissions.py
from rest_framework.permissions import BasePermission

class IsManager(BasePermission):
    """
    Allows access only to authenticated users with role 'manager'.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, 'employee')
            and getattr(request.user.employee, 'role', '').lower() == 'manager'
        )


class IsHR(BasePermission):
    """
    Allows access only to authenticated users with role 'hr'.
    """
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and hasattr(request.user, 'employee')
            and getattr(request.user.employee, 'role', '').lower() == 'hr'
        )
