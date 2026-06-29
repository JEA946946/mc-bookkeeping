"""Journal Entry and Journal Entry Line models (double-entry bookkeeping)."""

import uuid
from decimal import Decimal

from django.db import models

from accounts.models import Account


class JournalEntry(models.Model):
    """Header for a double-entry journal entry."""

    SOURCE_CHOICES = [
        ("manual", "Manual"),
        ("cmr_invoice", "CMR Invoice"),
        ("cmr_payment", "CMR Payment"),
        ("invoice", "Invoice"),
        ("credit_note", "Credit Note"),
        ("expense", "Expense"),
        ("bank", "Bank"),
        ("margin_recognition", "Margin Recognition"),
        ("tva_margin", "TVA on Margin"),
        ("payroll", "Payroll"),
        ("reclass", "Reclassification"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry_number = models.CharField(max_length=20, unique=True)
    date = models.DateField()
    description = models.TextField(blank=True, default="")
    reference = models.CharField(max_length=200, blank=True, default="")
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="manual")
    source_id = models.CharField(max_length=100, blank=True, default="")
    is_posted = models.BooleanField(default=False)
    created_by = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "journal_entries"
        ordering = ["-date", "-entry_number"]

    def __str__(self):
        return f"{self.entry_number} — {self.date}"

    @property
    def total_debit(self):
        return self.lines.aggregate(total=models.Sum("debit"))["total"] or Decimal("0")

    @property
    def total_credit(self):
        return self.lines.aggregate(total=models.Sum("credit"))["total"] or Decimal("0")

    @property
    def is_balanced(self):
        return self.total_debit == self.total_credit


class JournalEntryLine(models.Model):
    """Individual debit or credit line within a journal entry."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    journal_entry = models.ForeignKey(
        JournalEntry,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="journal_lines",
    )
    debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="MAD")
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=1)
    base_debit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    base_credit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    description = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "journal_entry_lines"
        ordering = ["id"]

    def __str__(self):
        return f"{self.account.code}: DR {self.debit} / CR {self.credit}"

    def save(self, *args, **kwargs):
        # Auto-compute base amounts
        self.base_debit = self.debit * self.exchange_rate
        self.base_credit = self.credit * self.exchange_rate
        super().save(*args, **kwargs)


class BankStatementUpload(models.Model):
    """Record of a bank statement file upload."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    filename = models.CharField(max_length=500, default="")
    bank_account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="statement_uploads",
    )
    date_from = models.DateField(null=True, blank=True)
    date_to = models.DateField(null=True, blank=True)
    transaction_count = models.IntegerField(default=0)
    uploaded_by = models.CharField(max_length=200, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bank_statement_uploads"
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.filename} ({self.uploaded_at})"


class BankDescriptionMapping(models.Model):
    """Learned mapping: bank description → account.

    Saved when the user confirms bank statement transactions so that
    future uploads auto-map the same descriptions.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    description_key = models.CharField(max_length=500, unique=True, db_index=True)
    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="bank_mappings",
    )
    example_description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "bank_description_mappings"

    def __str__(self):
        return f"{self.description_key} → {self.account.code}"
