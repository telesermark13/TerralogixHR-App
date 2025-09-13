from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType

# Define role names
class Roles:
    ADMIN = "Admin"
    HR = "HR"
    EMPLOYEE = "Employee"

# Define permissions for each role
# Format: {role_name: [permission_codename, permission_name]}
ROLE_PERMISSIONS = {
    Roles.HR: [
        # Employee management
        ("view_employee", "Can view employee data"),
        ("add_employee", "Can add new employees"),
        ("change_employee", "Can edit employee data"),
        ("delete_employee", "Can delete employees"),

        # Leave management
        ("view_leaverequest", "Can view leave requests"),
        ("add_leaverequest", "Can add leave requests"),
        ("change_leaverequest", "Can approve/reject leave requests"),
        ("delete_leaverequest", "Can delete leave requests"),

        # Payroll management
        ("view_payroll", "Can view payroll data"),
        ("add_payroll", "Can generate payroll"),
        ("change_payroll", "Can edit payroll data"),
        ("delete_payroll", "Can delete payroll data"),

        # Payslip management
        ("view_payslip", "Can view payslips"),
        ("add_payslip", "Can generate payslips"),
        ("change_payslip", "Can edit payslips"),
        ("delete_payslip", "Can delete payslips"),
    ],
}

def setup_roles_and_permissions(apps, schema_editor):
    """
    Create roles (groups) and assign permissions to them.
    This function can be called in a data migration.
    """
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')
    ContentType = apps.get_model('contenttypes', 'ContentType')

    for role_name, permissions in ROLE_PERMISSIONS.items():
        group, created = Group.objects.get_or_create(name=role_name)
        if created:
            print(f"Created group: {role_name}")

        for codename, name in permissions:
            # Extract model name from codename
            try:
                model_name = codename.split('_')[1]
            except IndexError:
                print(f"Could not extract model name from codename {codename}. Skipping.")
                continue

            # Get the model from the 'api' app
            try:
                model = apps.get_model('api', model_name)
            except LookupError:
                print(f"Model {model_name} not found in app 'api'. Skipping permission {name}.")
                continue

            # Get content type for the model
            content_type = ContentType.objects.get_for_model(model)

            permission, perm_created = Permission.objects.get_or_create(
                codename=codename,
                name=name,
                content_type=content_type,
            )
            if perm_created:
                print(f"Created permission: {name}")

            group.permissions.add(permission)
            print(f"Assigned permission '{name}' to group '{role_name}'")
