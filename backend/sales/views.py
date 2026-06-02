"""Sales views: Customer, Invoice, InvoiceLine, CreditNote CRUD + posting."""

import csv
import io
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Sum, Q
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Account
from journals.models import JournalEntry, JournalEntryLine
from .models import Customer, Invoice, InvoiceLine, CreditNote


# ─── helpers ──────────────────────────────────────────────────────────────────

def _customer_dict(customer):
    return {
        "id": str(customer.id),
        "code": customer.code,
        "name": customer.name,
        "email": customer.email,
        "phone": customer.phone,
        "address": customer.address,
        "tax_id": customer.tax_id,
        "currency": customer.currency,
        "payment_terms": customer.payment_terms,
        "credit_limit": str(customer.credit_limit),
        "notes": customer.notes,
        "cmr_id": customer.cmr_id,
        "is_active": customer.is_active,
        "created_at": customer.created_at.isoformat() if customer.created_at else None,
        "updated_at": customer.updated_at.isoformat() if customer.updated_at else None,
    }


def _invoice_line_dict(line):
    return {
        "id": str(line.id),
        "description": line.description,
        "quantity": str(line.quantity),
        "unit_price": str(line.unit_price),
        "tax_code_id": str(line.tax_code_id) if line.tax_code_id else None,
        "tax_code_code": line.tax_code.code if line.tax_code_id else None,
        "tax_code_rate": str(line.tax_code.rate) if line.tax_code_id else None,
        "account_id": str(line.account_id),
        "account_code": line.account.code if line.account_id else None,
        "account_name": line.account.name if line.account_id else None,
        "amount": str(line.amount),
    }


def _invoice_dict(invoice, include_lines=True):
    d = {
        "id": str(invoice.id),
        "invoice_number": invoice.invoice_number,
        "customer_id": str(invoice.customer_id),
        "customer_name": invoice.customer.name,
        "customer_code": invoice.customer.code,
        "date": invoice.date.isoformat() if hasattr(invoice.date, "isoformat") else str(invoice.date),
        "due_date": invoice.due_date.isoformat() if hasattr(invoice.due_date, "isoformat") else str(invoice.due_date),
        "status": invoice.status,
        "subtotal": str(invoice.subtotal),
        "tax_amount": str(invoice.tax_amount),
        "total": str(invoice.total),
        "paid_amount": str(invoice.paid_amount),
        "balance_due": str(invoice.balance_due),
        "currency": invoice.currency,
        "exchange_rate": str(invoice.exchange_rate),
        "vat_quarter": invoice.vat_quarter,
        "vat_year": invoice.vat_year,
        "notes": invoice.notes,
        "journal_entry_id": str(invoice.journal_entry_id) if invoice.journal_entry_id else None,
        "created_by": invoice.created_by,
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
        "updated_at": invoice.updated_at.isoformat() if invoice.updated_at else None,
    }
    if include_lines:
        d["lines"] = [
            _invoice_line_dict(l)
            for l in invoice.lines.select_related("account", "tax_code").all()
        ]
    return d


def _credit_note_dict(cn):
    return {
        "id": str(cn.id),
        "credit_note_number": cn.credit_note_number,
        "customer_id": str(cn.customer_id),
        "customer_name": cn.customer.name,
        "customer_code": cn.customer.code,
        "invoice_id": str(cn.invoice_id) if cn.invoice_id else None,
        "invoice_number": cn.invoice.invoice_number if cn.invoice_id else None,
        "date": cn.date.isoformat() if hasattr(cn.date, "isoformat") else str(cn.date),
        "status": cn.status,
        "subtotal": str(cn.subtotal),
        "tax_amount": str(cn.tax_amount),
        "total": str(cn.total),
        "notes": cn.notes,
        "journal_entry_id": str(cn.journal_entry_id) if cn.journal_entry_id else None,
        "created_by": cn.created_by,
        "created_at": cn.created_at.isoformat() if cn.created_at else None,
    }


def _next_customer_code():
    """Generate next sequential customer code like CUS-0001."""
    last = Customer.objects.order_by("-code").first()
    if not last or not last.code.startswith("CUS-"):
        return "CUS-0001"
    try:
        num = int(last.code.split("-")[1])
        return f"CUS-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"CUS-{Customer.objects.count() + 1:04d}"


def _next_invoice_number():
    """Generate next sequential invoice number like INV-0001."""
    last = Invoice.objects.order_by("-invoice_number").first()
    if not last or not last.invoice_number.startswith("INV-"):
        return "INV-0001"
    try:
        num = int(last.invoice_number.split("-")[1])
        return f"INV-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"INV-{Invoice.objects.count() + 1:04d}"


def _next_credit_note_number():
    """Generate next sequential credit note number like CN-0001."""
    last = CreditNote.objects.order_by("-credit_note_number").first()
    if not last or not last.credit_note_number.startswith("CN-"):
        return "CN-0001"
    try:
        num = int(last.credit_note_number.split("-")[1])
        return f"CN-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"CN-{CreditNote.objects.count() + 1:04d}"


def _next_entry_number():
    """Generate next sequential journal entry number like JE-0001."""
    last = JournalEntry.objects.order_by("-entry_number").first()
    if not last:
        return "JE-0001"
    try:
        num = int(last.entry_number.split("-")[1])
        return f"JE-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"JE-{JournalEntry.objects.count() + 1:04d}"


# ─── Customers CRUD ──────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def customers_list_create(request):
    if request.method == "GET":
        qs = Customer.objects.all()

        # Filter by is_active
        if request.query_params.get("is_active"):
            qs = qs.filter(is_active=request.query_params["is_active"].lower() == "true")

        # Search by name or code
        if request.query_params.get("search"):
            q = request.query_params["search"]
            qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q))

        return Response({
            "success": True,
            "customers": [_customer_dict(c) for c in qs],
        })

    # POST — create customer
    data = request.data
    if not data.get("name"):
        return Response(
            {"success": False, "message": "name is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    code = data.get("code") or _next_customer_code()
    if Customer.objects.filter(code=code).exists():
        return Response(
            {"success": False, "message": f"Customer code {code} already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        customer = Customer.objects.create(
            code=code,
            name=data["name"],
            email=data.get("email", ""),
            phone=data.get("phone", ""),
            address=data.get("address", ""),
            tax_id=data.get("tax_id", ""),
            currency=data.get("currency", "MAD"),
            payment_terms=int(data.get("payment_terms", 30)),
            credit_limit=Decimal(str(data.get("credit_limit", 0))),
            notes=data.get("notes", ""),
            is_active=data.get("is_active", True),
        )
    except (ValueError, InvalidOperation) as e:
        return Response(
            {"success": False, "message": f"Invalid data: {e}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        "success": True,
        "message": "Customer created",
        "customer": _customer_dict(customer),
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def customers_detail(request, pk):
    try:
        customer = Customer.objects.get(id=pk)
    except Customer.DoesNotExist:
        return Response(
            {"success": False, "message": "Customer not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "customer": _customer_dict(customer),
        })

    if request.method == "PUT":
        data = request.data
        if "code" in data and data["code"] != customer.code:
            if Customer.objects.filter(code=data["code"]).exclude(id=pk).exists():
                return Response(
                    {"success": False, "message": "Customer code already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            customer.code = data["code"]

        for field in ("name", "email", "phone", "address", "tax_id", "currency", "notes"):
            if field in data:
                setattr(customer, field, data[field])

        if "payment_terms" in data:
            try:
                customer.payment_terms = int(data["payment_terms"])
            except (ValueError, TypeError):
                return Response(
                    {"success": False, "message": "Invalid payment_terms value"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if "credit_limit" in data:
            try:
                customer.credit_limit = Decimal(str(data["credit_limit"]))
            except (InvalidOperation, TypeError):
                return Response(
                    {"success": False, "message": "Invalid credit_limit value"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if "is_active" in data:
            customer.is_active = data["is_active"]

        customer.save()
        return Response({
            "success": True,
            "message": "Customer updated",
            "customer": _customer_dict(customer),
        })

    # DELETE — soft delete
    customer.is_active = False
    customer.save()
    return Response({"success": True, "message": "Customer deactivated"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def customer_statement(request, pk):
    """Return all invoices and credit notes for a customer."""
    try:
        customer = Customer.objects.get(id=pk)
    except Customer.DoesNotExist:
        return Response(
            {"success": False, "message": "Customer not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    invoices = Invoice.objects.filter(customer=customer).select_related("customer")
    credit_notes = CreditNote.objects.filter(customer=customer).select_related(
        "customer", "invoice"
    )

    # Compute totals
    invoice_totals = invoices.aggregate(
        total_invoiced=Sum("total"),
        total_paid=Sum("paid_amount"),
    )
    total_invoiced = invoice_totals["total_invoiced"] or Decimal("0")
    total_paid = invoice_totals["total_paid"] or Decimal("0")

    cn_totals = credit_notes.aggregate(total_credits=Sum("total"))
    total_credits = cn_totals["total_credits"] or Decimal("0")

    balance = total_invoiced - total_paid - total_credits

    return Response({
        "success": True,
        "customer": _customer_dict(customer),
        "invoices": [_invoice_dict(inv, include_lines=False) for inv in invoices],
        "credit_notes": [_credit_note_dict(cn) for cn in credit_notes],
        "summary": {
            "total_invoiced": str(total_invoiced),
            "total_paid": str(total_paid),
            "total_credits": str(total_credits),
            "balance": str(balance),
        },
    })


# ─── Invoices CRUD ───────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def invoices_list_create(request):
    if request.method == "GET":
        qs = Invoice.objects.select_related("customer").all()

        # Filters
        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("customer_id"):
            qs = qs.filter(customer_id=request.query_params["customer_id"])
        if request.query_params.get("date_from"):
            qs = qs.filter(date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            qs = qs.filter(date__lte=request.query_params["date_to"])
        if request.query_params.get("search"):
            q = request.query_params["search"]
            qs = qs.filter(
                Q(invoice_number__icontains=q)
                | Q(customer__name__icontains=q)
                | Q(notes__icontains=q)
            )
        if request.query_params.get("vat_quarter"):
            qs = qs.filter(vat_quarter=request.query_params["vat_quarter"])
        if request.query_params.get("vat_year"):
            qs = qs.filter(vat_year=request.query_params["vat_year"])

        return Response({
            "success": True,
            "invoices": [_invoice_dict(inv, include_lines=False) for inv in qs],
        })

    # POST — create invoice with lines
    data = request.data

    if not data.get("customer_id"):
        return Response(
            {"success": False, "message": "customer_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not data.get("date"):
        return Response(
            {"success": False, "message": "date is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not data.get("due_date"):
        return Response(
            {"success": False, "message": "due_date is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        customer = Customer.objects.get(id=data["customer_id"])
    except Customer.DoesNotExist:
        return Response(
            {"success": False, "message": "Customer not found"},
            status=status.HTTP_404_NOT_FOUND,
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

    invoice_number = data.get("invoice_number") or _next_invoice_number()
    if Invoice.objects.filter(invoice_number=invoice_number).exists():
        return Response(
            {"success": False, "message": f"Invoice number {invoice_number} already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Auto-calculate VAT quarter from date
    import datetime as _dt
    try:
        inv_date = _dt.date.fromisoformat(str(data["date"]).split("T")[0])
    except (ValueError, TypeError):
        inv_date = _dt.date.today()
    auto_quarter = (inv_date.month - 1) // 3 + 1
    vat_quarter = int(data.get("vat_quarter", auto_quarter))
    vat_year = int(data.get("vat_year", inv_date.year))

    with transaction.atomic():
        invoice = Invoice.objects.create(
            invoice_number=invoice_number,
            customer=customer,
            date=data["date"],
            due_date=data["due_date"],
            status="draft",
            currency=data.get("currency", customer.currency),
            exchange_rate=Decimal(str(data.get("exchange_rate", 1))),
            vat_quarter=vat_quarter,
            vat_year=vat_year,
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
                raise ValueError("Invalid quantity or unit_price")

            line_amount = quantity * unit_price
            subtotal += line_amount

            # Calculate tax if tax_code provided
            line_tax = Decimal("0")
            tax_code_id = line_data.get("tax_code_id")
            if tax_code_id:
                from core.models import TaxCode

                try:
                    tax_code = TaxCode.objects.get(id=tax_code_id)
                    line_tax = line_amount * tax_code.rate / Decimal("100")
                    tax_amount += line_tax
                except TaxCode.DoesNotExist:
                    pass

            InvoiceLine.objects.create(
                invoice=invoice,
                description=line_data.get("description", ""),
                quantity=quantity,
                unit_price=unit_price,
                tax_code_id=tax_code_id,
                account_id=line_data["account_id"],
            )

        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.total = subtotal + tax_amount
        invoice.save()

    invoice.refresh_from_db()
    return Response({
        "success": True,
        "message": "Invoice created",
        "invoice": _invoice_dict(invoice),
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def invoices_detail(request, pk):
    try:
        invoice = Invoice.objects.select_related("customer").get(id=pk)
    except Invoice.DoesNotExist:
        return Response(
            {"success": False, "message": "Invoice not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "invoice": _invoice_dict(invoice),
        })

    if request.method == "DELETE":
        if invoice.status != "draft":
            return Response(
                {"success": False, "message": "Only draft invoices can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.delete()
        return Response({"success": True, "message": "Invoice deleted"})

    # PUT — update invoice
    if invoice.status not in ("draft", "sent"):
        return Response(
            {"success": False, "message": f"Cannot edit invoice with status '{invoice.status}'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = request.data

    if "customer_id" in data:
        try:
            customer = Customer.objects.get(id=data["customer_id"])
            invoice.customer = customer
        except Customer.DoesNotExist:
            return Response(
                {"success": False, "message": "Customer not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    for field in ("date", "due_date", "currency", "exchange_rate", "notes"):
        if field in data:
            setattr(invoice, field, data[field])

    if "vat_quarter" in data:
        invoice.vat_quarter = int(data["vat_quarter"])
    if "vat_year" in data:
        invoice.vat_year = int(data["vat_year"])

    if "invoice_number" in data and data["invoice_number"] != invoice.invoice_number:
        if Invoice.objects.filter(invoice_number=data["invoice_number"]).exclude(id=pk).exists():
            return Response(
                {"success": False, "message": "Invoice number already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        invoice.invoice_number = data["invoice_number"]

    # If lines are provided, replace them
    lines_data = data.get("lines")
    if lines_data is not None:
        if not lines_data:
            return Response(
                {"success": False, "message": "At least one line is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate accounts
        account_ids = [line.get("account_id") for line in lines_data]
        accounts = {str(a.id): a for a in Account.objects.filter(id__in=account_ids)}
        for aid in account_ids:
            if aid not in accounts:
                return Response(
                    {"success": False, "message": f"Account {aid} not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            invoice.lines.all().delete()

            subtotal = Decimal("0")
            tax_amount = Decimal("0")

            for line_data in lines_data:
                try:
                    quantity = Decimal(str(line_data.get("quantity", 1)))
                    unit_price = Decimal(str(line_data.get("unit_price", 0)))
                except (InvalidOperation, TypeError):
                    return Response(
                        {"success": False, "message": "Invalid quantity or unit_price"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                line_amount = quantity * unit_price
                subtotal += line_amount

                tax_code_id = line_data.get("tax_code_id")
                if tax_code_id:
                    from core.models import TaxCode

                    try:
                        tax_code = TaxCode.objects.get(id=tax_code_id)
                        line_tax = line_amount * tax_code.rate / Decimal("100")
                        tax_amount += line_tax
                    except TaxCode.DoesNotExist:
                        pass

                InvoiceLine.objects.create(
                    invoice=invoice,
                    description=line_data.get("description", ""),
                    quantity=quantity,
                    unit_price=unit_price,
                    tax_code_id=tax_code_id,
                    account_id=line_data["account_id"],
                )

            invoice.subtotal = subtotal
            invoice.tax_amount = tax_amount
            invoice.total = subtotal + tax_amount
            invoice.save()
    else:
        invoice.save()

    invoice.refresh_from_db()
    return Response({
        "success": True,
        "message": "Invoice updated",
        "invoice": _invoice_dict(invoice),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_post(request, pk):
    """Post an invoice: create a journal entry (DR Accounts Receivable, CR Revenue)."""
    try:
        invoice = Invoice.objects.select_related("customer").get(id=pk)
    except Invoice.DoesNotExist:
        return Response(
            {"success": False, "message": "Invoice not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if invoice.journal_entry_id:
        return Response(
            {"success": False, "message": "Invoice already has a journal entry"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    lines = invoice.lines.select_related("account", "tax_code").all()
    if not lines:
        return Response(
            {"success": False, "message": "Invoice has no lines"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Get Accounts Receivable account (120000)
    try:
        ar_account = Account.objects.get(code="120000")
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Accounts Receivable account (120000) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    with transaction.atomic():
        # Create journal entry
        entry = JournalEntry.objects.create(
            entry_number=_next_entry_number(),
            date=invoice.date,
            description=f"Invoice {invoice.invoice_number} — {invoice.customer.name}",
            reference=f"INV:{invoice.invoice_number}",
            source="invoice",
            source_id=str(invoice.id),
            is_posted=True,
            created_by=created_by,
        )

        # DR: Accounts Receivable for invoice total
        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=ar_account,
            debit=invoice.total,
            credit=Decimal("0"),
            description=f"Invoice {invoice.invoice_number} — {invoice.customer.name}",
        )

        # CR: Revenue accounts — group by account
        account_totals = defaultdict(Decimal)
        for line in lines:
            account_totals[line.account_id] += line.amount

        for account_id, amount in account_totals.items():
            JournalEntryLine.objects.create(
                journal_entry=entry,
                account_id=account_id,
                debit=Decimal("0"),
                credit=amount,
                description=f"Invoice {invoice.invoice_number} — Revenue",
            )

        # CR: Tax accounts — group by tax_code.account
        tax_totals = defaultdict(Decimal)
        for line in lines:
            if line.tax_code_id and line.tax_code:
                line_tax = line.amount * line.tax_code.rate / Decimal("100")
                tax_totals[line.tax_code.account_id] += line_tax

        for tax_account_id, tax_total in tax_totals.items():
            if tax_total > 0:
                JournalEntryLine.objects.create(
                    journal_entry=entry,
                    account_id=tax_account_id,
                    debit=Decimal("0"),
                    credit=tax_total,
                    description=f"Invoice {invoice.invoice_number} — Tax",
                )

        # Link journal entry to invoice and update status
        invoice.journal_entry = entry
        if invoice.status == "draft":
            invoice.status = "sent"
        invoice.save()

    invoice.refresh_from_db()
    return Response({
        "success": True,
        "message": "Invoice posted",
        "invoice": _invoice_dict(invoice),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invoice_send(request, pk):
    """Mark an invoice as sent."""
    try:
        invoice = Invoice.objects.select_related("customer").get(id=pk)
    except Invoice.DoesNotExist:
        return Response(
            {"success": False, "message": "Invoice not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if invoice.status not in ("draft",):
        return Response(
            {"success": False, "message": f"Cannot send invoice with status '{invoice.status}'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    invoice.status = "sent"
    invoice.save()

    return Response({
        "success": True,
        "message": "Invoice marked as sent",
        "invoice": _invoice_dict(invoice),
    })


# ─── Credit Notes CRUD ──────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def credit_notes_list_create(request):
    if request.method == "GET":
        qs = CreditNote.objects.select_related("customer", "invoice").all()

        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("customer_id"):
            qs = qs.filter(customer_id=request.query_params["customer_id"])
        if request.query_params.get("search"):
            q = request.query_params["search"]
            qs = qs.filter(
                Q(credit_note_number__icontains=q)
                | Q(customer__name__icontains=q)
            )

        return Response({
            "success": True,
            "credit_notes": [_credit_note_dict(cn) for cn in qs],
        })

    # POST — create credit note
    data = request.data

    if not data.get("customer_id"):
        return Response(
            {"success": False, "message": "customer_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not data.get("date"):
        return Response(
            {"success": False, "message": "date is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        customer = Customer.objects.get(id=data["customer_id"])
    except Customer.DoesNotExist:
        return Response(
            {"success": False, "message": "Customer not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    invoice = None
    if data.get("invoice_id"):
        try:
            invoice = Invoice.objects.get(id=data["invoice_id"])
            if invoice.customer_id != customer.id:
                return Response(
                    {"success": False, "message": "Invoice does not belong to this customer"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Invoice.DoesNotExist:
            return Response(
                {"success": False, "message": "Invoice not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

    credit_note_number = data.get("credit_note_number") or _next_credit_note_number()
    if CreditNote.objects.filter(credit_note_number=credit_note_number).exists():
        return Response(
            {"success": False, "message": f"Credit note number {credit_note_number} already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        subtotal = Decimal(str(data.get("subtotal", 0)))
        tax_amount = Decimal(str(data.get("tax_amount", 0)))
        total = Decimal(str(data.get("total", 0)))
    except (InvalidOperation, TypeError):
        return Response(
            {"success": False, "message": "Invalid amount values"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # If total not provided, compute from subtotal + tax
    if total == 0 and subtotal > 0:
        total = subtotal + tax_amount

    cn = CreditNote.objects.create(
        credit_note_number=credit_note_number,
        customer=customer,
        invoice=invoice,
        date=data["date"],
        status="draft",
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=total,
        notes=data.get("notes", ""),
        created_by=(
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        ),
    )

    return Response({
        "success": True,
        "message": "Credit note created",
        "credit_note": _credit_note_dict(cn),
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def credit_notes_detail(request, pk):
    try:
        cn = CreditNote.objects.select_related("customer", "invoice").get(id=pk)
    except CreditNote.DoesNotExist:
        return Response(
            {"success": False, "message": "Credit note not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "credit_note": _credit_note_dict(cn),
        })

    if request.method == "DELETE":
        if cn.status != "draft":
            return Response(
                {"success": False, "message": "Only draft credit notes can be deleted"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cn.delete()
        return Response({"success": True, "message": "Credit note deleted"})

    # PUT — update
    if cn.status != "draft":
        return Response(
            {"success": False, "message": "Only draft credit notes can be edited"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    data = request.data

    if "customer_id" in data:
        try:
            customer = Customer.objects.get(id=data["customer_id"])
            cn.customer = customer
        except Customer.DoesNotExist:
            return Response(
                {"success": False, "message": "Customer not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if "invoice_id" in data:
        if data["invoice_id"]:
            try:
                invoice = Invoice.objects.get(id=data["invoice_id"])
                if invoice.customer_id != cn.customer_id:
                    return Response(
                        {"success": False, "message": "Invoice does not belong to this customer"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                cn.invoice = invoice
            except Invoice.DoesNotExist:
                return Response(
                    {"success": False, "message": "Invoice not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            cn.invoice = None

    if "credit_note_number" in data and data["credit_note_number"] != cn.credit_note_number:
        if CreditNote.objects.filter(credit_note_number=data["credit_note_number"]).exclude(id=pk).exists():
            return Response(
                {"success": False, "message": "Credit note number already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        cn.credit_note_number = data["credit_note_number"]

    for field in ("date", "notes"):
        if field in data:
            setattr(cn, field, data[field])

    for decimal_field in ("subtotal", "tax_amount", "total"):
        if decimal_field in data:
            try:
                setattr(cn, decimal_field, Decimal(str(data[decimal_field])))
            except (InvalidOperation, TypeError):
                return Response(
                    {"success": False, "message": f"Invalid {decimal_field} value"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

    cn.save()
    cn.refresh_from_db()
    return Response({
        "success": True,
        "message": "Credit note updated",
        "credit_note": _credit_note_dict(cn),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def credit_note_apply(request, pk):
    """Apply a credit note to an invoice: reduce paid_amount and create reversal JE."""
    try:
        cn = CreditNote.objects.select_related("customer", "invoice").get(id=pk)
    except CreditNote.DoesNotExist:
        return Response(
            {"success": False, "message": "Credit note not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if cn.status == "applied":
        return Response(
            {"success": False, "message": "Credit note is already applied"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Determine target invoice: from request body or from the credit note itself
    invoice_id = request.data.get("invoice_id") or (str(cn.invoice_id) if cn.invoice_id else None)
    if not invoice_id:
        return Response(
            {"success": False, "message": "invoice_id is required (no linked invoice)"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        invoice = Invoice.objects.select_related("customer").get(id=invoice_id)
    except Invoice.DoesNotExist:
        return Response(
            {"success": False, "message": "Invoice not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if invoice.customer_id != cn.customer_id:
        return Response(
            {"success": False, "message": "Credit note and invoice must belong to the same customer"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if cn.total > invoice.balance_due:
        return Response(
            {"success": False, "message": f"Credit note total ({cn.total}) exceeds invoice balance due ({invoice.balance_due})"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Get Accounts Receivable
    try:
        ar_account = Account.objects.get(code="120000")
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Accounts Receivable account (120000) not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )

    with transaction.atomic():
        # Create reversal journal entry (opposite of invoice posting):
        # DR Revenue / CR Accounts Receivable
        entry = JournalEntry.objects.create(
            entry_number=_next_entry_number(),
            date=cn.date,
            description=f"Credit Note {cn.credit_note_number} — {cn.customer.name}",
            reference=f"CN:{cn.credit_note_number}",
            source="credit_note",
            source_id=str(cn.id),
            is_posted=True,
            created_by=created_by,
        )

        # CR: Accounts Receivable (reduce the receivable)
        JournalEntryLine.objects.create(
            journal_entry=entry,
            account=ar_account,
            debit=Decimal("0"),
            credit=cn.total,
            description=f"Credit Note {cn.credit_note_number} — {cn.customer.name}",
        )

        # DR: Revenue account(s) — if the original invoice has a JE, mirror its CR lines
        # Otherwise use a generic approach based on the credit note subtotal
        if invoice.journal_entry_id:
            # Get the revenue CR lines from the original invoice JE (exclude AR debit)
            original_cr_lines = JournalEntryLine.objects.filter(
                journal_entry_id=invoice.journal_entry_id,
                credit__gt=0,
            ).select_related("account")

            # Calculate the ratio: cn.total / invoice.total
            if invoice.total > 0:
                ratio = cn.total / invoice.total
            else:
                ratio = Decimal("1")

            remainder = cn.total
            cr_lines_list = list(original_cr_lines)
            for i, orig_line in enumerate(cr_lines_list):
                if i == len(cr_lines_list) - 1:
                    # Last line gets the remainder to avoid rounding issues
                    amount = remainder
                else:
                    amount = (orig_line.credit * ratio).quantize(Decimal("0.01"))
                    remainder -= amount

                if amount > 0:
                    JournalEntryLine.objects.create(
                        journal_entry=entry,
                        account=orig_line.account,
                        debit=amount,
                        credit=Decimal("0"),
                        description=f"Credit Note {cn.credit_note_number} — Reversal",
                    )
        else:
            # No original JE — debit a generic revenue line for the full amount
            # Try to find revenue from invoice lines
            inv_lines = invoice.lines.select_related("account").all()
            if inv_lines:
                if invoice.total > 0:
                    ratio = cn.total / invoice.total
                else:
                    ratio = Decimal("1")

                # Group by account
                acct_totals = defaultdict(Decimal)
                for line in inv_lines:
                    acct_totals[line.account_id] += line.amount

                remainder = cn.subtotal
                acct_items = list(acct_totals.items())
                for i, (account_id, amount) in enumerate(acct_items):
                    if i == len(acct_items) - 1:
                        dr_amount = remainder
                    else:
                        dr_amount = (amount * ratio).quantize(Decimal("0.01"))
                        remainder -= dr_amount

                    if dr_amount > 0:
                        JournalEntryLine.objects.create(
                            journal_entry=entry,
                            account_id=account_id,
                            debit=dr_amount,
                            credit=Decimal("0"),
                            description=f"Credit Note {cn.credit_note_number} — Reversal",
                        )

                # Tax reversal
                if cn.tax_amount > 0:
                    tax_acct_totals = defaultdict(Decimal)
                    for line in inv_lines:
                        if line.tax_code_id and line.tax_code:
                            line_tax = line.amount * line.tax_code.rate / Decimal("100")
                            tax_acct_totals[line.tax_code.account_id] += line_tax

                    for tax_acct_id, tax_total in tax_acct_totals.items():
                        tax_reversal = (tax_total * ratio).quantize(Decimal("0.01"))
                        if tax_reversal > 0:
                            JournalEntryLine.objects.create(
                                journal_entry=entry,
                                account_id=tax_acct_id,
                                debit=tax_reversal,
                                credit=Decimal("0"),
                                description=f"Credit Note {cn.credit_note_number} — Tax Reversal",
                            )
            else:
                # Absolute fallback: debit AR again (balanced but generic)
                JournalEntryLine.objects.create(
                    journal_entry=entry,
                    account=ar_account,
                    debit=cn.total,
                    credit=Decimal("0"),
                    description=f"Credit Note {cn.credit_note_number} — Reversal (no lines found)",
                )

        # Update invoice paid_amount
        invoice.paid_amount += cn.total
        if invoice.paid_amount >= invoice.total:
            invoice.status = "paid"
        invoice.save()

        # Mark credit note as applied and link to invoice and journal entry
        cn.status = "applied"
        cn.invoice = invoice
        cn.journal_entry = entry
        cn.save()

    cn.refresh_from_db()
    invoice.refresh_from_db()
    return Response({
        "success": True,
        "message": "Credit note applied",
        "credit_note": _credit_note_dict(cn),
        "invoice": _invoice_dict(invoice, include_lines=False),
    })


# ─── Customer Import / Export ────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def customers_import_preview(request):
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

    existing_codes = {c.code: c for c in Customer.objects.all()}
    existing_names = {c.name.lower(): c for c in Customer.objects.all()}
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
        credit_limit = (row.get("credit_limit") or "").strip()
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

        if credit_limit:
            try:
                Decimal(credit_limit)
            except InvalidOperation:
                errors.append("credit_limit must be a number")

        if currency and len(currency) != 3:
            errors.append("currency must be 3 characters")

        # Determine status
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
                "credit_limit": credit_limit or "0",
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
def customers_import_confirm(request):
    """Create or update customers from previewed data."""
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
                    customer = Customer.objects.get(id=r["existing_id"])
                    customer.name = name
                    if data.get("email"):
                        customer.email = data["email"]
                    if data.get("phone"):
                        customer.phone = data["phone"]
                    if data.get("address"):
                        customer.address = data["address"]
                    if data.get("tax_id"):
                        customer.tax_id = data["tax_id"]
                    if data.get("currency"):
                        customer.currency = data["currency"]
                    if data.get("payment_terms"):
                        customer.payment_terms = int(data["payment_terms"])
                    if data.get("credit_limit"):
                        customer.credit_limit = Decimal(data["credit_limit"])
                    if data.get("notes"):
                        customer.notes = data["notes"]
                    customer.save()
                    updated += 1
                except Customer.DoesNotExist:
                    errors.append(f"Row {r.get('row_number')}: customer not found")
            elif r.get("status") == "new":
                code = data.get("code") or _next_customer_code()
                Customer.objects.create(
                    code=code,
                    name=name,
                    email=data.get("email", ""),
                    phone=data.get("phone", ""),
                    address=data.get("address", ""),
                    tax_id=data.get("tax_id", ""),
                    currency=data.get("currency", "MAD"),
                    payment_terms=int(data.get("payment_terms", 30)),
                    credit_limit=Decimal(data.get("credit_limit", "0")),
                    notes=data.get("notes", ""),
                )
                created += 1

    return Response({
        "success": True,
        "created": created,
        "updated": updated,
        "errors": errors,
    })


# ─── Invoice Export (server-side CSV) ────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoices_export(request):
    """Export all invoices (with lines) as a flat CSV."""
    qs = Invoice.objects.select_related("customer").prefetch_related(
        "lines__account", "lines__tax_code"
    ).all()

    # Apply same filters as list view
    if request.query_params.get("status"):
        qs = qs.filter(status=request.query_params["status"])
    if request.query_params.get("customer_id"):
        qs = qs.filter(customer_id=request.query_params["customer_id"])
    if request.query_params.get("date_from"):
        qs = qs.filter(date__gte=request.query_params["date_from"])
    if request.query_params.get("date_to"):
        qs = qs.filter(date__lte=request.query_params["date_to"])
    if request.query_params.get("vat_quarter"):
        qs = qs.filter(vat_quarter=request.query_params["vat_quarter"])
    if request.query_params.get("vat_year"):
        qs = qs.filter(vat_year=request.query_params["vat_year"])

    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="invoices.csv"'
    response.write("\ufeff")  # BOM for Excel

    writer = csv.writer(response)
    writer.writerow([
        "invoice_number", "customer_code", "customer_name", "date", "due_date",
        "status", "currency", "vat_quarter", "vat_year",
        "line_description", "line_quantity", "line_unit_price",
        "line_account_code", "line_tax_code", "line_amount",
        "subtotal", "tax_amount", "total",
    ])

    for inv in qs:
        lines = inv.lines.select_related("account", "tax_code").all()
        vq = f"Q{inv.vat_quarter}"
        vy = str(inv.vat_year)
        if lines:
            for line in lines:
                writer.writerow([
                    inv.invoice_number, inv.customer.code, inv.customer.name,
                    inv.date.isoformat(), inv.due_date.isoformat(),
                    inv.status, inv.currency, vq, vy,
                    line.description, str(line.quantity), str(line.unit_price),
                    line.account.code if line.account else "",
                    line.tax_code.code if line.tax_code else "",
                    str(line.amount),
                    str(inv.subtotal), str(inv.tax_amount), str(inv.total),
                ])
        else:
            writer.writerow([
                inv.invoice_number, inv.customer.code, inv.customer.name,
                inv.date.isoformat(), inv.due_date.isoformat(),
                inv.status, inv.currency, vq, vy,
                "", "", "", "", "", "",
                str(inv.subtotal), str(inv.tax_amount), str(inv.total),
            ])

    return response
