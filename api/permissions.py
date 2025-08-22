from rest_framework.permissions import BasePermission

class IsAdmin(BasePermission):
    """
    Allows access only to admin users.
    """
    def has_permission(self, request, view):
        return request.user and request.user.groups.filter(name='Admin').exists()

class IsHR(BasePermission):
    """
    Allows access only to HR users.
    """
    def has_permission(self, request, view):
        return request.user and request.user.groups.filter(name='HR').exists()

class IsEmployee(BasePermission):
    """
    Allows access only to employee users.
    """
    def has_permission(self, request, view):
        return request.user and request.user.groups.filter(name='Employee').exists()