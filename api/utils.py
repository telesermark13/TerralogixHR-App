import requests
from .models import Attendance, Payslip, Employee
from .models import AuditLog
EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

def send_push_notification(token, title, body, data=None):
    message = {
        'to': token,
        'sound': 'default',
        'title': title,
        'body': body,
        'data': data or {},
    }
    response = requests.post(
        'https://exp.host/--/api/v2/push/send',
        json=message,
        headers={
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        }
    )
    return response.json()

def send_expo_push(token, title, body, data=None):
    payload = {
        'to': token,
        'sound': 'default',
        'title': title,
        'body': body,
        'data': data or {},
        'priority': 'high',
    }
    response = requests.post(EXPO_PUSH_URL, json=payload)
    return response.json()

def log_action(user, action, detail=""):
    from .models import AuditLog
    AuditLog.objects.create(user=user, action=action, detail=detail)
    
def log_action(user, action, details={}):
    AuditLog.objects.create(
        user=user,
        action=action,
        detail=str(details)  # If details is a dict, convert to str (or use JSONField if you want structured data)
    )
    
def compute_payroll(employee, period_from, period_to, base_salary_per_day):
    # Count days worked and calculate deductions
    attendances = Attendance.objects.filter(employee=employee, date__gte=period_from, date__lte=period_to)
    days_worked = attendances.count()
    late_deduction = sum([att.late_minutes or 0 for att in attendances]) * 10  # e.g. 10 peso per late minute

    # Example values, customize as needed
    sss = 400
    hdmf = 100
    phic = 200
    tax = 0

    total_deductions = late_deduction + sss + hdmf + phic + tax
    gross_pay = days_worked * base_salary_per_day
    net_pay = gross_pay - total_deductions

    # You can add more logic for holidays, overtime, etc.

    return {
        'days_worked': days_worked,
        'late_deduction': late_deduction,
        'sss': sss,
        'hdmf': hdmf,
        'phic': phic,
        'tax': tax,
        'total_deductions': total_deductions,
        'gross_pay': gross_pay,
        'net_pay': net_pay,
    }