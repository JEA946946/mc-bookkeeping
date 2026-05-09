"""Core models: TaxCode, Payment, BankRule, BankReconciliation, Project, Document, AuditLog, CompanySettings, UserRole."""

import uuid

from django.conf import settings
from django.db import models

from accounts.models import Account


class TaxCode(models.Model):
    """Tax / VAT code definition."""

    TYPE_CHOICES = [
        ("sales", "Sales"),
        ("purchase", "Purchase"),
        ("both", "Both"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percentage")
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default="both")
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="tax_codes"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "tax_codes"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name} ({self.rate}%)"


class Payment(models.Model):
    """Payment record (incoming or outgoing)."""

    TYPE_CHOICES = [
        ("incoming", "Incoming"),
        ("outgoing", "Outgoing"),
    ]

    METHOD_CHOICES = [
        ("bank_transfer", "Bank Transfer"),
        ("cash", "Cash"),
        ("card", "Card"),
        ("check", "Check"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment_number = models.CharField(max_length=20, unique=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    date = models.DateField()
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=3, default="MAD")
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default="bank_transfer")
    reference = models.CharField(max_length=200, blank=True, default="")
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments_as_bank",
    )
    customer = models.ForeignKey(
        "sales.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    supplier = models.ForeignKey(
        "purchases.Supplier",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    journal_entry = models.ForeignKey(
        "journals.JournalEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments",
    )
    notes = models.TextField(blank=True, default="")
    created_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "payments"
        ordering = ["-date", "-payment_number"]

    def __str__(self):
        return f"{self.payment_number} — {self.type} {self.amount}"


class PaymentAllocation(models.Model):
    """Allocation of a payment to an invoice, bill, or credit note."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(
        Payment, on_delete=models.CASCADE, related_name="allocations"
    )
    content_type = models.CharField(
        max_length=20,
        choices=[
            ("invoice", "Invoice"),
            ("bill", "Bill"),
            ("credit_note", "Credit Note"),
        ],
    )
    object_id = models.UUIDField()
    amount = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = "payment_allocations"

    def __str__(self):
        return f"{self.payment.payment_number} → {self.content_type}:{self.object_id} ({self.amount})"


class BankRule(models.Model):
    """Rule for auto-matching bank statement transactions."""

    MATCH_TYPE_CHOICES = [
        ("contains", "Contains"),
        ("regex", "Regex"),
    ]
    MATCH_FIELD_CHOICES = [
        ("description", "Description"),
        ("reference", "Reference"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pattern = models.CharField(max_length=500)
    match_type = models.CharField(max_length=10, choices=MATCH_TYPE_CHOICES, default="contains")
    match_field = models.CharField(max_length=20, choices=MATCH_FIELD_CHOICES, default="description")
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="bank_rules"
    )
    description_template = models.CharField(max_length=500, blank=True, default="")
    priority = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bank_rules"
        ordering = ["-priority", "pattern"]

    def __str__(self):
        return f"{self.pattern} → {self.account.code}"


class BankReconciliation(models.Model):
    """Bank reconciliation session."""

    STATUS_CHOICES = [
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="reconciliations"
    )
    date = models.DateField()
    statement_balance = models.DecimalField(max_digits=15, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="in_progress")
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bank_reconciliations"
        ordering = ["-date"]

    def __str__(self):
        return f"Recon {self.bank_account.code} — {self.date}"


class BankReconciliationLine(models.Model):
    """Individual line within a bank reconciliation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reconciliation = models.ForeignKey(
        BankReconciliation, on_delete=models.CASCADE, related_name="lines"
    )
    journal_line = models.ForeignKey(
        "journals.JournalEntryLine",
        on_delete=models.CASCADE,
        related_name="reconciliation_lines",
    )
    is_matched = models.BooleanField(default=False)
    matched_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "bank_reconciliation_lines"

    def __str__(self):
        return f"Line {self.journal_line_id} — matched={self.is_matched}"


class Project(models.Model):
    """Project for tracking costs and revenue."""

    STATUS_CHOICES = [
        ("active", "Active"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    customer = models.ForeignKey(
        "sales.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="projects",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="active")
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    budget = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True, default="")
    created_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class ProjectTransaction(models.Model):
    """Links a journal entry line to a project."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(
        Project, on_delete=models.CASCADE, related_name="transactions"
    )
    journal_line = models.ForeignKey(
        "journals.JournalEntryLine",
        on_delete=models.CASCADE,
        related_name="project_transactions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_transactions"
        unique_together = [("project", "journal_line")]

    def __str__(self):
        return f"{self.project.code} — {self.journal_line_id}"


class Document(models.Model):
    """Uploaded document linked to various records."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(upload_to="documents/")
    filename = models.CharField(max_length=500)
    description = models.CharField(max_length=500, blank=True, default="")
    journal_entry = models.ForeignKey(
        "journals.JournalEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    invoice = models.ForeignKey(
        "sales.Invoice",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    bill = models.ForeignKey(
        "purchases.Bill",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    expense = models.ForeignKey(
        "purchases.Expense",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="documents",
    )
    uploaded_by = models.CharField(max_length=200, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return self.filename


class AuditLog(models.Model):
    """Audit trail for all changes."""

    ACTION_CHOICES = [
        ("create", "Create"),
        ("update", "Update"),
        ("delete", "Delete"),
        ("post", "Post"),
        ("unpost", "Unpost"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=50)
    record_id = models.CharField(max_length=100)
    changes = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.action} {self.model_name}:{self.record_id}"


class CompanySettings(models.Model):
    """Company-wide settings (singleton)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company_name = models.CharField(max_length=255, default="")
    address = models.TextField(blank=True, default="")
    city = models.CharField(max_length=100, blank=True, default="")
    country = models.CharField(max_length=100, blank=True, default="Morocco")
    tax_id = models.CharField(max_length=50, blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    currency = models.CharField(max_length=3, default="MAD")
    fiscal_year_start_month = models.IntegerField(default=1)
    logo = models.FileField(upload_to="logos/", blank=True, null=True)

    class Meta:
        db_table = "company_settings"

    def __str__(self):
        return self.company_name or "Company Settings"


class UserRole(models.Model):
    """User role assignment (one-to-one)."""

    ROLE_CHOICES = [
        ("admin", "Admin"),
        ("accountant", "Accountant"),
        ("viewer", "Viewer"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="role",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="viewer")

    class Meta:
        db_table = "user_roles"

    def __str__(self):
        return f"{self.user.username} — {self.role}"
