"""Payroll models: Employee, PayrollRun, PayrollLine."""

import uuid

from django.db import models

from accounts.models import Account


class Employee(models.Model):
    """Employee record for payroll."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee_number = models.CharField(max_length=20, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    cnss_number = models.CharField(max_length=50, blank=True, default="")
    cin = models.CharField(max_length=20, blank=True, default="", help_text="Carte d'identité nationale")
    hire_date = models.DateField(null=True, blank=True)
    termination_date = models.DateField(null=True, blank=True)
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2, help_text="Monthly gross salary in MAD")
    salary_account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="employees",
        help_text="Salary expense account (572201-572213)",
    )
    bank_account_number = models.CharField(max_length=50, blank=True, default="")
    annual_leave_days = models.DecimalField(
        max_digits=5, decimal_places=1, default=18,
        help_text="Annual paid leave entitlement in days",
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "employees"
        ordering = ["employee_number"]

    def __str__(self):
        return f"{self.employee_number} — {self.first_name} {self.last_name}"


class LeaveEntry(models.Model):
    """A vacation / leave period for an employee."""

    LEAVE_TYPES = [
        ("annual", "Annual"),
        ("sick", "Sick"),
        ("unpaid", "Unpaid"),
        ("other", "Other"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="leave_entries"
    )
    start_date = models.DateField()
    end_date = models.DateField()
    days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPES, default="annual")
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "leave_entries"
        ordering = ["-start_date"]

    def __str__(self):
        return f"{self.employee_id} {self.start_date}→{self.end_date} ({self.days}d)"


class PublicHoliday(models.Model):
    """A Moroccan public holiday (jour férié). Working it = double pay."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField()
    name = models.CharField(max_length=200, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "public_holidays"
        ordering = ["date"]

    def __str__(self):
        return f"{self.date} {self.name}"


class HolidayWork(models.Model):
    """Records that an employee worked on a public holiday (entitled to extra day's pay)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    holiday = models.ForeignKey(
        PublicHoliday, on_delete=models.CASCADE, related_name="workers"
    )
    employee = models.ForeignKey(
        Employee, on_delete=models.CASCADE, related_name="holiday_work"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "holiday_work"
        unique_together = [("holiday", "employee")]


class PayrollRun(models.Model):
    """Monthly payroll run."""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("approved", "Approved"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    year = models.IntegerField()
    month = models.IntegerField(help_text="1-12")
    run_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    total_gross = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cnss_employee = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_cnss_employer = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_ir = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_net = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    journal_entry = models.ForeignKey(
        "journals.JournalEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payroll_runs",
    )
    notes = models.TextField(blank=True, default="")
    created_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payroll_runs"
        unique_together = [("year", "month")]
        ordering = ["-year", "-month"]

    def __str__(self):
        return f"Payroll {self.year}-{self.month:02d} ({self.status})"


class PayrollLine(models.Model):
    """Individual employee line within a payroll run."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name="lines")
    employee = models.ForeignKey(Employee, on_delete=models.PROTECT, related_name="payroll_lines")
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2)
    cnss_employee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cnss_employer = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ir_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    class Meta:
        db_table = "payroll_lines"
        ordering = ["employee__employee_number"]

    def __str__(self):
        return f"{self.employee} — Gross: {self.gross_salary}, Net: {self.net_salary}"
