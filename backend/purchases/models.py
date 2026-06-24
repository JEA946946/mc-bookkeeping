"""Purchases models: Supplier, Bill, BillLine, Expense."""

import uuid

from django.db import models

from accounts.models import Account


class Supplier(models.Model):
    """Supplier / creditor."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=50, blank=True, default="")
    address = models.TextField(blank=True, default="")
    tax_id = models.CharField(max_length=50, blank=True, default="")
    currency = models.CharField(max_length=3, default="MAD")
    payment_terms = models.IntegerField(default=30, help_text="Days until due")
    notes = models.TextField(blank=True, default="")
    default_account = models.ForeignKey(
        Account, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="default_suppliers",
    )
    cmr_id = models.CharField(max_length=36, blank=True, default="", db_index=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "suppliers"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Bill(models.Model):
    """Purchase bill / vendor invoice."""

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("approved", "Approved"),
        ("paid", "Paid"),
        ("overdue", "Overdue"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bill_number = models.CharField(max_length=50)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, null=True, blank=True, related_name="bills"
    )
    date = models.DateField()
    due_date = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="MAD")
    vat_quarter = models.IntegerField(
        default=1, choices=[(1, "Q1"), (2, "Q2"), (3, "Q3"), (4, "Q4")]
    )
    vat_year = models.IntegerField(default=2025)
    reference = models.CharField(max_length=200, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    journal_entry = models.ForeignKey(
        "journals.JournalEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bills",
    )
    created_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bills"
        ordering = ["-date", "-bill_number"]

    def __str__(self):
        return f"{self.bill_number} — {self.supplier.name if self.supplier else '—'}"

    @property
    def balance_due(self):
        return self.total - self.paid_amount


class BillLine(models.Model):
    """Individual line item on a bill."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="lines")
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_code = models.ForeignKey(
        "core.TaxCode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bill_lines",
    )
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, null=True, blank=True, related_name="bill_lines"
    )
    amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = "bill_lines"
        ordering = ["id"]

    def save(self, *args, **kwargs):
        self.amount = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class BillPaymentLink(models.Model):
    """Links a bank transaction (journal entry line) to a bill as a payment."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name="payment_links")
    journal_entry_line = models.ForeignKey(
        "journals.JournalEntryLine",
        on_delete=models.CASCADE,
        related_name="bill_payment_links",
    )
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    matched_by = models.CharField(max_length=200, blank=True, default="")
    matched_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bill_payment_links"
        unique_together = [("bill", "journal_entry_line")]

    def __str__(self):
        return f"BillPaymentLink {self.bill_id} ↔ {self.journal_entry_line_id} ({self.amount})"


class Expense(models.Model):
    """Direct expense entry."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("paid", "Paid"),
    ]

    PAYMENT_METHOD_CHOICES = [
        ("bank_transfer", "Bank Transfer"),
        ("cash", "Cash"),
        ("card", "Card"),
        ("check", "Check"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField()
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    description = models.CharField(max_length=500)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    tax_code = models.ForeignKey(
        "core.TaxCode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="expenses"
    )
    payment_method = models.CharField(
        max_length=20, choices=PAYMENT_METHOD_CHOICES, default="bank_transfer"
    )
    reference = models.CharField(max_length=200, blank=True, default="")
    receipt = models.FileField(upload_to="receipts/", blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    journal_entry = models.ForeignKey(
        "journals.JournalEntry",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses",
    )
    created_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "expenses"
        ordering = ["-date"]

    def __str__(self):
        return f"{self.date} — {self.description} ({self.amount})"
