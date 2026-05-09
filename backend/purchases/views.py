"""Purchases app views — Supplier, Bill, BillLine, Expense CRUD + approve."""

import csv
import io
import re
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
from .models import Supplier, Bill, BillLine, Expense


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
        "account_id": str(line.account_id),
        "account_code": line.account.code,
        "account_name": line.account.name,
        "amount": str(line.amount),
    }


def _bill_dict(bill, include_lines=True):
    d = {
        "id": str(bill.id),
        "bill_number": bill.bill_number,
        "supplier_id": str(bill.supplier_id),
        "supplier_name": bill.supplier.name if bill.supplier else None,
        "date": bill.date.isoformat() if hasattr(bill.date, "isoformat") else str(bill.date),
        "due_date": bill.due_date.isoformat() if hasattr(bill.due_date, "isoformat") else str(bill.due_date),
        "status": bill.status,
        "subtotal": str(bill.subtotal),
        "tax_amount": str(bill.tax_amount),
        "total": str(bill.total),
        "paid_amount": str(bill.paid_amount),
        "balance_due": str(bill.balance_due),
        "currency": bill.currency,
        "reference": bill.reference,
        "notes": bill.notes,
        "journal_entry_id": str(bill.journal_entry_id) if bill.journal_entry_id else None,
        "created_by": bill.created_by,
        "created_at": bill.created_at.isoformat() if bill.created_at else None,
        "updated_at": bill.updated_at.isoformat() if bill.updated_at else None,
    }
    if include_lines:
        d["lines"] = [
            _bill_line_dict(l)
            for l in bill.lines.select_related("account", "tax_code").all()
        ]
    return d


def _expense_dict(expense):
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
        "account_id": str(expense.account_id),
        "account_code": expense.account.code,
        "account_name": expense.account.name,
        "payment_method": expense.payment_method,
        "reference": expense.reference,
        "receipt": expense.receipt.url if expense.receipt else None,
        "status": expense.status,
        "journal_entry_id": str(expense.journal_entry_id) if expense.journal_entry_id else None,
        "created_by": expense.created_by,
        "created_at": expense.created_at.isoformat() if expense.created_at else None,
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

    supplier = Supplier.objects.create(
        code=code,
        name=data["name"],
        email=data.get("email", ""),
        phone=data.get("phone", ""),
        address=data.get("address", ""),
        tax_id=data.get("tax_id", ""),
        currency=data.get("currency", "MAD"),
        payment_terms=data.get("payment_terms", 30),
        notes=data.get("notes", ""),
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
                      "currency", "payment_terms", "notes", "is_active"):
            if field in data:
                setattr(supplier, field, data[field])
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
        qs = Bill.objects.select_related("supplier")

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
            )

        return Response({
            "success": True,
            "data": {"bills": [_bill_dict(b, include_lines=False) for b in qs]},
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

    with transaction.atomic():
        bill = Bill.objects.create(
            bill_number=bill_number,
            supplier=supplier,
            date=data["date"],
            due_date=data["due_date"],
            status="draft",
            currency=data.get("currency", "MAD"),
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
        bill = Bill.objects.select_related("supplier").get(id=pk)
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

    # PUT — update
    if bill.status not in ("draft",):
        return Response(
            {"success": False, "message": "Only draft bills can be edited"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = request.data

    if "supplier_id" in data:
        try:
            supplier = Supplier.objects.get(id=data["supplier_id"])
            bill.supplier = supplier
        except Supplier.DoesNotExist:
            return Response(
                {"success": False, "message": "Supplier not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    for field in ("date", "due_date", "currency", "reference", "notes"):
        if field in data:
            setattr(bill, field, data[field])

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

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Bill updated",
        "data": {"bill": _bill_dict(bill)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bill_approve(request, pk):
    """Approve a bill: create journal entry (DR expense accounts, CR Accounts Payable)."""
    try:
        bill = Bill.objects.select_related("supplier").get(id=pk)
    except Bill.DoesNotExist:
        return Response(
            {"success": False, "message": "Bill not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if bill.status != "draft":
        return Response(
            {"success": False, "message": "Only draft bills can be approved"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Accounts Payable — code 200000
    try:
        ap_account = Account.objects.get(code="200000")
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Accounts Payable account (200000) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lines = bill.lines.select_related("account", "tax_code").all()
    if not lines:
        return Response(
            {"success": False, "message": "Bill has no lines"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    with transaction.atomic():
        # Create the journal entry
        entry = JournalEntry.objects.create(
            entry_number=_next_je_entry_number(),
            date=bill.date,
            description=f"Bill {bill.bill_number} — {bill.supplier.name}",
            reference=bill.bill_number,
            source="expense",
            is_posted=True,
            created_by=created_by,
        )

        # DR lines: aggregate by account for expense accounts
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

            # Accumulate tax
            if line.tax_code:
                line_tax = line.amount * line.tax_code.rate / Decimal("100")
                total_tax += line_tax
                if not tax_account:
                    tax_account = line.tax_code.account

        # Create DR lines for each unique expense account
        for acct_id, info in account_totals.items():
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=info["account"],
                debit=info["amount"],
                credit=Decimal("0"),
                description=f"Bill {bill.bill_number}",
            )

        # If there is tax, add a DR line for the tax account
        if total_tax > 0 and tax_account:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=tax_account,
                debit=total_tax,
                credit=Decimal("0"),
                description=f"Tax on Bill {bill.bill_number}",
            )

        # CR line: Accounts Payable for the full bill total
        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=ap_account,
            debit=Decimal("0"),
            credit=bill.total,
            description=f"Bill {bill.bill_number} — {bill.supplier.name}",
        )

        # Update bill
        bill.status = "approved"
        bill.journal_entry = entry
        bill.save()

    bill.refresh_from_db()
    return Response({
        "success": True,
        "message": "Bill approved and journal entry created",
        "data": {"bill": _bill_dict(bill)},
    })


# ─── Expenses CRUD ───────────────────────────────────────────────────────────

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

    # POST — create expense
    data = request.data
    for field in ("date", "description", "amount", "account_id"):
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

    supplier = None
    if data.get("supplier_id"):
        try:
            supplier = Supplier.objects.get(id=data["supplier_id"])
        except Supplier.DoesNotExist:
            return Response(
                {"success": False, "message": "Supplier not found"},
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
        created_by=(
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        ),
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

        # DR: expense account
        dr_amount = expense.amount
        tax_amount = Decimal("0")

        if expense.tax_code:
            tax_amount = expense.amount * expense.tax_code.rate / Decimal("100")

        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=expense.account,
            debit=dr_amount,
            credit=Decimal("0"),
            description=expense.description,
        )

        # If there is tax, add a DR line for the tax account
        if tax_amount > 0 and expense.tax_code:
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account=expense.tax_code.account,
                debit=tax_amount,
                credit=Decimal("0"),
                description=f"Tax on expense: {expense.description}",
            )

        # CR: bank/cash account for total (amount + tax)
        total_cr = dr_amount + tax_amount
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

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def suppliers_import_preview(request):
    """Parse uploaded CSV and return preview with duplicate detection."""
    f = request.FILES.get("file")
    if not f:
        return Response({"success": False, "message": "No file uploaded"}, status=400)

    try:
        text = f.read().decode("utf-8-sig")
    except UnicodeDecodeError:
        return Response({"success": False, "message": "File must be UTF-8 encoded"}, status=400)

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return Response({"success": False, "message": "Empty or invalid CSV"}, status=400)

    existing_codes = {s.code: s for s in Supplier.objects.all()}
    existing_names = {s.name.lower(): s for s in Supplier.objects.all()}
    rows = []

    for i, row in enumerate(reader, start=1):
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
    qs = Bill.objects.select_related("supplier").prefetch_related(
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

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="bills.csv"'
    response.write("\ufeff")

    writer = csv.writer(response)
    writer.writerow([
        "bill_number", "supplier_code", "supplier_name", "date", "due_date",
        "status", "reference", "currency", "line_description", "line_quantity",
        "line_unit_price", "line_account_code", "line_tax_code", "line_amount",
        "subtotal", "tax_amount", "total",
    ])

    for bill in qs:
        lines = bill.lines.select_related("account", "tax_code").all()
        if lines:
            for line in lines:
                writer.writerow([
                    bill.bill_number, bill.supplier.code, bill.supplier.name,
                    bill.date.isoformat(), bill.due_date.isoformat(),
                    bill.status, bill.reference, bill.currency,
                    line.description, str(line.quantity), str(line.unit_price),
                    line.account.code if line.account else "",
                    line.tax_code.code if line.tax_code else "",
                    str(line.amount),
                    str(bill.subtotal), str(bill.tax_amount), str(bill.total),
                ])
        else:
            writer.writerow([
                bill.bill_number, bill.supplier.code, bill.supplier.name,
                bill.date.isoformat(), bill.due_date.isoformat(),
                bill.status, bill.reference, bill.currency,
                "", "", "", "", "", "",
                str(bill.subtotal), str(bill.tax_amount), str(bill.total),
            ])

    return response
