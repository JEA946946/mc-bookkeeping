"""Payroll views — Employee CRUD, PayrollRun CRUD + approve."""

import calendar
import logging
from datetime import date as date_mod
from decimal import Decimal, ROUND_HALF_UP

from django.db import models, transaction
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from accounts.models import Account
from journals.models import JournalEntry, JournalEntryLine
from .calculations import calculate_payroll_line, calculate_gross_from_net
from .models import Employee, PayrollRun, PayrollLine, LeaveEntry, PublicHoliday, HolidayWork


# ─── helpers ──────────────────────────────────────────────────────────────────

def _employee_dict(emp):
    # Compute net salary from gross for display
    calc = calculate_payroll_line(emp.gross_salary) if emp.gross_salary else None
    net = calc["net_salary"] if calc else Decimal("0")
    net_display = _round_display(net)
    return {
        "id": str(emp.id),
        "employee_number": emp.employee_number,
        "first_name": emp.first_name,
        "last_name": emp.last_name,
        "cnss_number": emp.cnss_number,
        "cin": emp.cin,
        "hire_date": emp.hire_date.isoformat() if emp.hire_date else None,
        "termination_date": emp.termination_date.isoformat() if emp.termination_date else None,
        "gross_salary": str(emp.gross_salary),
        "net_salary": net_display,
        "salary_account_id": str(emp.salary_account_id) if emp.salary_account_id else None,
        "salary_account_code": emp.salary_account.code if emp.salary_account else None,
        "salary_account_name": emp.salary_account.name if emp.salary_account else None,
        "bank_account_number": emp.bank_account_number,
        "annual_leave_days": str(emp.annual_leave_days),
        "is_active": emp.is_active,
        "notes": emp.notes,
        "created_at": emp.created_at.isoformat() if emp.created_at else None,
        "updated_at": emp.updated_at.isoformat() if emp.updated_at else None,
    }


def _round_display(val):
    """Round to whole number if within 0.05, otherwise keep as-is."""
    rounded = val.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return str(rounded) if abs(val - rounded) <= Decimal("0.05") else str(val)


def _payroll_line_dict(line):
    return {
        "id": str(line.id),
        "employee_id": str(line.employee_id),
        "employee_number": line.employee.employee_number,
        "employee_name": f"{line.employee.first_name} {line.employee.last_name}",
        "gross_salary": str(line.gross_salary),
        "cnss_employee": str(line.cnss_employee),
        "cnss_employer": str(line.cnss_employer),
        "ir_amount": str(line.ir_amount),
        "net_salary": _round_display(line.net_salary),
    }


def _payroll_run_dict(run, include_lines=False):
    d = {
        "id": str(run.id),
        "year": run.year,
        "month": run.month,
        "run_date": run.run_date.isoformat() if run.run_date else None,
        "status": run.status,
        "total_gross": str(run.total_gross),
        "total_cnss_employee": str(run.total_cnss_employee),
        "total_cnss_employer": str(run.total_cnss_employer),
        "total_ir": str(run.total_ir),
        "total_net": _round_display(run.total_net),
        "journal_entry_id": str(run.journal_entry_id) if run.journal_entry_id else None,
        "notes": run.notes,
        "created_by": run.created_by,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "line_count": run.lines.count(),
    }
    if include_lines:
        d["lines"] = [_payroll_line_dict(l) for l in run.lines.select_related("employee")]
    return d


def _next_employee_number():
    last = Employee.objects.order_by("-employee_number").first()
    if not last:
        return "EMP-001"
    try:
        num = int(last.employee_number.split("-")[1])
        return f"EMP-{num + 1:03d}"
    except (IndexError, ValueError):
        return f"EMP-{Employee.objects.count() + 1:03d}"


def _next_je_entry_number():
    last = JournalEntry.objects.order_by("-entry_number").first()
    if not last:
        return "JE-0001"
    try:
        num = int(last.entry_number.split("-")[1])
        return f"JE-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"JE-{JournalEntry.objects.count() + 1:04d}"


# ─── Employee views ──────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def employees_list_create(request):
    if request.method == "GET":
        qs = Employee.objects.select_related("salary_account").all()
        active_only = request.query_params.get("active")
        if active_only == "true":
            qs = qs.filter(is_active=True)
        return Response({"results": [_employee_dict(e) for e in qs]})

    # POST — create
    data = request.data
    try:
        salary_account_id = data.get("salary_account_id")
        if not salary_account_id:
            return Response(
                {"success": False, "message": "salary_account_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        salary_account = Account.objects.get(id=salary_account_id)
    except (Account.DoesNotExist, KeyError, ValueError):
        return Response(
            {"success": False, "message": "Valid salary_account_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        # If net_salary is provided, back-calculate gross_salary
        raw_gross = data.get("gross_salary", "0")
        if not raw_gross or str(raw_gross).strip() == "":
            raw_gross = "0"
        gross_salary = Decimal(str(raw_gross))
        net_salary_input = data.get("net_salary")
        if net_salary_input and str(net_salary_input).strip():
            net_val = Decimal(str(net_salary_input))
            if net_val > 0:
                gross_salary = calculate_gross_from_net(net_val)

        emp = Employee.objects.create(
            employee_number=data.get("employee_number") or _next_employee_number(),
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            cnss_number=data.get("cnss_number", ""),
            cin=data.get("cin", ""),
            hire_date=data.get("hire_date") or None,
            termination_date=data.get("termination_date") or None,
            gross_salary=gross_salary,
            salary_account=salary_account,
            bank_account_number=data.get("bank_account_number", ""),
            annual_leave_days=Decimal(str(data.get("annual_leave_days") or 18)),
            is_active=data.get("is_active", True),
            notes=data.get("notes", ""),
        )
        emp = Employee.objects.select_related("salary_account").get(id=emp.id)
        return Response(
            {"success": True, "employee": _employee_dict(emp)},
            status=status.HTTP_201_CREATED,
        )
    except Exception as e:
        logger.exception("Error creating employee")
        return Response(
            {"success": False, "message": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def employees_detail(request, pk):
    try:
        emp = Employee.objects.select_related("salary_account").get(id=pk)
    except Employee.DoesNotExist:
        return Response({"success": False, "message": "Employee not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_employee_dict(emp))

    if request.method == "DELETE":
        if emp.payroll_lines.exists():
            return Response(
                {"success": False, "message": "Cannot delete employee with payroll history"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        emp.delete()
        return Response({"success": True})

    # PUT — update
    data = request.data
    if data.get("salary_account_id"):
        try:
            emp.salary_account = Account.objects.get(id=data["salary_account_id"])
        except (Account.DoesNotExist, ValueError):
            return Response(
                {"success": False, "message": "Invalid salary_account_id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    for field in ("first_name", "last_name", "cnss_number", "cin",
                  "bank_account_number", "notes", "employee_number"):
        if field in data and data[field] is not None:
            setattr(emp, field, data[field])
    if "is_active" in data:
        emp.is_active = bool(data["is_active"])
    if data.get("hire_date"):
        emp.hire_date = data["hire_date"]
    if "termination_date" in data:
        emp.termination_date = data["termination_date"] or None
    if "annual_leave_days" in data and data["annual_leave_days"] not in (None, ""):
        emp.annual_leave_days = Decimal(str(data["annual_leave_days"]))
    if "gross_salary" in data and data["gross_salary"] not in (None, ""):
        emp.gross_salary = Decimal(str(data["gross_salary"]))
    # If net_salary is provided, back-calculate gross_salary
    net_salary_input = data.get("net_salary")
    if net_salary_input and str(net_salary_input).strip():
        net_val = Decimal(str(net_salary_input))
        if net_val > 0:
            emp.gross_salary = calculate_gross_from_net(net_val)
    emp.save()
    emp.refresh_from_db()
    emp = Employee.objects.select_related("salary_account").get(id=emp.id)
    return Response({"success": True, "employee": _employee_dict(emp)})


# ─── PayrollRun views ────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payroll_runs_list_create(request):
    if request.method == "GET":
        qs = PayrollRun.objects.all()
        year = request.query_params.get("year")
        if year:
            qs = qs.filter(year=int(year))
        return Response({"results": [_payroll_run_dict(r) for r in qs]})

    # POST — create new payroll run and calculate
    data = request.data
    year = int(data.get("year", date_mod.today().year))
    month = int(data.get("month", date_mod.today().month))

    if PayrollRun.objects.filter(year=year, month=month).exists():
        return Response(
            {"success": False, "message": f"Payroll run for {year}-{month:02d} already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    last_day = calendar.monthrange(year, month)[1]
    first_of_month = date_mod(year, month, 1)
    last_of_month = date_mod(year, month, last_day)

    employees = (
        Employee.objects.filter(is_active=True)
        .filter(
            # hire_date must be on or before the last day of the payroll month
            models.Q(hire_date__isnull=True) | models.Q(hire_date__lte=last_of_month)
        )
        .exclude(
            # exclude employees terminated before the payroll month started
            termination_date__lt=first_of_month
        )
        .select_related("salary_account")
    )
    if not employees.exists():
        return Response(
            {"success": False, "message": "No active employees found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    with transaction.atomic():
        run = PayrollRun.objects.create(
            year=year,
            month=month,
            run_date=date_mod.today(),
            status="draft",
            created_by=created_by,
        )

        total_gross = Decimal("0")
        total_cnss_employee = Decimal("0")
        total_cnss_employer = Decimal("0")
        total_ir = Decimal("0")
        total_net = Decimal("0")

        for emp in employees:
            calc = calculate_payroll_line(emp.gross_salary)
            PayrollLine.objects.create(
                payroll_run=run,
                employee=emp,
                gross_salary=calc["gross_salary"],
                cnss_employee=calc["cnss_employee"],
                cnss_employer=calc["cnss_employer"],
                ir_amount=calc["ir_amount"],
                net_salary=calc["net_salary"],
            )
            total_gross += calc["gross_salary"]
            total_cnss_employee += calc["cnss_employee"]
            total_cnss_employer += calc["cnss_employer"]
            total_ir += calc["ir_amount"]
            total_net += calc["net_salary"]

        run.total_gross = total_gross
        run.total_cnss_employee = total_cnss_employee
        run.total_cnss_employer = total_cnss_employer
        run.total_ir = total_ir
        run.total_net = total_net
        run.save()

    return Response(
        {"success": True, "payroll_run": _payroll_run_dict(run, include_lines=True)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def payroll_runs_detail(request, pk):
    try:
        run = PayrollRun.objects.get(id=pk)
    except PayrollRun.DoesNotExist:
        return Response({"success": False, "message": "Payroll run not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_payroll_run_dict(run, include_lines=True))

    # DELETE
    if run.status != "draft":
        return Response(
            {"success": False, "message": "Only draft payroll runs can be deleted"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    run.delete()
    return Response({"success": True})


def _recalculate_run_totals(run):
    """Recalculate and save run totals from its lines."""
    lines = run.lines.all()
    run.total_gross = sum(l.gross_salary for l in lines)
    run.total_cnss_employee = sum(l.cnss_employee for l in lines)
    run.total_cnss_employer = sum(l.cnss_employer for l in lines)
    run.total_ir = sum(l.ir_amount for l in lines)
    run.total_net = sum(l.net_salary for l in lines)
    run.save()


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def payroll_run_update_line(request, pk, line_pk):
    """Update or delete a single payroll line."""
    try:
        run = PayrollRun.objects.get(id=pk)
    except PayrollRun.DoesNotExist:
        return Response({"success": False, "message": "Payroll run not found"}, status=status.HTTP_404_NOT_FOUND)

    if run.status != "draft":
        return Response(
            {"success": False, "message": "Only draft payroll runs can be edited"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        line = run.lines.get(id=line_pk)
    except PayrollLine.DoesNotExist:
        return Response({"success": False, "message": "Payroll line not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        with transaction.atomic():
            line.delete()
            _recalculate_run_totals(run)
        run.refresh_from_db()
        return Response({
            "success": True,
            "payroll_run": _payroll_run_dict(run, include_lines=True),
        })

    data = request.data
    gross = data.get("gross_salary")
    net_input = data.get("net_salary")

    # Accept either gross_salary or net_salary (net → back-calculate gross)
    desired_net = None
    if net_input and str(net_input).strip():
        net_val = Decimal(str(net_input))
        if net_val > 0:
            desired_net = net_val
            gross = str(calculate_gross_from_net(net_val))

    if gross is None or gross == "":
        return Response(
            {"success": False, "message": "gross_salary or net_salary is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        calc = calculate_payroll_line(Decimal(str(gross)))
        line.gross_salary = calc["gross_salary"]
        line.cnss_employee = calc["cnss_employee"]
        line.cnss_employer = calc["cnss_employer"]
        line.ir_amount = calc["ir_amount"]
        # Use the exact desired net if provided, otherwise use calculated
        line.net_salary = desired_net if desired_net else calc["net_salary"]
        line.save()

        _recalculate_run_totals(run)

    run.refresh_from_db()
    return Response({
        "success": True,
        "payroll_run": _payroll_run_dict(run, include_lines=True),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payroll_run_approve(request, pk):
    """Approve a payroll run: create journal entry with double-entry bookkeeping."""
    try:
        run = PayrollRun.objects.get(id=pk)
    except PayrollRun.DoesNotExist:
        return Response({"success": False, "message": "Payroll run not found"}, status=status.HTTP_404_NOT_FOUND)

    if run.status != "draft":
        return Response(
            {"success": False, "message": "Only draft payroll runs can be approved"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lines = run.lines.select_related("employee", "employee__salary_account")
    if not lines.exists():
        return Response(
            {"success": False, "message": "No payroll lines found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Find required accounts
    try:
        cnss_account = Account.objects.get(code="572210")  # CNSS expense
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "CNSS account (572210) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        social_charges_payable = Account.objects.get(code="220000")  # Social Charges Payable
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Social Charges Payable account (220000) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Bank account for net salary payment
    bank_account = (
        Account.objects.filter(code__startswith="10", is_active=True)
        .exclude(code="100000")
        .order_by("code")
        .first()
    )
    if not bank_account:
        return Response(
            {"success": False, "message": "No bank account found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    month_label = f"{run.year}-{run.month:02d}"

    with transaction.atomic():
        entry = JournalEntry.objects.create(
            entry_number=_next_je_entry_number(),
            date=run.run_date,
            description=f"Payroll {month_label}",
            reference=f"PAY-{month_label}",
            source="payroll",
            is_posted=True,
            created_by=created_by,
        )

        # DR: Each employee's salary account for their gross salary
        for line in lines:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=line.employee.salary_account,
                debit=line.gross_salary,
                credit=Decimal("0"),
                description=f"Salary {line.employee.first_name} {line.employee.last_name} — {month_label}",
            )

        # DR: CNSS employer contribution
        if run.total_cnss_employer > 0:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=cnss_account,
                debit=run.total_cnss_employer,
                credit=Decimal("0"),
                description=f"CNSS employer contribution — {month_label}",
            )

        # CR: Social Charges Payable (employee CNSS + employer CNSS)
        total_cnss = run.total_cnss_employee + run.total_cnss_employer
        if total_cnss > 0:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=social_charges_payable,
                debit=Decimal("0"),
                credit=total_cnss,
                description=f"CNSS payable — {month_label}",
            )

        # CR: IR Payable (using Social Charges Payable for now)
        if run.total_ir > 0:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=social_charges_payable,
                debit=Decimal("0"),
                credit=run.total_ir,
                description=f"IR payable — {month_label}",
            )

        # CR: Bank account (net salary payment)
        if run.total_net > 0:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=bank_account,
                debit=Decimal("0"),
                credit=run.total_net,
                description=f"Net salary payment — {month_label}",
            )

        run.status = "approved"
        run.journal_entry = entry
        run.save()

    return Response({
        "success": True,
        "payroll_run": _payroll_run_dict(run, include_lines=True),
        "journal_entry_id": str(entry.id),
    })


# ─── Leave / vacation views ──────────────────────────────────────────────────

def _leave_dict(entry):
    return {
        "id": str(entry.id),
        "employee_id": str(entry.employee_id),
        "employee_name": f"{entry.employee.first_name} {entry.employee.last_name}".strip(),
        "employee_number": entry.employee.employee_number,
        "start_date": entry.start_date.isoformat(),
        "end_date": entry.end_date.isoformat(),
        "days": str(entry.days),
        "leave_type": entry.leave_type,
        "note": entry.note,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def leave_list_create(request):
    if request.method == "GET":
        qs = LeaveEntry.objects.select_related("employee").all()
        if request.query_params.get("employee_id"):
            qs = qs.filter(employee_id=request.query_params["employee_id"])
        if request.query_params.get("year"):
            try:
                qs = qs.filter(start_date__year=int(request.query_params["year"]))
            except (ValueError, TypeError):
                pass
        return Response({"success": True, "results": [_leave_dict(e) for e in qs]})

    # POST
    data = request.data
    try:
        employee = Employee.objects.get(id=data.get("employee_id"))
    except (Employee.DoesNotExist, ValueError, TypeError):
        return Response(
            {"success": False, "message": "Valid employee_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not data.get("start_date") or not data.get("end_date"):
        return Response(
            {"success": False, "message": "start_date and end_date are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    entry = LeaveEntry.objects.create(
        employee=employee,
        start_date=data["start_date"],
        end_date=data["end_date"],
        days=Decimal(str(data.get("days") or 0)),
        leave_type=data.get("leave_type") or "annual",
        note=data.get("note", ""),
    )
    entry = LeaveEntry.objects.select_related("employee").get(id=entry.id)
    return Response(
        {"success": True, "leave": _leave_dict(entry)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def leave_detail(request, pk):
    try:
        entry = LeaveEntry.objects.select_related("employee").get(id=pk)
    except LeaveEntry.DoesNotExist:
        return Response({"success": False, "message": "Leave entry not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        entry.delete()
        return Response({"success": True})

    data = request.data
    if data.get("employee_id"):
        try:
            entry.employee = Employee.objects.get(id=data["employee_id"])
        except (Employee.DoesNotExist, ValueError):
            return Response({"success": False, "message": "Invalid employee_id"}, status=status.HTTP_400_BAD_REQUEST)
    if data.get("start_date"):
        entry.start_date = data["start_date"]
    if data.get("end_date"):
        entry.end_date = data["end_date"]
    if "days" in data and data["days"] not in (None, ""):
        entry.days = Decimal(str(data["days"]))
    if data.get("leave_type"):
        entry.leave_type = data["leave_type"]
    if "note" in data and data["note"] is not None:
        entry.note = data["note"]
    entry.save()
    entry = LeaveEntry.objects.select_related("employee").get(id=entry.id)
    return Response({"success": True, "leave": _leave_dict(entry)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def leave_overview(request):
    """Per-employee vacation balance for a year: entitled / taken / remaining."""
    try:
        year = int(request.query_params.get("year") or date_mod.today().year)
    except (ValueError, TypeError):
        year = date_mod.today().year

    employees = Employee.objects.filter(is_active=True).order_by("employee_number")
    # Sum annual-leave days taken per employee in the given year (by start_date year)
    taken_map = {}
    taken_rows = (
        LeaveEntry.objects
        .filter(leave_type="annual", start_date__year=year)
        .values("employee_id")
        .annotate(total=models.Sum("days"))
    )
    for row in taken_rows:
        taken_map[str(row["employee_id"])] = row["total"] or Decimal("0")

    rows = []
    for emp in employees:
        entitled = emp.annual_leave_days or Decimal("0")
        taken = taken_map.get(str(emp.id), Decimal("0"))
        rows.append({
            "employee_id": str(emp.id),
            "employee_number": emp.employee_number,
            "employee_name": f"{emp.first_name} {emp.last_name}".strip(),
            "entitled": str(entitled),
            "taken": str(taken),
            "remaining": str(entitled - taken),
        })
    return Response({"success": True, "year": year, "results": rows})


# ─── Public holidays (double pay if worked) ──────────────────────────────────

# Standard Moroccan fixed-date public holidays (month, day, name). Islamic
# (lunar) holidays move each year and are added manually by the user.
STANDARD_HOLIDAYS = [
    (1, 1, "New Year"),
    (1, 11, "Independence Manifesto Day"),
    (5, 1, "Labour Day"),
    (7, 30, "Throne Day"),
    (8, 14, "Oued Ed-Dahab Day"),
    (8, 20, "Revolution Day"),
    (8, 21, "Youth Day"),
    (11, 6, "Green March"),
    (11, 18, "Independence Day"),
]


def _holiday_dict(h):
    return {
        "id": str(h.id),
        "date": h.date.isoformat(),
        "name": h.name,
        "worker_ids": [str(w.employee_id) for w in h.workers.all()],
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def holidays_list_create(request):
    if request.method == "GET":
        qs = PublicHoliday.objects.prefetch_related("workers").all()
        if request.query_params.get("year"):
            try:
                qs = qs.filter(date__year=int(request.query_params["year"]))
            except (ValueError, TypeError):
                pass
        return Response({"success": True, "results": [_holiday_dict(h) for h in qs]})

    data = request.data
    if not data.get("date"):
        return Response({"success": False, "message": "date is required"}, status=status.HTTP_400_BAD_REQUEST)
    h = PublicHoliday.objects.create(date=data["date"], name=data.get("name", ""))
    return Response({"success": True, "holiday": _holiday_dict(h)}, status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def holidays_detail(request, pk):
    try:
        h = PublicHoliday.objects.prefetch_related("workers").get(id=pk)
    except PublicHoliday.DoesNotExist:
        return Response({"success": False, "message": "Holiday not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        h.delete()
        return Response({"success": True})

    data = request.data
    if data.get("date"):
        h.date = data["date"]
    if "name" in data and data["name"] is not None:
        h.name = data["name"]
    h.save()
    h = PublicHoliday.objects.prefetch_related("workers").get(id=h.id)
    return Response({"success": True, "holiday": _holiday_dict(h)})


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def holiday_workers(request, pk):
    """Replace the set of employees who worked this holiday."""
    try:
        h = PublicHoliday.objects.get(id=pk)
    except PublicHoliday.DoesNotExist:
        return Response({"success": False, "message": "Holiday not found"}, status=status.HTTP_404_NOT_FOUND)

    employee_ids = request.data.get("employee_ids", [])
    valid_ids = set(str(e.id) for e in Employee.objects.filter(id__in=employee_ids))
    with transaction.atomic():
        h.workers.all().delete()
        HolidayWork.objects.bulk_create([
            HolidayWork(holiday=h, employee_id=eid) for eid in valid_ids
        ])
    h = PublicHoliday.objects.prefetch_related("workers").get(id=h.id)
    return Response({"success": True, "holiday": _holiday_dict(h)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def holidays_seed(request):
    """Insert the standard Moroccan fixed-date holidays for a year (skips existing dates)."""
    try:
        year = int(request.data.get("year") or date_mod.today().year)
    except (ValueError, TypeError):
        year = date_mod.today().year

    existing = set(
        PublicHoliday.objects.filter(date__year=year).values_list("date", flat=True)
    )
    created = 0
    for month, day, name in STANDARD_HOLIDAYS:
        d = date_mod(year, month, day)
        if d in existing:
            continue
        PublicHoliday.objects.create(date=d, name=name)
        created += 1

    qs = PublicHoliday.objects.prefetch_related("workers").filter(date__year=year)
    return Response({"success": True, "created": created, "results": [_holiday_dict(h) for h in qs]})
