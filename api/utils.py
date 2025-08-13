import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, Optional

import requests
from django.contrib.auth.models import User

from .models import Attendance, AuditLog

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

def _to_decimal(value: Any, default="0") -> Decimal:
    try:
        if value is None:
            return Decimal(default)
        if isinstance(value, Decimal):
            return value
        return Decimal(str(value))
    except Exception:
        return Decimal(default)

def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

# ---- Push ----
def send_expo_push(token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None, timeout: int = 10) -> Dict[str, Any]:
    payload = {"to": token, "sound": "default", "title": title, "body": body, "data": data or {}, "priority": "high"}
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    try:
        r = requests.post(EXPO_PUSH_URL, json=payload, headers=headers, timeout=timeout)
        try:
            raw = r.json()
        except Exception:
            raw = {"_text": r.text}
        ok = r.status_code == 200 and not raw.get("errors")
        return {"ok": ok, "raw": raw}
    except requests.RequestException as e:
        logger.exception("Expo push failed: %s", e)
        return {"ok": False, "raw": {"error": str(e)}}

# ---- Audit log ----
def log_action(user: Optional[User], action: str, details: Optional[Dict[str, Any]] = None) -> None:
    try:
        AuditLog.objects.create(user=user if (user and user.pk) else None, action=action, details=details or {})
    except Exception:
        logger.exception("Failed to write AuditLog")

# ---- Payroll ----
def compute_payroll(
    employee,
    period_from,
    period_to,
    daily_rate: Any,
    *,
    overtime_pay: Any = 0,
    allowance: Any = 0,
    late_rate_per_minute: Any = 10,
    sss: Any = 400,
    hdmf: Any = 100,
    phic: Any = 200,
    tax: Any = 0,
) -> Dict[str, Any]:
    daily_rate = _to_decimal(daily_rate)
    overtime_pay = _to_decimal(overtime_pay)
    allowance = _to_decimal(allowance)
    late_rate_per_minute = _to_decimal(late_rate_per_minute)
    sss = _to_decimal(sss); hdmf = _to_decimal(hdmf); phic = _to_decimal(phic); tax = _to_decimal(tax)

    qs = Attendance.objects.filter(employee=employee, date__gte=period_from, date__lte=period_to)

    days_worked = 0
    total_late_mins = 0
    for att in qs:
        worked = bool(att.time_in) or (att.status or "").lower() in {"present", "late"}
        if worked:
            days_worked += 1
        try:
            total_late_mins += int(getattr(att, "late_minutes", 0) or 0)
        except (TypeError, ValueError):
            pass

    late_undertime = _q(_to_decimal(total_late_mins) * late_rate_per_minute)
    gross_pay = _q(_to_decimal(days_worked) * daily_rate + overtime_pay + allowance)
    total_deductions = _q(late_undertime + sss + hdmf + phic + tax)
    net_pay = _q(gross_pay - total_deductions)

    return {
        "days_worked": days_worked,
        "late_undertime": late_undertime,
        "gross_pay": gross_pay,
        "total_deductions": total_deductions,
        "net_pay": net_pay,
        "sss": sss, "hdmf": hdmf, "phic": phic, "tax": tax,
        "overtime_pay": overtime_pay, "allowance": allowance,
        # loans/CA defaulted to 0; you can override when creating the Payslip
        "sss_loan": _to_decimal(0), "hdmf_loan": _to_decimal(0), "cash_advance": _to_decimal(0), "sss_mpf": _to_decimal(0),
    }
