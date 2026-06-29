"""Purchases app views — Supplier, Bill, BillLine, Expense CRUD + approve."""

import csv
import io
import re
from datetime import date as date_today_mod
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Account
from journals.models import JournalEntry, JournalEntryLine
from .models import (
    Supplier, Bill, BillLine, BillPaymentLink, Expense, ExpenseLine,
    BankTransactionCategorization,
)


# ─── helpers ──────────────────────────────────────────────────────────────────

def _supplier_dict(supplier):
    return {
        "id": str(supplier.id),
        "code": supplier.code,
        "name": supplier.name,
        "email": supplier.email,
        "phone": supplier.phone,
        "address": supplier.address,
        "tax_id": supplier.tax_id,
        "currency": supplier.currency,
        "payment_terms": supplier.payment_terms,
        "notes": supplier.notes,
        "cmr_id": supplier.cmr_id,
        "default_account_id": str(supplier.default_account_id) if supplier.default_account_id else None,
        "is_active": supplier.is_active,
        "created_at": supplier.created_at.isoformat() if supplier.created_at else None,
        "updated_at": supplier.updated_at.isoformat() if supplier.updated_at else None,
    }


def _bill_line_dict(line):
    return {
        "id": str(line.id),
        "bill_id": str(line.bill_id),
        "description": line.description,
        "quantity": str(line.quantity),
        "unit_price": str(line.unit_price),
        "tax_code_id": str(line.tax_code_id) if line.tax_code_id else None,
        "tax_code_name": line.tax_code.name if line.tax_code else None,
        "tax_rate": str(line.tax_code.rate) if line.tax_code else None,
        "account_id": str(line.account_id) if line.account_id else None,
        "account_code": line.account.code if line.account else None,
        "account_name": line.account.name if line.account else None,
        "amount": str(line.amount),
    }


def _bill_dict(bill, include_lines=True):
    supplier = bill.supplier if bill.supplier_id else None
    d = {
        "id": str(bill.id),
        "bill_number": bill.bill_number,
        "supplier_id": str(bill.supplier_id) if bill.supplier_id else None,
        "supplier_name": supplier.name if supplier else None,
        "date": bill.date.isoformat() if hasattr(bill.date, "isoformat") else str(bill.date),
        "due_date": bill.due_date.isoformat() if hasattr(bill.due_date, "isoformat") else str(bill.due_date),
        "status": bill.status,
        "subtotal": str(bill.subtotal),
        "tax_amount": str(bill.tax_amount),
        "total": str(bill.total),
        "paid_amount": str(bill.paid_amount),
        "balance_due": str(bill.balance_due),
        "currency": bill.currency,
        "vat_quarter": bill.vat_quarter,
        "vat_year": bill.vat_year,
        "reference": bill.reference,
        "notes": bill.notes,
        "journal_entry_id": str(bill.journal_entry_id) if bill.journal_entry_id else None,
        "created_by": bill.created_by,
        "created_at": bill.created_at.isoformat() if bill.created_at else None,
        "updated_at": bill.updated_at.isoformat() if bill.updated_at else None,
    }
    if include_lines:
        lines_qs = bill.lines.select_related("account", "tax_code").all()
        d["lines"] = [_bill_line_dict(l) for l in lines_qs]
    else:
        # Include account codes for row highlighting in list view
        if hasattr(bill, '_prefetched_objects_cache') and 'lines' in bill._prefetched_objects_cache:
            d["line_account_codes"] = list({
                l.account.code for l in bill.lines.all() if l.account_id and l.account
            })
        else:
            d["line_account_codes"] = list(
                bill.lines.filter(account__isnull=False)
                .values_list("account__code", flat=True)
                .distinct()
            )
    return d


def _expense_line_dict(line):
    return {
        "id": str(line.id),
        "description": line.description,
        "account_id": str(line.account_id) if line.account_id else None,
        "account_code": line.account.code if line.account else None,
        "account_name": line.account.name if line.account else None,
        "tax_code_id": str(line.tax_code_id) if line.tax_code_id else None,
        "tax_code_name": line.tax_code.name if line.tax_code else None,
        "tax_rate": str(line.tax_code.rate) if line.tax_code else None,
        "amount": str(line.amount),
    }


def _expense_dict(expense):
    lines = expense.lines.select_related("account", "tax_code").all()
    return {
        "id": str(expense.id),
        "date": expense.date.isoformat() if hasattr(expense.date, "isoformat") else str(expense.date),
        "supplier_id": str(expense.supplier_id) if expense.supplier_id else None,
        "supplier_name": expense.supplier.name if expense.supplier else None,
        "description": expense.description,
        "amount": str(expense.amount),
        "tax_code_id": str(expense.tax_code_id) if expense.tax_code_id else None,
        "tax_code_name": expense.tax_code.name if expense.tax_code else None,
        "tax_rate": str(expense.tax_code.rate) if expense.tax_code else None,
        "account_id": str(expense.account_id) if expense.account_id else None,
        "account_code": expense.account.code if expense.account else None,
        "account_name": expense.account.name if expense.account else None,
        "payment_method": expense.payment_method,
        "reference": expense.reference,
        "receipt": expense.receipt.url if expense.receipt else None,
        "status": expense.status,
        "journal_entry_id": str(expense.journal_entry_id) if expense.journal_entry_id else None,
        "created_by": expense.created_by,
        "created_at": expense.created_at.isoformat() if expense.created_at else None,
        "lines": [_expense_line_dict(l) for l in lines],
        "is_split": len(lines) > 1,
    }


def _next_supplier_code():
    """Generate next sequential supplier code like SUP-0001."""
    last = Supplier.objects.order_by("-code").first()
    if not last:
        return "SUP-0001"
    try:
        num = int(last.code.split("-")[1])
        return f"SUP-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"SUP-{Supplier.objects.count() + 1:04d}"


def _next_bill_number():
    """Generate next sequential bill number like BILL-0001."""
    last = Bill.objects.order_by("-bill_number").first()
    if not last:
        return "BILL-0001"
    try:
        num = int(last.bill_number.split("-")[1])
        return f"BILL-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"BILL-{Bill.objects.count() + 1:04d}"


def _next_expense_number():
    """Generate next sequential expense number like EXP-0001.

    Expenses don't have a number field on the model, so we derive the
    next number from the current count. Used for journal entry references.
    """
    count = Expense.objects.count()
    return f"EXP-{count + 1:04d}"


def _next_je_entry_number():
    """Generate next sequential journal entry number like JE-0001."""
    last = JournalEntry.objects.order_by("-entry_number").first()
    if not last:
        return "JE-0001"
    try:
        num = int(last.entry_number.split("-")[1])
        return f"JE-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"JE-{JournalEntry.objects.count() + 1:04d}"


# ─── Suppliers CRUD ──────────────────────────────────────────────────────────


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def suppliers_import_cmr_bulk(request):
    """Bulk-import CMR suppliers. Expects { suppliers: [...] }."""
    items = request.data.get("suppliers", [])
    if not items:
        return Response(
            {"success": False, "message": "No suppliers provided"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing_cmr_ids = set(
        Supplier.objects.exclude(cmr_id="").values_list("cmr_id", flat=True)
    )

    created = 0
    skipped = 0
    errors = []
    for item in items:
        cmr_id = item.get("id") or ""
        name = (item.get("name") or "").strip()
        if not name:
            skipped += 1
            continue
        if cmr_id and cmr_id in existing_cmr_ids:
            skipped += 1
            continue

        try:
            Supplier.objects.create(
                code=_next_supplier_code(),
                name=name,
                email=item.get("email") or "",
                phone=item.get("phone") or "",
                address=item.get("address") or "",
                currency=item.get("currency") or "MAD",
                cmr_id=cmr_id,
            )
            created += 1
            if cmr_id:
                existing_cmr_ids.add(cmr_id)
        except Exception as e:
            errors.append(f"{name}: {e}")
            skipped += 1

    return Response({
        "success": True,
        "created": created,
        "skipped": skipped,
        "errors": errors[:10],
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def suppliers_list_create(request):
    if request.method == "GET":
        qs = Supplier.objects.all()

        # Filter by is_active
        if request.query_params.get("is_active"):
            qs = qs.filter(is_active=request.query_params["is_active"].lower() == "true")

        # Search by name or code
        if request.query_params.get("search"):
            q = request.query_params["search"]
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))

        return Response({
            "success": True,
            "data": {"suppliers": [_supplier_dict(s) for s in qs]},
        })

    # POST — create supplier
    data = request.data
    required = ["name"]
    for field in required:
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    code = data.get("code") or _next_supplier_code()
    if Supplier.objects.filter(code=code).exists():
        return Response(
            {"success": False, "message": f"Supplier code {code} already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    default_account_id = data.get("default_account_id") or None
    supplier = Supplier.objects.create(
        code=code,
        name=data["name"],
        email=data.get("email", ""),
        phone=data.get("phone", ""),
        address=data.get("address", ""),
        tax_id=data.get("tax_id", ""),
        currency=data.get("currency", "MAD"),
        payment_terms=int(data["payment_terms"]) if data.get("payment_terms") else 30,
        notes=data.get("notes", ""),
        default_account_id=default_account_id,
        is_active=data.get("is_active", True),
    )
    return Response({
        "success": True,
        "message": "Supplier created",
        "data": {"supplier": _supplier_dict(supplier)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def suppliers_detail(request, pk):
    try:
        supplier = Supplier.objects.get(id=pk)
    except Supplier.DoesNotExist:
        return Response(
            {"success": False, "message": "Supplier not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"supplier": _supplier_dict(supplier)},
        })

    if request.method == "PUT":
        data = request.data
        if "code" in data and data["code"] != supplier.code:
            if Supplier.objects.filter(code=data["code"]).exclude(id=pk).exists():
                return Response(
                    {"success": False, "message": "Supplier code already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            supplier.code = data["code"]
        for field in ("name", "email", "phone", "address", "tax_id",
                      "currency", "notes", "is_active"):
            if field in data:
                setattr(supplier, field, data[field])
        if "payment_terms" in data:
            supplier.payment_terms = int(data["payment_terms"]) if data["payment_terms"] else 30
        if "default_account_id" in data:
            supplier.default_account_id = data["default_account_id"] or None
        supplier.save()
        return Response({
            "success": True,
            "message": "Supplier updated",
            "data": {"supplier": _supplier_dict(supplier)},
        })

    # DELETE — soft delete
    supplier.is_active = False
    supplier.save()
    return Response({"success": True, "message": "Supplier deactivated"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def supplier_statement(request, pk):
    """Return all bills and payments for a supplier."""
    try:
        supplier = Supplier.objects.get(id=pk)
    except Supplier.DoesNotExist:
        return Response(
            {"success": False, "message": "Supplier not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    bills = Bill.objects.filter(supplier=supplier).select_related("supplier")
    bill_data = [_bill_dict(b, include_lines=False) for b in bills]

    # Aggregate totals
    totals = bills.aggregate(
        total_billed=Sum("total"),
        total_paid=Sum("paid_amount"),
    )
    total_billed = totals["total_billed"] or Decimal("0")
    total_paid = totals["total_paid"] or Decimal("0")
    balance_due = total_billed - total_paid

    return Response({
        "success": True,
        "data": {
            "supplier": _supplier_dict(supplier),
            "bills": bill_data,
            "total_billed": str(total_billed),
            "total_paid": str(total_paid),
            "balance_due": str(balance_due),
        },
    })


# ─── Bills CRUD ──────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def bills_list_create(request):
    if request.method == "GET":
        qs = Bill.objects.all()

        # Filters
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("supplier_id"):
            qs = qs.filter(supplier_id=request.query_params["supplier_id"])
        if request.query_params.get("date_from"):
            qs = qs.filter(date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            qs = qs.filter(date__lte=request.query_params["date_to"])
        if request.query_params.get("search"):
            q = request.query_params["search"]
            qs = qs.filter(
                Q(bill_number__icontains=q)
                | Q(supplier__name__icontains=q)
                | Q(reference__icontains=q)
                | Q(notes__icontains=q)
            )
        if request.query_params.get("amount_min"):
            qs = qs.filter(total__gte=request.query_params["amount_min"])
        if request.query_params.get("amount_max"):
            qs = qs.filter(total__lte=request.query_params["amount_max"])
        if request.query_params.get("overdue") == "true":
            qs = qs.filter(due_date__lt=date_today_mod.today()).exclude(status="paid")
        if request.query_params.get("no_supplier") == "true":
            qs = qs.filter(supplier__isnull=True)
        if request.query_params.get("has_supplier") == "true":
            qs = qs.filter(supplier__isnull=False)
        if request.query_params.get("vat_quarter"):
            qs = qs.filter(vat_quarter=request.query_params["vat_quarter"])
        if request.query_params.get("vat_year"):
            qs = qs.filter(vat_year=request.query_params["vat_year"])

        # Sorting
        sort_field = request.query_params.get("sort", "date")
        sort_dir = request.query_params.get("sort_dir", "desc")
        allowed_sort = {
            "bill_number": "bill_number",
            "supplier_name": "supplier__name",
            "date": "date",
            "due_date": "due_date",
            "subtotal": "subtotal",
            "tax_amount": "tax_amount",
            "total": "total",
            "paid_amount": "paid_amount",
            "status": "status",
            "vat_quarter": "vat_year",
        }
        order_field = allowed_sort.get(sort_field, "date")
        prefix = "-" if sort_dir == "desc" else ""
        if sort_field == "vat_quarter":
            qs = qs.order_by(f"{prefix}{order_field}", f"{prefix}vat_quarter", "-created_at")
        else:
            qs = qs.order_by(f"{prefix}{order_field}", "-created_at")
        total_count = qs.count()

        # Pagination
        try:
            page = int(request.query_params.get("page", 1))
            page_size = int(request.query_params.get("page_size", 50))
        except (ValueError, TypeError):
            page, page_size = 1, 50
        page_size = min(page_size, 200)
        offset = (page - 1) * page_size
        qs = qs[offset : offset + page_size]
        qs = qs.prefetch_related("lines__account")

        return Response({
            "success": True,
            "data": {
                "bills": [_bill_dict(b, include_lines=False) for b in qs],
                "total_count": total_count,
            },
        })

    # POST — create bill with lines
    data = request.data
    for field in ("supplier_id", "date", "due_date"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        supplier = Supplier.objects.get(id=data["supplier_id"])
    except Supplier.DoesNotExist:
        return Response(
            {"success": False, "message": "Supplier not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lines_data = data.get("lines", [])
    if not lines_data:
        return Response(
            {"success": False, "message": "At least one line is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate line accounts exist
    account_ids = [line.get("account_id") for line in lines_data]
    accounts = {str(a.id): a for a in Account.objects.filter(id__in=account_ids)}
    for aid in account_ids:
        if aid not in accounts:
            return Response(
                {"success": False, "message": f"Account {aid} not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Validate tax codes if provided
    from core.models import TaxCode
    tax_code_ids = [line.get("tax_code_id") for line in lines_data if line.get("tax_code_id")]
    tax_codes = {}
    if tax_code_ids:
        tax_codes = {str(tc.id): tc for tc in TaxCode.objects.filter(id__in=tax_code_ids)}
        for tcid in tax_code_ids:
            if tcid not in tax_codes:
                return Response(
                    {"success": False, "message": f"Tax code {tcid} not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    bill_number = data.get("bill_number") or _next_bill_number()

    # Auto-calculate VAT quarter from date
    import datetime as _dt
    try:
        bill_date = _dt.date.fromisoformat(str(data["date"]).split("T")[0])
    except (ValueError, TypeError):
        bill_date = _dt.date.today()
    auto_quarter = (bill_date.month - 1) // 3 + 1
    vat_quarter = int(data.get("vat_quarter", auto_quarter))
    vat_year = int(data.get("vat_year", bill_date.year))

    with transaction.atomic():
        bill = Bill.objects.create(
            bill_number=bill_number,
            supplier=supplier,
            date=data["date"],
            due_date=data["due_date"],
            status="draft",
            currency=data.get("currency", "MAD"),
            vat_quarter=vat_quarter,
            vat_year=vat_year,
            reference=data.get("reference", ""),
            notes=data.get("notes", ""),
            created_by=(
                f"{request.user.first_name} {request.user.last_name}".strip()
                or request.user.username
            ),
        )

        subtotal = Decimal("0")
        tax_amount = Decimal("0")

        for line_data in lines_data:
            try:
                quantity = Decimal(str(line_data.get("quantity", 1)))
                unit_price = Decimal(str(line_data.get("unit_price", 0)))
            except (InvalidOperation, TypeError):
                # Rollback handled by atomic
                return Response(
                    {"success": False, "message": "Invalid quantity or unit_price"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            line_amount = quantity * unit_price
            subtotal += line_amount

            tc = tax_codes.get(line_data.get("tax_code_id")) if line_data.get("tax_code_id") else None
            if tc:
                tax_amount += line_amount * tc.rate / Decimal("100")

            BillLine.objects.create(
                bill=bill,
                description=line_data.get("description", ""),
                quantity=quantity,
                unit_price=unit_price,
                tax_code=tc,
                account_id=line_data["account_id"],
            )

        bill.subtotal = subtotal
        bill.tax_amount = tax_amount
        bill.total = subtotal + tax_amount
        bill.save()

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Bill created",
        "data": {"bill": _bill_dict(bill)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def bills_detail(request, pk):
    try:
        bill = Bill.objects.get(id=pk)
    except Bill.DoesNotExist:
        return Response(
            {"success": False, "message": "Bill not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"bill": _bill_dict(bill)},
        })

    if request.method == "DELETE":
        if bill.status != "draft":
            return Response(
                {"success": False, "message": "Only draft bills can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bill.delete()
        return Response({"success": True, "message": "Bill deleted"})

    # PUT — update. All bills can be edited. Editing a posted bill
    # (approved/paid/overdue) re-syncs its expense journal entry so the books
    # match the new lines. Existing payments are left untouched; the paid/
    # approved status is recomputed against the new total afterwards.
    if bill.status not in ("draft", "approved", "paid", "overdue"):
        return Response(
            {"success": False, "message": "This bill cannot be edited"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = request.data

    if "supplier_id" in data:
        if data["supplier_id"]:
            try:
                supplier = Supplier.objects.get(id=data["supplier_id"])
                bill.supplier = supplier
            except Supplier.DoesNotExist:
                return Response(
                    {"success": False, "message": "Supplier not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            bill.supplier = None

    for field in ("date", "due_date", "currency", "reference", "notes"):
        if field in data:
            setattr(bill, field, data[field])

    if "vat_quarter" in data:
        bill.vat_quarter = int(data["vat_quarter"])
    if "vat_year" in data:
        bill.vat_year = int(data["vat_year"])

    if "bill_number" in data and data["bill_number"] != bill.bill_number:
        if Bill.objects.filter(bill_number=data["bill_number"]).exclude(id=pk).exists():
            return Response(
                {"success": False, "message": "Bill number already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bill.bill_number = data["bill_number"]

    lines_data = data.get("lines")
    if lines_data is not None:
        if not lines_data:
            return Response(
                {"success": False, "message": "At least one line is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate accounts
        account_ids = [l.get("account_id") for l in lines_data]
        accounts = {str(a.id): a for a in Account.objects.filter(id__in=account_ids)}
        for aid in account_ids:
            if aid not in accounts:
                return Response(
                    {"success": False, "message": f"Account {aid} not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Validate tax codes
        from core.models import TaxCode
        tax_code_ids = [l.get("tax_code_id") for l in lines_data if l.get("tax_code_id")]
        tax_codes = {}
        if tax_code_ids:
            tax_codes = {str(tc.id): tc for tc in TaxCode.objects.filter(id__in=tax_code_ids)}

        with transaction.atomic():
            bill.lines.all().delete()
            subtotal = Decimal("0")
            tax_amount = Decimal("0")

            for line_data in lines_data:
                quantity = Decimal(str(line_data.get("quantity", 1)))
                unit_price = Decimal(str(line_data.get("unit_price", 0)))
                line_amount = quantity * unit_price
                subtotal += line_amount

                tc = tax_codes.get(line_data.get("tax_code_id")) if line_data.get("tax_code_id") else None
                if tc:
                    tax_amount += line_amount * tc.rate / Decimal("100")

                BillLine.objects.create(
                    bill=bill,
                    description=line_data.get("description", ""),
                    quantity=quantity,
                    unit_price=unit_price,
                    tax_code=tc,
                    account_id=line_data["account_id"],
                )

            bill.subtotal = subtotal
            bill.tax_amount = tax_amount
            bill.total = subtotal + tax_amount
            bill.save()
    else:
        bill.save()

    # Editing a posted bill pulls it back to draft and removes its journal
    # entry — it must be approved again to re-post. Any payments (paid_amount /
    # payment links) are left untouched; the paid status is recomputed when the
    # bill is re-approved.
    if bill.status != "draft" and bill.journal_entry_id:
        with transaction.atomic():
            entry = bill.journal_entry
            bill.status = "draft"
            bill.journal_entry = None
            bill.save(update_fields=["status", "journal_entry"])
            entry.lines.all().delete()
            entry.delete()

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Bill updated",
        "data": {"bill": _bill_dict(bill)},
    })


def _post_bill_journal_lines(entry, bill, ap_account):
    """Create the journal entry lines for a bill on the given (empty) entry.

    DR expense accounts (grouped) + DR tax account, CR Accounts Payable.
    """
    lines = bill.lines.select_related("account", "tax_code").all()

    account_totals = {}
    total_tax = Decimal("0")
    tax_account = None

    for line in lines:
        acct_id = str(line.account_id)
        if acct_id not in account_totals:
            account_totals[acct_id] = {
                "account": line.account,
                "amount": Decimal("0"),
            }
        account_totals[acct_id]["amount"] += line.amount

        if line.tax_code:
            line_tax = line.amount * line.tax_code.rate / Decimal("100")
            total_tax += line_tax
            if not tax_account:
                tax_account = line.tax_code.account

    for acct_id, info in account_totals.items():
        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=info["account"],
            debit=info["amount"],
            credit=Decimal("0"),
            description=f"Bill {bill.bill_number}",
        )

    if total_tax > 0 and tax_account:
        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=tax_account,
            debit=total_tax,
            credit=Decimal("0"),
            description=f"Tax on Bill {bill.bill_number}",
        )

    JournalEntryLine.objects.create(
        journal_entry=entry,
        account=ap_account,
        debit=Decimal("0"),
        credit=bill.total,
        description=f"Bill {bill.bill_number} — {bill.supplier.name}",
    )


def _approve_bill(bill, created_by):
    """Approve a single bill: create journal entry (DR expense, CR AP).

    Returns (True, None) on success or (False, "error message") on failure.
    """
    if bill.status != "draft":
        return False, "Only draft bills can be approved"

    if not bill.supplier:
        return False, "Supplier must be assigned before approving"

    # Accounts Payable — code 200000
    try:
        ap_account = Account.objects.get(code="200000")
    except Account.DoesNotExist:
        return False, "Accounts Payable account (200000) not found"

    lines = bill.lines.select_related("account", "tax_code").all()
    if not lines:
        return False, "Bill has no lines"

    with transaction.atomic():
        entry = JournalEntry.objects.create(
            entry_number=_next_je_entry_number(),
            date=bill.date,
            description=f"Bill {bill.bill_number} — {bill.supplier.name}",
            reference=bill.bill_number,
            source="expense",
            is_posted=True,
            created_by=created_by,
        )

        _post_bill_journal_lines(entry, bill, ap_account)

        bill.journal_entry = entry
        # A bill that was already (fully) paid before being edited and pulled
        # back to draft returns straight to "paid" on re-approval; otherwise it
        # becomes "approved".
        if bill.total > 0 and bill.paid_amount >= bill.total:
            bill.status = "paid"
        else:
            bill.status = "approved"
        bill.save()

    return True, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_approve(request, pk):
    """Approve a bill: create journal entry (DR expense accounts, CR Accounts Payable)."""
    try:
        bill = Bill.objects.get(id=pk)
    except Bill.DoesNotExist:
        return Response(
            {"success": False, "message": "Bill not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    ok, err = _approve_bill(bill, created_by)
    if not ok:
        return Response(
            {"success": False, "message": err},
            status=status.HTTP_400_BAD_REQUEST,
        )

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Bill approved and journal entry created",
        "data": {"bill": _bill_dict(bill)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bills_bulk_approve(request):
    """Bulk-approve draft bills that have a supplier assigned."""
    bill_ids = request.data.get("bill_ids", [])
    if not bill_ids:
        return Response(
            {"success": False, "message": "No bill IDs provided"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    bills = Bill.objects.filter(
        id__in=bill_ids, status="draft", supplier__isnull=False
    )

    approved_count = 0
    errors = []
    for bill in bills:
        ok, err = _approve_bill(bill, created_by)
        if ok:
            approved_count += 1
        else:
            errors.append(f"{bill.bill_number}: {err}")

    return Response({
        "success": True,
        "approved_count": approved_count,
        "errors": errors,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_move_to_expenses(request, pk):
    """Move a draft bill to expenses: create one Expense per BillLine, then delete the bill."""
    try:
        bill = Bill.objects.get(id=pk)
    except Bill.DoesNotExist:
        return Response(
            {"success": False, "message": "Bill not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if bill.status != "draft":
        return Response(
            {"success": False, "message": "Only draft bills can be moved to expenses"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lines = bill.lines.select_related("account", "tax_code").all()
    if not lines:
        return Response(
            {"success": False, "message": "Bill has no lines"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate all lines have an account
    missing = [i + 1 for i, line in enumerate(lines) if not line.account_id]
    if missing:
        return Response(
            {"success": False, "message": f"All bill lines must have an account. Lines missing account: {missing}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    reference = bill.reference or bill.bill_number

    with transaction.atomic():
        for line in lines:
            Expense.objects.create(
                date=bill.date,
                supplier=bill.supplier,
                description=line.description or f"From bill {bill.bill_number}",
                amount=line.amount,
                tax_code=line.tax_code,
                account=line.account,
                payment_method="bank_transfer",
                reference=reference,
                status="pending",
                created_by=created_by,
            )
        expense_count = len(lines)
        bill.delete()

    return Response({
        "success": True,
        "message": f"Bill moved to {expense_count} expense(s)",
        "data": {"expense_count": expense_count},
    })


# ─── Expenses CRUD ───────────────────────────────────────────────────────────

def _parse_expense_lines(data):
    """Read the optional split `lines` field (a JSON string in multipart, or a
    list). Returns (lines_list_or_None, error_message_or_None)."""
    raw = data.get("lines")
    if not raw:
        return None, None
    if isinstance(raw, str):
        import json
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            return None, "Invalid lines payload"
    if not isinstance(raw, list):
        return None, "Invalid lines payload"
    # Drop fully-empty rows
    raw = [l for l in raw if l and (l.get("account_id") or l.get("amount"))]
    return raw, None


def _build_expense_allocation(lines_data):
    """Validate split lines. Returns (allocations, total, error_message).

    allocations: list of {account, tax_code, amount, description}.
    """
    from core.models import TaxCode
    account_ids = [l.get("account_id") for l in lines_data]
    if not account_ids or any(not a for a in account_ids):
        return None, None, "Each split line needs an account"
    accounts = {str(a.id): a for a in Account.objects.filter(id__in=account_ids)}
    for aid in account_ids:
        if aid not in accounts:
            return None, None, f"Account {aid} not found"
    tax_ids = [l.get("tax_code_id") for l in lines_data if l.get("tax_code_id")]
    tax_codes = {str(tc.id): tc for tc in TaxCode.objects.filter(id__in=tax_ids)} if tax_ids else {}
    allocs = []
    total = Decimal("0")
    for l in lines_data:
        try:
            amt = Decimal(str(l.get("amount", 0)))
        except (InvalidOperation, TypeError):
            return None, None, "Invalid line amount"
        allocs.append({
            "account": accounts[str(l["account_id"])],
            "tax_code": tax_codes.get(str(l.get("tax_code_id"))) if l.get("tax_code_id") else None,
            "amount": amt,
            "description": l.get("description", ""),
        })
        total += amt
    return allocs, total, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def expenses_list_create(request):
    if request.method == "GET":
        qs = Expense.objects.select_related("supplier", "account", "tax_code")

        # Filters
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("date_from"):
            qs = qs.filter(date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            qs = qs.filter(date__lte=request.query_params["date_to"])
        if request.query_params.get("search"):
            q = request.query_params["search"]
            qs = qs.filter(
                Q(description__icontains=q)
                | Q(reference__icontains=q)
                | Q(supplier__name__icontains=q)
            )

        return Response({
            "success": True,
            "data": {"expenses": [_expense_dict(e) for e in qs]},
        })

    # POST — create expense (supports split lines via `lines`)
    data = request.data
    if not data.get("date") or not data.get("description"):
        return Response(
            {"success": False, "message": "date and description are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lines_data, lerr = _parse_expense_lines(data)
    if lerr:
        return Response({"success": False, "message": lerr}, status=status.HTTP_400_BAD_REQUEST)

    supplier = None
    if data.get("supplier_id"):
        try:
            supplier = Supplier.objects.get(id=data["supplier_id"])
        except Supplier.DoesNotExist:
            return Response(
                {"success": False, "message": "Supplier not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    if lines_data:
        allocs, total, aerr = _build_expense_allocation(lines_data)
        if aerr:
            return Response({"success": False, "message": aerr}, status=status.HTTP_400_BAD_REQUEST)
        if not allocs:
            return Response(
                {"success": False, "message": "At least one line is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            expense = Expense.objects.create(
                date=data["date"], supplier=supplier, description=data["description"],
                amount=total, tax_code=allocs[0]["tax_code"], account=allocs[0]["account"],
                payment_method=data.get("payment_method", "bank_transfer"),
                reference=data.get("reference", ""), receipt=request.FILES.get("receipt"),
                status="pending", created_by=created_by,
            )
            for a in allocs:
                ExpenseLine.objects.create(
                    expense=expense, description=a["description"], account=a["account"],
                    tax_code=a["tax_code"], amount=a["amount"],
                )
        return Response({
            "success": True, "message": "Expense created",
            "data": {"expense": _expense_dict(expense)},
        }, status=status.HTTP_201_CREATED)

    # Legacy single-account expense
    for field in ("amount", "account_id"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    try:
        amount = Decimal(str(data["amount"]))
    except (InvalidOperation, TypeError):
        return Response(
            {"success": False, "message": "Invalid amount"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        account = Account.objects.get(id=data["account_id"])
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Account not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    tax_code = None
    if data.get("tax_code_id"):
        from core.models import TaxCode
        try:
            tax_code = TaxCode.objects.get(id=data["tax_code_id"])
        except TaxCode.DoesNotExist:
            return Response(
                {"success": False, "message": "Tax code not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    expense = Expense.objects.create(
        date=data["date"],
        supplier=supplier,
        description=data["description"],
        amount=amount,
        tax_code=tax_code,
        account=account,
        payment_method=data.get("payment_method", "bank_transfer"),
        reference=data.get("reference", ""),
        receipt=request.FILES.get("receipt"),
        status="pending",
        created_by=created_by,
    )

    return Response({
        "success": True,
        "message": "Expense created",
        "data": {"expense": _expense_dict(expense)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def expenses_detail(request, pk):
    try:
        expense = Expense.objects.select_related("supplier", "account", "tax_code").get(id=pk)
    except Expense.DoesNotExist:
        return Response(
            {"success": False, "message": "Expense not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"expense": _expense_dict(expense)},
        })

    if request.method == "DELETE":
        if expense.status == "approved":
            return Response(
                {"success": False, "message": "Cannot delete an approved expense"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        expense.delete()
        return Response({"success": True, "message": "Expense deleted"})

    # PUT — update
    if expense.status == "approved":
        return Response(
            {"success": False, "message": "Cannot edit an approved expense"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = request.data

    if "account_id" in data:
        try:
            expense.account = Account.objects.get(id=data["account_id"])
        except Account.DoesNotExist:
            return Response(
                {"success": False, "message": "Account not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if "supplier_id" in data:
        if data["supplier_id"]:
            try:
                expense.supplier = Supplier.objects.get(id=data["supplier_id"])
            except Supplier.DoesNotExist:
                return Response(
                    {"success": False, "message": "Supplier not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            expense.supplier = None

    if "tax_code_id" in data:
        if data["tax_code_id"]:
            from core.models import TaxCode
            try:
                expense.tax_code = TaxCode.objects.get(id=data["tax_code_id"])
            except TaxCode.DoesNotExist:
                return Response(
                    {"success": False, "message": "Tax code not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            expense.tax_code = None

    if "amount" in data:
        try:
            expense.amount = Decimal(str(data["amount"]))
        except (InvalidOperation, TypeError):
            return Response(
                {"success": False, "message": "Invalid amount"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    for field in ("date", "description", "payment_method", "reference", "status"):
        if field in data:
            setattr(expense, field, data[field])

    if request.FILES.get("receipt"):
        expense.receipt = request.FILES["receipt"]

    lines_data, lerr = _parse_expense_lines(data)
    if lerr:
        return Response({"success": False, "message": lerr}, status=status.HTTP_400_BAD_REQUEST)

    if lines_data is not None:
        allocs, total, aerr = _build_expense_allocation(lines_data)
        if aerr:
            return Response({"success": False, "message": aerr}, status=status.HTTP_400_BAD_REQUEST)
        if not allocs:
            return Response(
                {"success": False, "message": "At least one line is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            expense.amount = total
            expense.account = allocs[0]["account"]
            expense.tax_code = allocs[0]["tax_code"]
            expense.save()
            expense.lines.all().delete()
            for a in allocs:
                ExpenseLine.objects.create(
                    expense=expense, description=a["description"], account=a["account"],
                    tax_code=a["tax_code"], amount=a["amount"],
                )
    else:
        expense.save()

    # Refresh to get updated select_related fields
    expense = Expense.objects.select_related("supplier", "account", "tax_code").get(id=pk)
    return Response({
        "success": True,
        "message": "Expense updated",
        "data": {"expense": _expense_dict(expense)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def expense_approve(request, pk):
    """Approve an expense: create journal entry (DR expense account, CR bank/cash)."""
    try:
        expense = Expense.objects.select_related("supplier", "account", "tax_code").get(id=pk)
    except Expense.DoesNotExist:
        return Response(
            {"success": False, "message": "Expense not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if expense.status != "pending":
        return Response(
            {"success": False, "message": "Only pending expenses can be approved"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Determine the credit account based on payment method
    if expense.payment_method == "cash":
        # Cash account — 100000
        try:
            cr_account = Account.objects.get(code="100000")
        except Account.DoesNotExist:
            return Response(
                {"success": False, "message": "Cash account (100000) not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        # Bank account — find first account starting with "10" (but not 100000 cash)
        cr_account = (
            Account.objects.filter(code__startswith="10", is_active=True)
            .exclude(code="100000")
            .order_by("code")
            .first()
        )
        if not cr_account:
            # Fallback to any bank account starting with "10"
            cr_account = (
                Account.objects.filter(code__startswith="10", is_active=True)
                .order_by("code")
                .first()
            )
        if not cr_account:
            return Response(
                {"success": False, "message": "No bank account found (code starting with 10)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    expense_ref = _next_expense_number()

    with transaction.atomic():
        entry = JournalEntry.objects.create(
            entry_number=_next_je_entry_number(),
            date=expense.date,
            description=f"Expense: {expense.description}",
            reference=expense_ref,
            source="expense",
            is_posted=True,
            created_by=created_by,
        )

        # DR: one line per expense account (split lines, or the single
        # legacy account), grouped. Tax grouped by its own account.
        exp_lines = list(expense.lines.select_related("account", "tax_code").all())
        account_totals = {}
        tax_by_account = {}

        def _add_tax(tax_code, base):
            if not tax_code or not tax_code.account_id:
                return
            t = base * tax_code.rate / Decimal("100")
            if t:
                k = str(tax_code.account_id)
                tax_by_account.setdefault(k, {"account": tax_code.account, "amount": Decimal("0")})
                tax_by_account[k]["amount"] += t

        if exp_lines:
            for ln in exp_lines:
                k = str(ln.account_id)
                account_totals.setdefault(k, {"account": ln.account, "amount": Decimal("0")})
                account_totals[k]["amount"] += ln.amount
                _add_tax(ln.tax_code, ln.amount)
        else:
            account_totals[str(expense.account_id)] = {"account": expense.account, "amount": expense.amount}
            _add_tax(expense.tax_code, expense.amount)

        base_amount = sum(i["amount"] for i in account_totals.values())
        tax_amount = sum(i["amount"] for i in tax_by_account.values())

        for info in account_totals.values():
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=info["account"],
                debit=info["amount"],
                credit=Decimal("0"),
                description=expense.description,
            )

        for info in tax_by_account.values():
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=info["account"],
                debit=info["amount"],
                credit=Decimal("0"),
                description=f"Tax on expense: {expense.description}",
            )

        # CR: bank/cash account for total (base + tax)
        total_cr = base_amount + tax_amount
        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=cr_account,
            debit=Decimal("0"),
            credit=total_cr,
            description=expense.description,
        )

        # Update expense
        expense.status = "approved"
        expense.journal_entry = entry
        expense.save()

    expense = Expense.objects.select_related("supplier", "account", "tax_code").get(id=pk)
    return Response({
        "success": True,
        "message": "Expense approved and journal entry created",
        "data": {"expense": _expense_dict(expense)},
    })


# ─── Supplier Import / Export ────────────────────────────────────────────────

def _parse_import_file(f):
    """Parse CSV or Excel file and return list of dicts (rows)."""
    filename = getattr(f, "name", "").lower()
    if filename.endswith((".xlsx", ".xls")):
        import openpyxl
        # Ensure file pointer is at start and wrap in BytesIO for openpyxl
        raw = f.read()
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        ws = wb.active
        rows_iter = ws.iter_rows(values_only=True)
        header_row = next(rows_iter, None)
        if not header_row:
            return None, "Empty spreadsheet"
        headers = [str(h).strip().lower() if h else "" for h in header_row]
        parsed = []
        for row in rows_iter:
            if all(c is None or str(c).strip() == "" for c in row):
                continue
            d = {}
            for i, h in enumerate(headers):
                if h and i < len(row):
                    val = row[i]
                    if val is None:
                        d[h] = ""
                    elif hasattr(val, "isoformat"):
                        # datetime/date objects from Excel → ISO string
                        d[h] = val.isoformat().split("T")[0] if hasattr(val, "date") else val.isoformat()
                    else:
                        d[h] = str(val).strip()
                elif h:
                    d[h] = ""
            parsed.append(d)
        wb.close()
        return parsed, None
    else:
        try:
            text = f.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            return None, "File must be UTF-8 encoded"
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            return None, "Empty or invalid CSV"
        return list(reader), None


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def suppliers_import_preview(request):
    """Parse uploaded CSV/Excel and return preview with duplicate detection."""
    f = request.FILES.get("file")
    if not f:
        return Response({"success": False, "message": "No file uploaded"}, status=400)

    parsed_rows, err = _parse_import_file(f)
    if err:
        return Response({"success": False, "message": err}, status=400)
    if not parsed_rows:
        return Response({"success": False, "message": "No data found in file"}, status=400)

    existing_codes = {s.code: s for s in Supplier.objects.all()}
    existing_names = {s.name.lower(): s for s in Supplier.objects.all()}
    rows = []

    for i, row in enumerate(parsed_rows, start=1):
        name = (row.get("name") or "").strip()
        code = (row.get("code") or "").strip()
        email = (row.get("email") or "").strip()
        phone = (row.get("phone") or "").strip()
        address = (row.get("address") or "").strip()
        tax_id = (row.get("tax_id") or "").strip()
        currency = (row.get("currency") or "MAD").strip().upper()
        payment_terms = (row.get("payment_terms") or "").strip()
        notes = (row.get("notes") or "").strip()

        errors = []
        if not name:
            errors.append("name is required")

        if email and not re.match(r"[^@]+@[^@]+\.[^@]+", email):
            errors.append("invalid email format")

        if payment_terms:
            try:
                int(payment_terms)
            except ValueError:
                errors.append("payment_terms must be an integer")

        if currency and len(currency) != 3:
            errors.append("currency must be 3 characters")

        row_status = "new"
        existing_id = None
        if errors:
            row_status = "error"
        elif code and code in existing_codes:
            row_status = "duplicate"
            existing_id = str(existing_codes[code].id)
        elif name and name.lower() in existing_names:
            row_status = "duplicate"
            existing_id = str(existing_names[name.lower()].id)

        rows.append({
            "row_number": i,
            "status": row_status,
            "existing_id": existing_id,
            "errors": errors,
            "data": {
                "code": code,
                "name": name,
                "email": email,
                "phone": phone,
                "address": address,
                "tax_id": tax_id,
                "currency": currency or "MAD",
                "payment_terms": payment_terms or "30",
                "notes": notes,
            },
        })

    summary = {
        "new": sum(1 for r in rows if r["status"] == "new"),
        "duplicate": sum(1 for r in rows if r["status"] == "duplicate"),
        "error": sum(1 for r in rows if r["status"] == "error"),
        "total": len(rows),
    }

    return Response({"success": True, "rows": rows, "summary": summary})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def suppliers_import_confirm(request):
    """Create or update suppliers from previewed data."""
    rows = request.data.get("rows", [])
    update_existing = request.data.get("update_existing", False)

    created = 0
    updated = 0
    errors = []

    with transaction.atomic():
        for r in rows:
            if r.get("status") == "error":
                continue

            data = r.get("data", {})
            name = data.get("name", "").strip()
            if not name:
                continue

            if r.get("status") == "duplicate" and update_existing and r.get("existing_id"):
                try:
                    supplier = Supplier.objects.get(id=r["existing_id"])
                    supplier.name = name
                    if data.get("email"):
                        supplier.email = data["email"]
                    if data.get("phone"):
                        supplier.phone = data["phone"]
                    if data.get("address"):
                        supplier.address = data["address"]
                    if data.get("tax_id"):
                        supplier.tax_id = data["tax_id"]
                    if data.get("currency"):
                        supplier.currency = data["currency"]
                    if data.get("payment_terms"):
                        supplier.payment_terms = int(data["payment_terms"])
                    if data.get("notes"):
                        supplier.notes = data["notes"]
                    supplier.save()
                    updated += 1
                except Supplier.DoesNotExist:
                    errors.append(f"Row {r.get('row_number')}: supplier not found")
            elif r.get("status") == "new":
                code = data.get("code") or _next_supplier_code()
                Supplier.objects.create(
                    code=code,
                    name=name,
                    email=data.get("email", ""),
                    phone=data.get("phone", ""),
                    address=data.get("address", ""),
                    tax_id=data.get("tax_id", ""),
                    currency=data.get("currency", "MAD"),
                    payment_terms=int(data.get("payment_terms", 30)),
                    notes=data.get("notes", ""),
                )
                created += 1

    return Response({
        "success": True,
        "created": created,
        "updated": updated,
        "errors": errors,
    })


# ─── Bill Export (server-side CSV) ───────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bills_export(request):
    """Export all bills (with lines) as a flat CSV."""
    qs = Bill.objects.prefetch_related(
        "lines__account", "lines__tax_code"
    ).all()

    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    if request.query_params.get("supplier_id"):
        qs = qs.filter(supplier_id=request.query_params["supplier_id"])
    if request.query_params.get("date_from"):
        qs = qs.filter(date__gte=request.query_params["date_from"])
    if request.query_params.get("date_to"):
        qs = qs.filter(date__lte=request.query_params["date_to"])
    if request.query_params.get("amount_min"):
        qs = qs.filter(total__gte=request.query_params["amount_min"])
    if request.query_params.get("amount_max"):
        qs = qs.filter(total__lte=request.query_params["amount_max"])
    if request.query_params.get("overdue") == "true":
        qs = qs.filter(due_date__lt=date_today_mod.today()).exclude(status="paid")
    if request.query_params.get("no_supplier") == "true":
        qs = qs.filter(supplier__isnull=True)
    if request.query_params.get("vat_quarter"):
        qs = qs.filter(vat_quarter=request.query_params["vat_quarter"])
    if request.query_params.get("vat_year"):
        qs = qs.filter(vat_year=request.query_params["vat_year"])

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="bills.csv"'
    response.write("\ufeff")

    writer = csv.writer(response)
    writer.writerow([
        "bill_number", "supplier_code", "supplier_name", "date", "due_date",
        "status", "reference", "currency", "vat_quarter", "vat_year",
        "line_description", "line_quantity",
        "line_unit_price", "line_account_code", "line_tax_code", "line_amount",
        "subtotal", "tax_amount", "total",
    ])

    for bill in qs:
        lines = bill.lines.select_related("account", "tax_code").all()
        sup_code = bill.supplier.code if bill.supplier else ""
        sup_name = bill.supplier.name if bill.supplier else ""
        vq = f"Q{bill.vat_quarter}"
        vy = str(bill.vat_year)
        if lines:
            for line in lines:
                writer.writerow([
                    bill.bill_number, sup_code, sup_name,
                    bill.date.isoformat(), bill.due_date.isoformat(),
                    bill.status, bill.reference, bill.currency, vq, vy,
                    line.description, str(line.quantity), str(line.unit_price),
                    line.account.code if line.account else "",
                    line.tax_code.code if line.tax_code else "",
                    str(line.amount),
                    str(bill.subtotal), str(bill.tax_amount), str(bill.total),
                ])
        else:
            writer.writerow([
                bill.bill_number, sup_code, sup_name,
                bill.date.isoformat(), bill.due_date.isoformat(),
                bill.status, bill.reference, bill.currency, vq, vy,
                "", "", "", "", "", "",
                str(bill.subtotal), str(bill.tax_amount), str(bill.total),
            ])

    return response


# ─── Bill Import ─────────────────────────────────────────────────────────────
#
# Expected columns:
#   supplier, document_type, document_no, booking_ref, traveler,
#   travel_date, invoice_date, due_date, currency, amount,
#   account, tax_code, status, notes
#

@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
@permission_classes([IsAuthenticated])
def bills_import_preview(request):
    """Parse uploaded CSV/Excel and return preview of bills to create."""
    f = request.FILES.get("file")
    if not f:
        return Response({"success": False, "message": "No file uploaded"}, status=400)

    parsed_rows, err = _parse_import_file(f)
    if err:
        return Response({"success": False, "message": err}, status=400)
    if not parsed_rows:
        return Response({"success": False, "message": "No data found in file"}, status=400)

    # Build lookup maps
    suppliers_by_code = {s.code.lower(): s for s in Supplier.objects.all()}
    suppliers_by_name = {s.name.lower(): s for s in Supplier.objects.all()}
    accounts_by_code = {a.code: a for a in Account.objects.filter(is_active=True)}
    from core.models import TaxCode
    tax_codes_by_code = {tc.code.lower(): tc for tc in TaxCode.objects.all()}

    existing_doc_nos = set(
        Bill.objects.exclude(reference="").values_list("reference", flat=True)
    )

    rows = []
    for i, row in enumerate(parsed_rows, start=1):
        supplier_name = (row.get("supplier") or row.get("leverandør") or row.get("supplier_name") or "").strip()
        supplier_code = (row.get("supplier mr") or row.get("supplier_code") or row.get("leverandør nr") or "").strip()
        bill_number_raw = (row.get("regning nr") or row.get("bill_number") or row.get("regningsnr") or "").strip()
        document_type = (row.get("document_type") or row.get("dokumenttype") or row.get("type") or "").strip()
        document_no = (row.get("document_no") or row.get("dokumentnr") or row.get("document_number") or bill_number_raw or "").strip()
        booking_ref = (row.get("booking_ref") or row.get("bookingref") or row.get("booking") or "").strip()
        traveler = (row.get("traveler") or row.get("rejsende") or row.get("traveller") or "").strip()
        travel_date = (row.get("travel_date") or row.get("rejsedato") or "").strip()
        invoice_date = (row.get("invoice_date") or row.get("fakturadato") or row.get("date") or row.get("dato") or "").strip()
        due_date = (row.get("due_date") or row.get("forfaldsdato") or "").strip()
        currency = (row.get("currency") or row.get("valuta") or "MAD").strip().upper()
        amount = (row.get("amount") or row.get("beløb") or "0").strip()
        account_code = (row.get("account") or row.get("konto") or row.get("account_code") or "").strip()
        tax_code = (row.get("tax_code") or row.get("momskode") or "").strip()
        bill_status = (row.get("status") or "").strip()
        notes = (row.get("notes") or row.get("bemærkninger") or "").strip()

        errors = []

        # Resolve supplier by name, then by code — not required at preview time
        supplier_id = None
        resolved_supplier_name = supplier_name
        # Try by supplier name first
        if supplier_name and supplier_name.lower() in suppliers_by_name:
            s = suppliers_by_name[supplier_name.lower()]
            supplier_id = str(s.id)
            resolved_supplier_name = s.name
        elif supplier_name and supplier_name.lower() in suppliers_by_code:
            s = suppliers_by_code[supplier_name.lower()]
            supplier_id = str(s.id)
            resolved_supplier_name = s.name
        # Try by supplier_code column (supplier mr)
        if not supplier_id and supplier_code and supplier_code.lower() in suppliers_by_code:
            s = suppliers_by_code[supplier_code.lower()]
            supplier_id = str(s.id)
            resolved_supplier_name = s.name

        # Resolve account (optional)
        account_id = None
        if account_code and account_code in accounts_by_code:
            account_id = str(accounts_by_code[account_code].id)

        # Resolve tax code (optional)
        tax_code_id = None
        if tax_code and tax_code.lower() in tax_codes_by_code:
            tax_code_id = str(tax_codes_by_code[tax_code.lower()].id)

        # Validate amount format only
        try:
            float(amount) if amount else 0
        except ValueError:
            errors.append(f"Invalid amount: {amount}")

        # Build description from booking_ref + traveler + travel_date
        desc_parts = []
        if document_type:
            desc_parts.append(document_type)
        if booking_ref:
            desc_parts.append(booking_ref)
        if traveler:
            desc_parts.append(traveler)
        if travel_date:
            desc_parts.append(f"Travel: {travel_date}")
        description = " | ".join(desc_parts) if desc_parts else supplier_name

        row_status = "new"
        if errors:
            row_status = "error"
        elif document_no and document_no in existing_doc_nos:
            row_status = "duplicate"

        rows.append({
            "row_number": i,
            "status": row_status,
            "errors": errors,
            "data": {
                "supplier": resolved_supplier_name,
                "supplier_id": supplier_id or "",
                "document_type": document_type,
                "document_no": document_no,
                "booking_ref": booking_ref,
                "traveler": traveler,
                "travel_date": travel_date,
                "invoice_date": invoice_date,
                "due_date": due_date or invoice_date,
                "currency": currency,
                "amount": amount or "0",
                "account": account_code,
                "account_id": account_id or "",
                "tax_code": tax_code,
                "tax_code_id": tax_code_id or "",
                "status": bill_status,
                "notes": notes,
                "description": description,
            },
        })

    summary = {
        "new": sum(1 for r in rows if r["status"] == "new"),
        "duplicate": sum(1 for r in rows if r["status"] == "duplicate"),
        "error": sum(1 for r in rows if r["status"] == "error"),
        "total": len(rows),
    }

    return Response({"success": True, "rows": rows, "summary": summary})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bills_import_confirm(request):
    """Create bills from previewed rows. Each row = one bill with one line."""
    import datetime as dt

    rows = request.data.get("rows", [])
    update_existing = request.data.get("update_existing", False)

    from core.models import TaxCode

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    today = dt.date.today().isoformat()

    def _clean_date(val):
        """Normalise a date value to YYYY-MM-DD or return today."""
        if not val:
            return today
        s = str(val).strip()
        if not s:
            return today
        # Strip time portion: "2026-05-20 00:00:00" → "2026-05-20"
        s = s.split(" ")[0].split("T")[0]
        # Validate it looks like a date
        try:
            dt.date.fromisoformat(s)
            return s
        except ValueError:
            return today

    try:
        created = 0
        updated = 0
        errors = []

        for r in rows:
            if r.get("status") == "error":
                continue
            if r.get("status") == "duplicate" and not update_existing:
                continue

            data = r.get("data", {})
            supplier_id = data.get("supplier_id")

            supplier = None
            if supplier_id:
                try:
                    supplier = Supplier.objects.get(id=supplier_id)
                except Supplier.DoesNotExist:
                    pass

            invoice_date = _clean_date(data.get("invoice_date"))
            due_date = _clean_date(data.get("due_date")) or invoice_date
            document_no = (data.get("document_no") or "").strip()
            currency = (data.get("currency") or "MAD").strip() or "MAD"
            notes = (data.get("notes") or "").strip()
            description = (data.get("description") or "").strip()

            try:
                amt = Decimal(str(data.get("amount", 0) or 0))
            except (InvalidOperation, TypeError):
                amt = Decimal("0")

            # Resolve tax
            tc = None
            tax_amt = Decimal("0")
            if data.get("tax_code_id"):
                try:
                    tc = TaxCode.objects.get(id=data["tax_code_id"])
                    tax_amt = amt * tc.rate / Decimal("100")
                except TaxCode.DoesNotExist:
                    pass

            account_id = data.get("account_id") or None

            try:
                bill = Bill.objects.create(
                    bill_number=_next_bill_number(),
                    supplier=supplier,
                    date=invoice_date,
                    due_date=due_date,
                    status="draft",
                    currency=currency,
                    reference=document_no,
                    notes=notes,
                    subtotal=amt,
                    tax_amount=tax_amt,
                    total=amt + tax_amt,
                    created_by=created_by,
                )

                BillLine.objects.create(
                    bill=bill,
                    description=description,
                    quantity=Decimal("1"),
                    unit_price=amt,
                    tax_code=tc,
                    account_id=account_id,
                )

                created += 1
            except Exception as e:
                errors.append(f"Row {r.get('row_number', '?')}: {str(e)}")

        return Response({
            "success": True,
            "created": created,
            "updated": updated,
            "errors": errors,
        })
    except Exception as e:
        return Response(
            {"success": False, "message": f"Import error: {str(e)}"},
            status=400,
        )


# ─── Bill Matching (Regningsafstemning) ──────────────────────────────────────

_STOP_WORDS = frozenset({
    "de", "du", "le", "la", "les", "en", "et", "au", "aux", "des", "un", "une",
    "the", "of", "and", "in", "to", "for", "at", "by", "on", "with", "from",
    "og", "i", "til", "fra", "med", "den", "det", "er", "en", "af", "på",
    "virement", "emis", "faveur", "commission", "recu", "commercial",
    "reception", "rapatriement", "instantane",
    "sarl", "srl", "sa", "llc", "ltd", "inc",
})


def _score_bill_match(bill, amount, txn_date, description, reference):
    """Score how well a bill matches a bank transaction (0–100)."""
    import datetime as _dt
    import re
    score = 0
    description_lower = (description or "").lower()
    reference_lower = (reference or "").lower()

    # --- Amount (max 40 pts) ---
    bill_balance = bill.balance_due
    if bill_balance and amount:
        try:
            diff_pct = abs(float(amount) - float(bill_balance)) / float(bill_balance) * 100
        except (ZeroDivisionError, ValueError):
            diff_pct = 100
        if diff_pct == 0:
            score += 40
        elif diff_pct <= 1:
            score += 32
        elif diff_pct <= 5:
            score += 20
        elif diff_pct <= 10:
            score += 8

    # --- Date proximity (max 20 pts) ---
    if txn_date and bill.date:
        try:
            if isinstance(txn_date, str):
                txn_date_parsed = _dt.date.fromisoformat(txn_date.split("T")[0])
            else:
                txn_date_parsed = txn_date
            day_diff = abs((txn_date_parsed - bill.date).days)
            if day_diff == 0:
                score += 20
            elif day_diff <= 7:
                score += 15
            elif day_diff <= 30:
                score += 10
            elif day_diff <= 60:
                score += 5
        except (ValueError, TypeError):
            pass

    # --- Supplier name in description (max 15 pts) ---
    if bill.supplier and description_lower:
        supplier_name = bill.supplier.name.lower()
        if supplier_name and supplier_name in description_lower:
            score += 15
        elif supplier_name:
            words = [w for w in supplier_name.split() if len(w) > 2 and w not in _STOP_WORDS]
            if words:
                matched = sum(1 for w in words if w in description_lower)
                score += min(10, int(matched / len(words) * 10))

    # --- Reference match (max 10 pts) ---
    bill_ref = (bill.reference or "").lower()
    bill_number = (bill.bill_number or "").lower()
    combined = description_lower + " " + reference_lower
    if bill_ref and bill_ref in combined:
        score += 10
    elif bill_number and bill_number in combined:
        score += 10

    # --- Text / word overlap (max 15 pts) ---
    # Collect meaningful words from the bank transaction description
    txn_words = set(re.findall(r"[a-zà-ÿ]{3,}", description_lower + " " + reference_lower))
    txn_words -= _STOP_WORDS

    if txn_words:
        # Build text from bill reference, notes, and line descriptions
        bill_text_parts = []
        if bill.reference:
            bill_text_parts.append(bill.reference.lower())
        if bill.notes:
            bill_text_parts.append(bill.notes.lower())
        if bill.supplier:
            bill_text_parts.append(bill.supplier.name.lower())
        # Include bill line descriptions (prefetched or queried)
        try:
            for line in bill.lines.all():
                if line.description:
                    bill_text_parts.append(line.description.lower())
        except Exception:
            pass

        bill_text = " ".join(bill_text_parts)
        if bill_text:
            bill_words = set(re.findall(r"[a-zà-ÿ]{3,}", bill_text))
            bill_words -= _STOP_WORDS

            if bill_words:
                overlap = txn_words & bill_words
                if overlap:
                    # Score based on overlap ratio relative to the smaller set
                    ratio = len(overlap) / min(len(txn_words), len(bill_words))
                    score += min(15, int(ratio * 15))

    return score


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bill_linked_transaction_ids(request):
    """Return all journal_entry_line IDs that are reconciled — either linked to a
    bill (BillPaymentLink) or categorized directly to an account
    (BankTransactionCategorization)."""
    ids = set(
        BillPaymentLink.objects.values_list("journal_entry_line_id", flat=True)
    )
    ids |= set(
        BankTransactionCategorization.objects.values_list("journal_entry_line_id", flat=True)
    )
    return Response({
        "success": True,
        "data": {"linked_ids": [str(i) for i in ids]},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_match_suggestions(request):
    """Return bills sorted by match score for a given bank transaction."""
    amount = request.data.get("amount")
    txn_date = request.data.get("date")
    description = request.data.get("description", "")
    reference = request.data.get("reference", "")

    try:
        amount = Decimal(str(amount)) if amount else Decimal("0")
    except (InvalidOperation, TypeError):
        amount = Decimal("0")

    bills = Bill.objects.filter(
        status__in=("draft", "approved"),
    ).select_related("supplier").prefetch_related("lines")

    # Only include bills with balance_due > 0
    results = []
    for bill in bills:
        if bill.balance_due <= 0:
            continue
        score = _score_bill_match(bill, amount, txn_date, description, reference)
        if score > 0:
            d = _bill_dict(bill, include_lines=False)
            d["match_score"] = score
            results.append(d)

    results.sort(key=lambda x: x["match_score"], reverse=True)

    return Response({
        "success": True,
        "data": {"suggestions": results},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_auto_match(request):
    """Auto-match a list of bank transactions to bills.

    For each transaction, finds the single best bill with score >= min_score.
    Only matches when exactly one bill scores above threshold (unambiguous).

    Set preview=true to return proposals without recording them.
    """
    transactions = request.data.get("transactions", [])
    min_score = int(request.data.get("min_score", 70))
    preview = request.data.get("preview", False)

    if not transactions:
        return Response(
            {"success": False, "message": "transactions list is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    bills = list(
        Bill.objects.filter(status__in=("draft", "approved"))
        .select_related("supplier").prefetch_related("lines")
    )
    # Filter to bills with remaining balance
    open_bills = [b for b in bills if b.balance_due > 0]

    matched_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    matches = []
    # Track bills already matched in this batch to avoid double-matching
    matched_bill_ids = set()

    for txn in transactions:
        txn_id = txn.get("id")
        try:
            amount = Decimal(str(txn.get("amount", 0)))
        except (InvalidOperation, TypeError):
            continue
        txn_date = txn.get("date", "")
        description = txn.get("description", "")
        reference = txn.get("reference", "")

        # Score all open bills
        scored = []
        for bill in open_bills:
            if str(bill.id) in matched_bill_ids:
                continue
            score = _score_bill_match(bill, amount, txn_date, description, reference)
            if score >= min_score:
                scored.append((bill, score))

        if not scored:
            continue

        scored.sort(key=lambda x: x[1], reverse=True)
        best_bill, best_score = scored[0]

        # Only auto-match if the best score is clearly ahead (at least 10pts above second)
        if len(scored) >= 2 and scored[0][1] - scored[1][1] < 10:
            continue

        # Check this journal_entry_line hasn't already been linked
        already_linked = BillPaymentLink.objects.filter(
            journal_entry_line_id=txn_id
        ).exists()
        if already_linked:
            continue

        matched_bill_ids.add(str(best_bill.id))
        matches.append({
            "transaction_id": txn_id,
            "transaction_description": description,
            "transaction_date": txn_date,
            "bill_id": str(best_bill.id),
            "bill_number": best_bill.bill_number,
            "supplier_name": best_bill.supplier.name if best_bill.supplier else None,
            "score": best_score,
            "amount": str(amount),
        })

    if preview:
        return Response({
            "success": True,
            "message": f"{len(matches)} potential matches found",
            "data": {"matches": matches, "count": len(matches)},
        })

    # Execute the confirmed matches
    executed = []
    for m in matches:
        try:
            jel = JournalEntryLine.objects.get(id=m["transaction_id"])
            bill = Bill.objects.get(id=m["bill_id"])
            amt = Decimal(m["amount"])
        except (JournalEntryLine.DoesNotExist, Bill.DoesNotExist):
            continue

        try:
            with transaction.atomic():
                BillPaymentLink.objects.create(
                    bill=bill,
                    journal_entry_line=jel,
                    amount=amt,
                    matched_by=f"{matched_by} (auto)",
                )
                bill.paid_amount += amt
                if bill.paid_amount >= bill.total:
                    bill.status = "paid"
                bill.save()
            executed.append(m)
        except Exception:
            continue

    return Response({
        "success": True,
        "message": f"{len(executed)} transactions auto-matched",
        "data": {"matches": executed, "count": len(executed)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_record_payment(request, pk):
    """Record a payment on a bill by linking it to a journal entry line."""
    try:
        bill = Bill.objects.get(id=pk)
    except Bill.DoesNotExist:
        return Response(
            {"success": False, "message": "Bill not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    jel_id = request.data.get("journal_entry_line_id")
    amount = request.data.get("amount")

    if not jel_id or not amount:
        return Response(
            {"success": False, "message": "journal_entry_line_id and amount are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        amount = Decimal(str(amount))
    except (InvalidOperation, TypeError):
        return Response(
            {"success": False, "message": "Invalid amount"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        jel = JournalEntryLine.objects.get(id=jel_id)
    except JournalEntryLine.DoesNotExist:
        return Response(
            {"success": False, "message": "Journal entry line not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    matched_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    with transaction.atomic():
        BillPaymentLink.objects.create(
            bill=bill,
            journal_entry_line=jel,
            amount=amount,
            matched_by=matched_by,
        )
        bill.paid_amount += amount
        if bill.paid_amount >= bill.total:
            bill.status = "paid"
        bill.save()

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Payment recorded",
        "data": {"bill": _bill_dict(bill, include_lines=False)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_create_from_transaction(request):
    """Create a bill from a bank transaction (journal entry line), approve it,
    and link the transaction as its payment — the one-click 'turn this bank
    transaction into a matched bill' flow.

    Uses the same matching mechanism as manual reconciliation (BillPaymentLink
    + paid_amount); no extra journal entry beyond the bill's own approval entry.
    """
    data = request.data
    jel_id = data.get("journal_entry_line_id")
    supplier_id = data.get("supplier_id")
    account_id = data.get("account_id")
    lines_data, lerr = _parse_expense_lines(data)
    if lerr:
        return Response({"success": False, "message": lerr}, status=status.HTTP_400_BAD_REQUEST)
    if not jel_id or not supplier_id or (not account_id and not lines_data):
        return Response(
            {"success": False, "message": "journal_entry_line_id, supplier_id and an account (or split lines) are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        jel = JournalEntryLine.objects.select_related("journal_entry").get(id=jel_id)
    except JournalEntryLine.DoesNotExist:
        return Response({"success": False, "message": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)
    try:
        supplier = Supplier.objects.get(id=supplier_id)
    except Supplier.DoesNotExist:
        return Response({"success": False, "message": "Supplier not found"}, status=status.HTTP_400_BAD_REQUEST)
    account = None
    if not lines_data:
        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            return Response({"success": False, "message": "Account not found"}, status=status.HTTP_400_BAD_REQUEST)

    tax_code = None
    if data.get("tax_code_id"):
        from core.models import TaxCode
        try:
            tax_code = TaxCode.objects.get(id=data["tax_code_id"])
        except TaxCode.DoesNotExist:
            return Response({"success": False, "message": "Tax code not found"}, status=status.HTTP_400_BAD_REQUEST)

    if BillPaymentLink.objects.filter(journal_entry_line=jel).exists():
        return Response(
            {"success": False, "message": "This transaction is already matched to a bill"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not Account.objects.filter(code="200000").exists():
        return Response(
            {"success": False, "message": "Accounts Payable account (200000) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # The cash that actually moved on the bank line (credit = out, else debit).
    txn_amount = jel.credit if (jel.credit and jel.credit > 0) else jel.debit
    try:
        unit_price = Decimal(str(data.get("amount") or txn_amount))
    except (InvalidOperation, TypeError):
        return Response({"success": False, "message": "Invalid amount"}, status=status.HTTP_400_BAD_REQUEST)

    import datetime as _dt
    je = jel.journal_entry
    try:
        bill_date = _dt.date.fromisoformat(str(data.get("date") or je.date).split("T")[0])
    except (ValueError, TypeError):
        bill_date = je.date
    auto_quarter = (bill_date.month - 1) // 3 + 1
    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
    )

    with transaction.atomic():
        bill = Bill.objects.create(
            bill_number=_next_bill_number(),
            supplier=supplier,
            date=bill_date,
            due_date=data.get("due_date") or bill_date,
            status="draft",
            currency=jel.currency or "MAD",
            vat_quarter=int(data.get("vat_quarter", auto_quarter)),
            vat_year=int(data.get("vat_year", bill_date.year)),
            reference=data.get("reference") or je.reference or "",
            notes=data.get("notes", ""),
            created_by=created_by,
        )
        default_desc = data.get("description") or je.description or ""
        if lines_data:
            allocs, subtotal, aerr = _build_expense_allocation(lines_data)
            if aerr:
                transaction.set_rollback(True)
                return Response({"success": False, "message": aerr}, status=status.HTTP_400_BAD_REQUEST)
            tax_amount = Decimal("0")
            for a in allocs:
                if a["tax_code"]:
                    tax_amount += a["amount"] * a["tax_code"].rate / Decimal("100")
                BillLine.objects.create(
                    bill=bill, description=a["description"] or default_desc,
                    quantity=Decimal("1"), unit_price=a["amount"],
                    tax_code=a["tax_code"], account=a["account"],
                )
            bill.subtotal = subtotal
            bill.tax_amount = tax_amount
            bill.total = subtotal + tax_amount
            bill.save()
        else:
            tax_amount = (unit_price * tax_code.rate / Decimal("100")) if tax_code else Decimal("0")
            BillLine.objects.create(
                bill=bill,
                description=default_desc,
                quantity=Decimal("1"),
                unit_price=unit_price,
                tax_code=tax_code,
                account=account,
            )
            bill.subtotal = unit_price
            bill.tax_amount = tax_amount
            bill.total = unit_price + tax_amount
            bill.save()

        ok, err = _approve_bill(bill, created_by)
        if not ok:
            transaction.set_rollback(True)
            return Response({"success": False, "message": err}, status=status.HTTP_400_BAD_REQUEST)
        bill.refresh_from_db()

        # Link the transaction as payment — same as manual reconciliation.
        link_amount = txn_amount or unit_price
        BillPaymentLink.objects.create(
            bill=bill, journal_entry_line=jel, amount=link_amount, matched_by=created_by,
        )
        bill.paid_amount += link_amount
        if bill.total > 0 and bill.paid_amount >= bill.total:
            bill.status = "paid"
        bill.save()

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Bill created and matched to the transaction",
        "data": {"bill": _bill_dict(bill)},
    }, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bank_transaction_categorize(request, jel_id):
    """Reconcile an outgoing bank transaction by booking it directly to one or
    more expense/tax accounts — a reclassification out of Client Funds Liability
    (240000) into the agency's own accounts.

    Posts DR expense/tax accounts (+ VAT) / CR 240000 (reversing the import's
    DR 240000), and records a BankTransactionCategorization so the transaction
    reads as matched. The original CR Bank line is untouched.
    """
    data = request.data

    lines_data, lerr = _parse_expense_lines(data)
    if lerr:
        return Response({"success": False, "message": lerr}, status=status.HTTP_400_BAD_REQUEST)
    if not lines_data:
        return Response(
            {"success": False, "message": "At least one account line is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        jel = JournalEntryLine.objects.select_related("journal_entry", "account").get(id=jel_id)
    except JournalEntryLine.DoesNotExist:
        return Response({"success": False, "message": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)

    if jel.journal_entry.source != "bank" or not (jel.account and jel.account.code.startswith("10")):
        return Response(
            {"success": False, "message": "Not a bank transaction line"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if (BillPaymentLink.objects.filter(journal_entry_line=jel).exists()
            or BankTransactionCategorization.objects.filter(journal_entry_line=jel).exists()):
        return Response(
            {"success": False, "message": "This transaction is already matched"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Cash that moved on the bank line: credit = out, else debit.
    txn_amount = jel.credit if (jel.credit and jel.credit > 0) else jel.debit
    if not txn_amount or txn_amount <= 0:
        return Response(
            {"success": False, "message": "Transaction has no amount"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        client_funds_acct = Account.objects.get(code="240000")
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Account 240000 (Client Funds Liability) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allocs, subtotal, aerr = _build_expense_allocation(lines_data)
    if aerr:
        return Response({"success": False, "message": aerr}, status=status.HTTP_400_BAD_REQUEST)

    tax_total = Decimal("0")
    tax_account = None
    for a in allocs:
        if a["tax_code"]:
            tax_total += a["amount"] * a["tax_code"].rate / Decimal("100")
            if not tax_account:
                tax_account = a["tax_code"].account
    posted_total = subtotal + tax_total

    # The reclassification must fully clear the amount that left the bank.
    if posted_total.quantize(Decimal("0.01")) != Decimal(str(txn_amount)).quantize(Decimal("0.01")):
        return Response(
            {"success": False, "message": "Line total must equal the transaction amount"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    import datetime as _dt
    je = jel.journal_entry
    try:
        post_date = _dt.date.fromisoformat(str(data.get("date") or je.date).split("T")[0])
    except (ValueError, TypeError):
        post_date = je.date
    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip() or request.user.username
    )
    desc = data.get("description") or je.description or "Bank transaction"

    with transaction.atomic():
        entry = JournalEntry.objects.create(
            entry_number=_next_je_entry_number(),
            date=post_date,
            description=f"Categorize: {desc}",
            reference=data.get("reference") or je.reference or "",
            source="reclass",
            is_posted=True,
            created_by=created_by,
        )

        # DR expense accounts (base), grouped by account.
        account_totals = {}
        for a in allocs:
            acct = a["account"]
            account_totals.setdefault(acct.id, {"account": acct, "amount": Decimal("0")})
            account_totals[acct.id]["amount"] += a["amount"]
        for info in account_totals.values():
            JournalEntryLine.objects.create(
                journal_entry=entry, account=info["account"],
                debit=info["amount"], credit=Decimal("0"),
                currency=jel.currency, description=desc,
            )

        # DR VAT
        if tax_total > 0 and tax_account:
            JournalEntryLine.objects.create(
                journal_entry=entry, account=tax_account,
                debit=tax_total, credit=Decimal("0"),
                currency=jel.currency, description=f"VAT — {desc}",
            )

        # CR Client Funds Liability (240000) — reverses the import's debit.
        JournalEntryLine.objects.create(
            journal_entry=entry, account=client_funds_acct,
            debit=Decimal("0"), credit=posted_total,
            currency=jel.currency, description=desc,
        )

        BankTransactionCategorization.objects.create(
            journal_entry_line=jel,
            journal_entry=entry,
            amount=posted_total,
            categorized_by=created_by,
        )

    return Response({
        "success": True,
        "message": "Transaction categorized",
        "data": {"journal_entry_id": str(entry.id)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def bank_transaction_reconciliation(request, jel_id):
    """Inspect or undo how a bank transaction is reconciled.

    GET  → what the transaction is linked to (a categorization or a bill).
    DELETE → undo the reconciliation so the transaction can be redone:
        - categorization: delete the reclassification journal entry + link.
        - bill payment link: remove the link and roll the bill's paid amount
          back (the bill itself is left in place).
    """
    try:
        jel = JournalEntryLine.objects.select_related("journal_entry").get(id=jel_id)
    except JournalEntryLine.DoesNotExist:
        return Response({"success": False, "message": "Transaction not found"}, status=status.HTTP_404_NOT_FOUND)

    cat = BankTransactionCategorization.objects.filter(journal_entry_line=jel).select_related("journal_entry").first()
    links = list(BillPaymentLink.objects.filter(journal_entry_line=jel).select_related("bill", "bill__supplier"))

    if request.method == "GET":
        if cat:
            je = cat.journal_entry
            lines = [
                {
                    "account_code": l.account.code,
                    "account_name": l.account.name,
                    "debit": str(l.debit),
                    "credit": str(l.credit),
                }
                for l in je.lines.select_related("account").all()
            ]
            return Response({"success": True, "data": {
                "type": "categorization",
                "amount": str(cat.amount),
                "categorized_by": cat.categorized_by,
                "created_at": cat.created_at.isoformat() if cat.created_at else None,
                "journal_entry": {
                    "id": str(je.id),
                    "entry_number": je.entry_number,
                    "date": je.date.isoformat() if hasattr(je.date, "isoformat") else str(je.date),
                    "lines": lines,
                },
            }})
        if links:
            link = links[0]
            return Response({"success": True, "data": {
                "type": "bill",
                "amount": str(sum((lk.amount for lk in links), Decimal("0"))),
                "bill": _bill_dict(link.bill, include_lines=False),
            }})
        return Response({"success": True, "data": {"type": None}})

    # DELETE — undo
    if cat:
        with transaction.atomic():
            je = cat.journal_entry
            cat.delete()
            je.delete()  # cascade removes its lines
        return Response({"success": True, "message": "Categorization removed"})

    if links:
        with transaction.atomic():
            for link in links:
                bill = link.bill
                bill.paid_amount = (bill.paid_amount or Decimal("0")) - link.amount
                if bill.paid_amount < 0:
                    bill.paid_amount = Decimal("0")
                if bill.status == "paid" and bill.paid_amount < bill.total:
                    bill.status = "approved"
                bill.save()
                link.delete()
        return Response({"success": True, "message": "Payment link removed"})

    return Response({"success": False, "message": "Transaction is not reconciled"}, status=status.HTTP_400_BAD_REQUEST)
