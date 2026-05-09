"""Chart of Accounts and Fiscal Year models."""

import uuid

from django.db import models


class AccountType(models.Model):
    """Asset, Liability, Equity, Revenue, Expense."""

    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=50, unique=True)
    normal_balance = models.CharField(
        max_length=6,
        choices=[("debit", "Debit"), ("credit", "Credit")],
    )
    display_order = models.IntegerField(default=0)

    class Meta:
        db_table = "account_types"
        ordering = ["display_order"]

    def __str__(self):
        return self.name


class Account(models.Model):
    """General ledger account (hierarchical via parent)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    account_type = models.ForeignKey(
        AccountType,
        on_delete=models.PROTECT,
        related_name="accounts",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    currency = models.CharField(max_length=3, default="MAD")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    manager_io_id = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} — {self.name}"


class FiscalYear(models.Model):
    """Fiscal year for closing periods."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "fiscal_years"
        ordering = ["-start_date"]

    def __str__(self):
        return self.name


class SupplierAccountMapping(models.Model):
    """Maps a CMR supplier to a bookkeeping expense account."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cmr_supplier_id = models.CharField(max_length=36, unique=True, db_index=True)
    cmr_supplier_name = models.CharField(max_length=255, blank=True, default="")
    account = models.ForeignKey(
        Account,
        on_delete=models.PROTECT,
        related_name="supplier_mappings",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "supplier_account_mappings"

    def __str__(self):
        return f"{self.cmr_supplier_name} → {self.account.code}"
