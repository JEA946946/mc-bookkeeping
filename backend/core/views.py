"""Core views: TaxCodes, Payments, BankRules, BankReconciliation, Projects,
Documents, Reports, AuditLog, CompanySettings, UserRoles."""

import re
from datetime import datetime
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Sum, Q, F
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import Account, AccountType
from journals.models import JournalEntry, JournalEntryLine
from sales.models import Customer, Invoice
from purchases.models import Supplier, Bill
from .models import (
    TaxCode, Payment, PaymentAllocation, BankRule, BankReconciliation,
    BankReconciliationLine, Project, ProjectTransaction, Document,
    AuditLog, CompanySettings, UserRole,
)


# =============================================================================
# Helpers
# =============================================================================

def _next_number(prefix, model, field):
    """Generate next sequential number like PAY-0001 for the given model/field."""
    last = model.objects.order_by(f"-{field}").first()
    if not last:
        return f"{prefix}-0001"
    last_val = getattr(last, field, "")
    try:
        num = int(last_val.split("-")[1])
        return f"{prefix}-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"{prefix}-{model.objects.count() + 1:04d}"


def log_action(user, action, model_name, record_id, changes=None, ip=None):
    """Create an audit log entry."""
    AuditLog.objects.create(
        user=user if user and user.is_authenticated else None,
        action=action,
        model_name=model_name,
        record_id=str(record_id),
        changes=changes or {},
        ip_address=ip,
    )


def _get_client_ip(request):
    """Extract client IP from request."""
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# ── Serialisation helpers ────────────────────────────────────────────────────

def _tax_code_dict(tc):
    return {
        "id": str(tc.id),
        "code": tc.code,
        "name": tc.name,
        "rate": str(tc.rate),
        "type": tc.type,
        "account_id": str(tc.account_id),
        "account_code": tc.account.code if tc.account else None,
        "account_name": tc.account.name if tc.account else None,
        "is_active": tc.is_active,
    }


def _allocation_dict(alloc):
    return {
        "id": str(alloc.id),
        "payment_id": str(alloc.payment_id),
        "content_type": alloc.content_type,
        "object_id": str(alloc.object_id),
        "amount": str(alloc.amount),
    }


def _payment_dict(payment, include_allocations=True):
    d = {
        "id": str(payment.id),
        "payment_number": payment.payment_number,
        "type": payment.type,
        "date": payment.date.isoformat() if payment.date else None,
        "amount": str(payment.amount),
        "currency": payment.currency,
        "method": payment.method,
        "reference": payment.reference,
        "bank_account_id": str(payment.bank_account_id) if payment.bank_account_id else None,
        "bank_account_code": payment.bank_account.code if payment.bank_account else None,
        "customer_id": str(payment.customer_id) if payment.customer_id else None,
        "customer_name": payment.customer.name if payment.customer else None,
        "supplier_id": str(payment.supplier_id) if payment.supplier_id else None,
        "supplier_name": payment.supplier.name if payment.supplier else None,
        "journal_entry_id": str(payment.journal_entry_id) if payment.journal_entry_id else None,
        "notes": payment.notes,
        "created_by": payment.created_by,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
    }
    if include_allocations:
        d["allocations"] = [
            _allocation_dict(a)
            for a in payment.allocations.all()
        ]
    return d


def _bank_rule_dict(rule):
    return {
        "id": str(rule.id),
        "pattern": rule.pattern,
        "match_type": rule.match_type,
        "match_field": rule.match_field,
        "account_id": str(rule.account_id),
        "account_code": rule.account.code if rule.account else None,
        "account_name": rule.account.name if rule.account else None,
        "description_template": rule.description_template,
        "priority": rule.priority,
        "is_active": rule.is_active,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
    }


def _recon_line_dict(line):
    jl = line.journal_line
    return {
        "id": str(line.id),
        "journal_line_id": str(jl.id),
        "account_id": str(jl.account_id),
        "account_code": jl.account.code,
        "account_name": jl.account.name,
        "debit": str(jl.debit),
        "credit": str(jl.credit),
        "description": jl.description,
        "entry_number": jl.journal_entry.entry_number,
        "entry_date": jl.journal_entry.date.isoformat() if jl.journal_entry.date else None,
        "is_matched": line.is_matched,
        "matched_at": line.matched_at.isoformat() if line.matched_at else None,
    }


def _reconciliation_dict(recon, include_lines=True):
    d = {
        "id": str(recon.id),
        "bank_account_id": str(recon.bank_account_id),
        "bank_account_code": recon.bank_account.code if recon.bank_account else None,
        "bank_account_name": recon.bank_account.name if recon.bank_account else None,
        "date": recon.date.isoformat() if recon.date else None,
        "statement_balance": str(recon.statement_balance),
        "status": recon.status,
        "completed_at": recon.completed_at.isoformat() if recon.completed_at else None,
        "completed_by": recon.completed_by,
        "created_at": recon.created_at.isoformat() if recon.created_at else None,
    }
    if include_lines:
        lines = recon.lines.select_related(
            "journal_line__account",
            "journal_line__journal_entry",
        ).all()
        d["lines"] = [_recon_line_dict(l) for l in lines]
        d["matched_count"] = sum(1 for l in lines if l.is_matched)
        d["unmatched_count"] = sum(1 for l in lines if not l.is_matched)
    return d


def _project_dict(project):
    return {
        "id": str(project.id),
        "code": project.code,
        "name": project.name,
        "customer_id": str(project.customer_id) if project.customer_id else None,
        "customer_name": project.customer.name if project.customer else None,
        "status": project.status,
        "start_date": project.start_date.isoformat() if project.start_date else None,
        "end_date": project.end_date.isoformat() if project.end_date else None,
        "budget": str(project.budget),
        "notes": project.notes,
        "created_by": project.created_by,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }


def _project_txn_dict(txn):
    jl = txn.journal_line
    return {
        "id": str(txn.id),
        "project_id": str(txn.project_id),
        "journal_line_id": str(jl.id),
        "account_id": str(jl.account_id),
        "account_code": jl.account.code,
        "account_name": jl.account.name,
        "debit": str(jl.debit),
        "credit": str(jl.credit),
        "description": jl.description,
        "entry_number": jl.journal_entry.entry_number,
        "entry_date": jl.journal_entry.date.isoformat() if jl.journal_entry.date else None,
        "created_at": txn.created_at.isoformat() if txn.created_at else None,
    }


def _document_dict(doc):
    return {
        "id": str(doc.id),
        "file": doc.file.url if doc.file else None,
        "filename": doc.filename,
        "description": doc.description,
        "journal_entry_id": str(doc.journal_entry_id) if doc.journal_entry_id else None,
        "invoice_id": str(doc.invoice_id) if doc.invoice_id else None,
        "bill_id": str(doc.bill_id) if doc.bill_id else None,
        "expense_id": str(doc.expense_id) if doc.expense_id else None,
        "uploaded_by": doc.uploaded_by,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
    }


def _audit_log_dict(log):
    return {
        "id": str(log.id),
        "user_id": str(log.user_id) if log.user_id else None,
        "username": log.user.username if log.user else None,
        "action": log.action,
        "model_name": log.model_name,
        "record_id": log.record_id,
        "changes": log.changes,
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        "ip_address": log.ip_address,
    }


def _settings_dict(settings_obj):
    return {
        "id": str(settings_obj.id),
        "company_name": settings_obj.company_name,
        "address": settings_obj.address,
        "city": settings_obj.city,
        "country": settings_obj.country,
        "tax_id": settings_obj.tax_id,
        "phone": settings_obj.phone,
        "email": settings_obj.email,
        "currency": settings_obj.currency,
        "fiscal_year_start_month": settings_obj.fiscal_year_start_month,
        "logo": settings_obj.logo.url if settings_obj.logo else None,
    }


def _user_dict(user):
    role_name = None
    try:
        role_name = user.role.role
    except UserRole.DoesNotExist:
        pass
    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "role": role_name,
    }


# =============================================================================
# 1-2  Tax Codes
# =============================================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tax_codes_list_create(request):
    if request.method == "GET":
        qs = TaxCode.objects.select_related("account").all()
        return Response({
            "success": True,
            "data": {"tax_codes": [_tax_code_dict(tc) for tc in qs]},
        })

    # POST
    data = request.data
    for field in ("code", "name", "rate", "account_id"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if TaxCode.objects.filter(code=data["code"]).exists():
        return Response(
            {"success": False, "message": f"Tax code '{data['code']}' already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        account = Account.objects.get(id=data["account_id"])
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Account not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tc = TaxCode.objects.create(
        code=data["code"],
        name=data["name"],
        rate=Decimal(str(data["rate"])),
        type=data.get("type", "both"),
        account=account,
        is_active=data.get("is_active", True),
    )
    log_action(request.user, "create", "TaxCode", tc.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "Tax code created",
        "data": {"tax_code": _tax_code_dict(tc)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def tax_codes_detail(request, pk):
    try:
        tc = TaxCode.objects.select_related("account").get(id=pk)
    except TaxCode.DoesNotExist:
        return Response(
            {"success": False, "message": "Tax code not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"tax_code": _tax_code_dict(tc)},
        })

    if request.method == "PUT":
        data = request.data
        if "code" in data and data["code"] != tc.code:
            if TaxCode.objects.filter(code=data["code"]).exclude(id=pk).exists():
                return Response(
                    {"success": False, "message": "Tax code already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            tc.code = data["code"]
        if "name" in data:
            tc.name = data["name"]
        if "rate" in data:
            tc.rate = Decimal(str(data["rate"]))
        if "type" in data:
            tc.type = data["type"]
        if "account_id" in data:
            try:
                tc.account = Account.objects.get(id=data["account_id"])
            except Account.DoesNotExist:
                return Response(
                    {"success": False, "message": "Account not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        if "is_active" in data:
            tc.is_active = data["is_active"]
        tc.save()
        log_action(request.user, "update", "TaxCode", tc.id, ip=_get_client_ip(request))
        return Response({
            "success": True,
            "message": "Tax code updated",
            "data": {"tax_code": _tax_code_dict(tc)},
        })

    # DELETE
    tc.is_active = False
    tc.save()
    log_action(request.user, "delete", "TaxCode", tc.id, ip=_get_client_ip(request))
    return Response({"success": True, "message": "Tax code deactivated"})


# =============================================================================
# 3-5  Payments
# =============================================================================

def _next_je_number():
    """Generate next sequential journal entry number."""
    last = JournalEntry.objects.order_by("-entry_number").first()
    if not last:
        return "JE-0001"
    try:
        num = int(last.entry_number.split("-")[1])
        return f"JE-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"JE-{JournalEntry.objects.count() + 1:04d}"


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def payments_list_create(request):
    if request.method == "GET":
        qs = Payment.objects.select_related(
            "bank_account", "customer", "supplier", "journal_entry",
        ).prefetch_related("allocations")

        if request.query_params.get("type"):
            qs = qs.filter(type=request.query_params["type"])
        if request.query_params.get("date_from"):
            qs = qs.filter(date__gte=request.query_params["date_from"])
        if request.query_params.get("date_to"):
            qs = qs.filter(date__lte=request.query_params["date_to"])
        if request.query_params.get("customer_id"):
            qs = qs.filter(customer_id=request.query_params["customer_id"])
        if request.query_params.get("supplier_id"):
            qs = qs.filter(supplier_id=request.query_params["supplier_id"])

        return Response({
            "success": True,
            "data": {"payments": [_payment_dict(p) for p in qs]},
        })

    # POST - create payment
    data = request.data
    for field in ("type", "date", "amount"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    payment_type = data["type"]
    if payment_type not in ("incoming", "outgoing"):
        return Response(
            {"success": False, "message": "type must be 'incoming' or 'outgoing'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    amount = Decimal(str(data["amount"]))
    if amount <= 0:
        return Response(
            {"success": False, "message": "amount must be positive"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Resolve bank account
    bank_account = None
    if data.get("bank_account_id"):
        try:
            bank_account = Account.objects.get(id=data["bank_account_id"])
        except Account.DoesNotExist:
            return Response(
                {"success": False, "message": "Bank account not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # Resolve customer / supplier
    customer = None
    supplier = None
    if data.get("customer_id"):
        try:
            customer = Customer.objects.get(id=data["customer_id"])
        except Customer.DoesNotExist:
            return Response(
                {"success": False, "message": "Customer not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )
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

    with transaction.atomic():
        payment_number = _next_number("PAY", Payment, "payment_number")

        # Create journal entry for the payment
        je = None
        if bank_account:
            je_desc = f"Payment {payment_number}"
            je = JournalEntry.objects.create(
                entry_number=_next_je_number(),
                date=data["date"],
                description=je_desc,
                reference=payment_number,
                source="manual",
                is_posted=True,
                created_by=created_by,
            )

            if payment_type == "incoming":
                # DR Bank, CR Accounts Receivable
                ar_account = Account.objects.filter(
                    account_type__name="Asset", code__startswith="12",
                ).first()
                JournalEntryLine.objects.create(
                    journal_entry=je,
                    account=bank_account,
                    debit=amount,
                    credit=Decimal("0"),
                    description=je_desc,
                )
                if ar_account:
                    JournalEntryLine.objects.create(
                        journal_entry=je,
                        account=ar_account,
                        debit=Decimal("0"),
                        credit=amount,
                        description=je_desc,
                    )
            else:
                # DR Accounts Payable, CR Bank
                ap_account = Account.objects.filter(
                    account_type__name="Liability", code__startswith="22",
                ).first()
                if ap_account:
                    JournalEntryLine.objects.create(
                        journal_entry=je,
                        account=ap_account,
                        debit=amount,
                        credit=Decimal("0"),
                        description=je_desc,
                    )
                JournalEntryLine.objects.create(
                    journal_entry=je,
                    account=bank_account,
                    debit=Decimal("0"),
                    credit=amount,
                    description=je_desc,
                )

        payment = Payment.objects.create(
            payment_number=payment_number,
            type=payment_type,
            date=data["date"],
            amount=amount,
            currency=data.get("currency", "MAD"),
            method=data.get("method", "bank_transfer"),
            reference=data.get("reference", ""),
            bank_account=bank_account,
            customer=customer,
            supplier=supplier,
            journal_entry=je,
            notes=data.get("notes", ""),
            created_by=created_by,
        )

        # Process allocations if provided
        allocations_data = data.get("allocations", [])
        for alloc_data in allocations_data:
            content_type = alloc_data.get("content_type")
            object_id = alloc_data.get("object_id")
            alloc_amount = Decimal(str(alloc_data.get("amount", 0)))

            PaymentAllocation.objects.create(
                payment=payment,
                content_type=content_type,
                object_id=object_id,
                amount=alloc_amount,
            )

            # Update paid_amount on the target object
            if content_type == "invoice":
                try:
                    inv = Invoice.objects.get(id=object_id)
                    inv.paid_amount = inv.paid_amount + alloc_amount
                    if inv.paid_amount >= inv.total:
                        inv.status = "paid"
                    inv.save()
                except Invoice.DoesNotExist:
                    pass
            elif content_type == "bill":
                try:
                    bill = Bill.objects.get(id=object_id)
                    bill.paid_amount = bill.paid_amount + alloc_amount
                    if bill.paid_amount >= bill.total:
                        bill.status = "paid"
                    bill.save()
                except Bill.DoesNotExist:
                    pass

    log_action(request.user, "create", "Payment", payment.id, ip=_get_client_ip(request))
    payment = Payment.objects.select_related(
        "bank_account", "customer", "supplier", "journal_entry",
    ).prefetch_related("allocations").get(id=payment.id)

    return Response({
        "success": True,
        "message": "Payment created",
        "data": {"payment": _payment_dict(payment)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def payments_detail(request, pk):
    try:
        payment = Payment.objects.select_related(
            "bank_account", "customer", "supplier", "journal_entry",
        ).prefetch_related("allocations").get(id=pk)
    except Payment.DoesNotExist:
        return Response(
            {"success": False, "message": "Payment not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"payment": _payment_dict(payment)},
        })

    if request.method == "PUT":
        data = request.data
        for field in ("date", "amount", "currency", "method", "reference", "notes"):
            if field in data:
                if field == "amount":
                    payment.amount = Decimal(str(data[field]))
                else:
                    setattr(payment, field, data[field])
        if "bank_account_id" in data:
            if data["bank_account_id"]:
                try:
                    payment.bank_account = Account.objects.get(id=data["bank_account_id"])
                except Account.DoesNotExist:
                    return Response(
                        {"success": False, "message": "Bank account not found"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                payment.bank_account = None
        if "customer_id" in data:
            if data["customer_id"]:
                try:
                    payment.customer = Customer.objects.get(id=data["customer_id"])
                except Customer.DoesNotExist:
                    return Response(
                        {"success": False, "message": "Customer not found"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                payment.customer = None
        if "supplier_id" in data:
            if data["supplier_id"]:
                try:
                    payment.supplier = Supplier.objects.get(id=data["supplier_id"])
                except Supplier.DoesNotExist:
                    return Response(
                        {"success": False, "message": "Supplier not found"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                payment.supplier = None
        payment.save()
        log_action(request.user, "update", "Payment", payment.id, ip=_get_client_ip(request))
        return Response({
            "success": True,
            "message": "Payment updated",
            "data": {"payment": _payment_dict(payment)},
        })

    # DELETE
    payment.delete()
    log_action(request.user, "delete", "Payment", pk, ip=_get_client_ip(request))
    return Response({"success": True, "message": "Payment deleted"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def payment_allocate(request, pk):
    """Allocate a payment to invoices/bills."""
    try:
        payment = Payment.objects.get(id=pk)
    except Payment.DoesNotExist:
        return Response(
            {"success": False, "message": "Payment not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    allocations_data = request.data.get("allocations", [])
    if not allocations_data:
        return Response(
            {"success": False, "message": "allocations list is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate total allocation does not exceed payment amount
    total_alloc = sum(Decimal(str(a.get("amount", 0))) for a in allocations_data)
    existing_alloc = payment.allocations.aggregate(total=Sum("amount"))["total"] or Decimal("0")
    if existing_alloc + total_alloc > payment.amount:
        return Response(
            {"success": False, "message": "Total allocations exceed payment amount"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        for alloc_data in allocations_data:
            content_type = alloc_data.get("content_type")
            object_id = alloc_data.get("object_id")
            alloc_amount = Decimal(str(alloc_data.get("amount", 0)))

            if content_type not in ("invoice", "bill", "credit_note"):
                return Response(
                    {"success": False, "message": f"Invalid content_type: {content_type}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            PaymentAllocation.objects.create(
                payment=payment,
                content_type=content_type,
                object_id=object_id,
                amount=alloc_amount,
            )

            # Update paid_amount on target
            if content_type == "invoice":
                try:
                    inv = Invoice.objects.get(id=object_id)
                    inv.paid_amount = inv.paid_amount + alloc_amount
                    if inv.paid_amount >= inv.total:
                        inv.status = "paid"
                    inv.save()
                except Invoice.DoesNotExist:
                    pass
            elif content_type == "bill":
                try:
                    bill = Bill.objects.get(id=object_id)
                    bill.paid_amount = bill.paid_amount + alloc_amount
                    if bill.paid_amount >= bill.total:
                        bill.status = "paid"
                    bill.save()
                except Bill.DoesNotExist:
                    pass

    payment.refresh_from_db()
    payment = Payment.objects.select_related(
        "bank_account", "customer", "supplier", "journal_entry",
    ).prefetch_related("allocations").get(id=pk)

    return Response({
        "success": True,
        "message": "Payment allocated",
        "data": {"payment": _payment_dict(payment)},
    })


# =============================================================================
# 6-8  Bank Rules
# =============================================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def bank_rules_list_create(request):
    if request.method == "GET":
        qs = BankRule.objects.select_related("account").all()
        return Response({
            "success": True,
            "data": {"bank_rules": [_bank_rule_dict(r) for r in qs]},
        })

    # POST
    data = request.data
    for field in ("pattern", "account_id"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        account = Account.objects.get(id=data["account_id"])
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Account not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    rule = BankRule.objects.create(
        pattern=data["pattern"],
        match_type=data.get("match_type", "contains"),
        match_field=data.get("match_field", "description"),
        account=account,
        description_template=data.get("description_template", ""),
        priority=data.get("priority", 0),
        is_active=data.get("is_active", True),
    )
    log_action(request.user, "create", "BankRule", rule.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "Bank rule created",
        "data": {"bank_rule": _bank_rule_dict(rule)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def bank_rules_detail(request, pk):
    try:
        rule = BankRule.objects.select_related("account").get(id=pk)
    except BankRule.DoesNotExist:
        return Response(
            {"success": False, "message": "Bank rule not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"bank_rule": _bank_rule_dict(rule)},
        })

    if request.method == "PUT":
        data = request.data
        for field in ("pattern", "match_type", "match_field",
                       "description_template", "priority", "is_active"):
            if field in data:
                setattr(rule, field, data[field])
        if "account_id" in data:
            try:
                rule.account = Account.objects.get(id=data["account_id"])
            except Account.DoesNotExist:
                return Response(
                    {"success": False, "message": "Account not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        rule.save()
        log_action(request.user, "update", "BankRule", rule.id, ip=_get_client_ip(request))
        return Response({
            "success": True,
            "message": "Bank rule updated",
            "data": {"bank_rule": _bank_rule_dict(rule)},
        })

    # DELETE
    rule.delete()
    log_action(request.user, "delete", "BankRule", pk, ip=_get_client_ip(request))
    return Response({"success": True, "message": "Bank rule deleted"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bank_rules_test(request):
    """Test a bank rule pattern against a description string."""
    description = request.data.get("description", "")
    pattern = request.data.get("pattern", "")
    match_type = request.data.get("match_type", "contains")

    if not pattern:
        return Response(
            {"success": False, "message": "pattern is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    matched = False
    if match_type == "contains":
        matched = pattern.lower() in description.lower()
    elif match_type == "regex":
        try:
            matched = bool(re.search(pattern, description, re.IGNORECASE))
        except re.error as e:
            return Response(
                {"success": False, "message": f"Invalid regex: {e}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        return Response(
            {"success": False, "message": "match_type must be 'contains' or 'regex'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response({
        "success": True,
        "data": {
            "matched": matched,
            "description": description,
            "pattern": pattern,
            "match_type": match_type,
        },
    })


# =============================================================================
# 9-12  Bank Reconciliation
# =============================================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def bank_reconciliations_list_create(request):
    if request.method == "GET":
        qs = BankReconciliation.objects.select_related("bank_account").all()
        return Response({
            "success": True,
            "data": {
                "reconciliations": [
                    _reconciliation_dict(r, include_lines=False) for r in qs
                ],
            },
        })

    # POST - create reconciliation session
    data = request.data
    for field in ("bank_account_id", "date", "statement_balance"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        bank_account = Account.objects.get(id=data["bank_account_id"])
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Bank account not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        recon = BankReconciliation.objects.create(
            bank_account=bank_account,
            date=data["date"],
            statement_balance=Decimal(str(data["statement_balance"])),
        )

        # Load unmatched posted journal lines for this bank account
        # Exclude lines already matched in other completed reconciliations
        already_matched_line_ids = BankReconciliationLine.objects.filter(
            is_matched=True,
            reconciliation__status="completed",
        ).values_list("journal_line_id", flat=True)

        unmatched_lines = JournalEntryLine.objects.filter(
            account=bank_account,
            journal_entry__is_posted=True,
            journal_entry__date__lte=data["date"],
        ).exclude(
            id__in=already_matched_line_ids,
        ).select_related("journal_entry")

        for jl in unmatched_lines:
            BankReconciliationLine.objects.create(
                reconciliation=recon,
                journal_line=jl,
            )

    recon = BankReconciliation.objects.select_related("bank_account").get(id=recon.id)
    log_action(request.user, "create", "BankReconciliation", recon.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "Reconciliation session created",
        "data": {"reconciliation": _reconciliation_dict(recon)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bank_reconciliations_detail(request, pk):
    try:
        recon = BankReconciliation.objects.select_related("bank_account").get(id=pk)
    except BankReconciliation.DoesNotExist:
        return Response(
            {"success": False, "message": "Reconciliation not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response({
        "success": True,
        "data": {"reconciliation": _reconciliation_dict(recon)},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bank_reconciliation_match(request, pk):
    """Mark reconciliation lines as matched."""
    try:
        recon = BankReconciliation.objects.get(id=pk)
    except BankReconciliation.DoesNotExist:
        return Response(
            {"success": False, "message": "Reconciliation not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if recon.status == "completed":
        return Response(
            {"success": False, "message": "Reconciliation is already completed"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    line_ids = request.data.get("line_ids", [])
    if not line_ids:
        return Response(
            {"success": False, "message": "line_ids is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    now = timezone.now()
    matched_count = BankReconciliationLine.objects.filter(
        reconciliation=recon,
        id__in=line_ids,
    ).update(is_matched=True, matched_at=now)

    return Response({
        "success": True,
        "message": f"{matched_count} lines matched",
        "data": {"matched_count": matched_count},
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bank_reconciliation_complete(request, pk):
    """Mark reconciliation as completed."""
    try:
        recon = BankReconciliation.objects.get(id=pk)
    except BankReconciliation.DoesNotExist:
        return Response(
            {"success": False, "message": "Reconciliation not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if recon.status == "completed":
        return Response(
            {"success": False, "message": "Reconciliation is already completed"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    recon.status = "completed"
    recon.completed_at = timezone.now()
    recon.completed_by = (
        f"{request.user.first_name} {request.user.last_name}".strip()
        or request.user.username
    )
    recon.save()
    log_action(request.user, "update", "BankReconciliation", recon.id, ip=_get_client_ip(request))

    recon = BankReconciliation.objects.select_related("bank_account").get(id=pk)
    return Response({
        "success": True,
        "message": "Reconciliation completed",
        "data": {"reconciliation": _reconciliation_dict(recon)},
    })


# =============================================================================
# 13-17  Projects
# =============================================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def projects_list_create(request):
    if request.method == "GET":
        qs = Project.objects.select_related("customer").all()

        if request.query_params.get("status"):
            qs = qs.filter(status=request.query_params["status"])
        if request.query_params.get("customer_id"):
            qs = qs.filter(customer_id=request.query_params["customer_id"])

        return Response({
            "success": True,
            "data": {"projects": [_project_dict(p) for p in qs]},
        })

    # POST
    data = request.data
    for field in ("code", "name"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if Project.objects.filter(code=data["code"]).exists():
        return Response(
            {"success": False, "message": f"Project code '{data['code']}' already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    customer = None
    if data.get("customer_id"):
        try:
            customer = Customer.objects.get(id=data["customer_id"])
        except Customer.DoesNotExist:
            return Response(
                {"success": False, "message": "Customer not found"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    project = Project.objects.create(
        code=data["code"],
        name=data["name"],
        customer=customer,
        status=data.get("status", "active"),
        start_date=data.get("start_date"),
        end_date=data.get("end_date"),
        budget=Decimal(str(data.get("budget", 0))),
        notes=data.get("notes", ""),
        created_by=(
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        ),
    )
    log_action(request.user, "create", "Project", project.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "Project created",
        "data": {"project": _project_dict(project)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def projects_detail(request, pk):
    try:
        project = Project.objects.select_related("customer").get(id=pk)
    except Project.DoesNotExist:
        return Response(
            {"success": False, "message": "Project not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"project": _project_dict(project)},
        })

    if request.method == "PUT":
        data = request.data
        if "code" in data and data["code"] != project.code:
            if Project.objects.filter(code=data["code"]).exclude(id=pk).exists():
                return Response(
                    {"success": False, "message": "Project code already exists"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            project.code = data["code"]
        for field in ("name", "status", "start_date", "end_date", "notes"):
            if field in data:
                setattr(project, field, data[field])
        if "budget" in data:
            project.budget = Decimal(str(data["budget"]))
        if "customer_id" in data:
            if data["customer_id"]:
                try:
                    project.customer = Customer.objects.get(id=data["customer_id"])
                except Customer.DoesNotExist:
                    return Response(
                        {"success": False, "message": "Customer not found"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                project.customer = None
        project.save()
        log_action(request.user, "update", "Project", project.id, ip=_get_client_ip(request))
        return Response({
            "success": True,
            "message": "Project updated",
            "data": {"project": _project_dict(project)},
        })

    # DELETE
    project.delete()
    log_action(request.user, "delete", "Project", pk, ip=_get_client_ip(request))
    return Response({"success": True, "message": "Project deleted"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def project_transactions(request, pk):
    """List project transactions with journal line details."""
    try:
        project = Project.objects.get(id=pk)
    except Project.DoesNotExist:
        return Response(
            {"success": False, "message": "Project not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    txns = ProjectTransaction.objects.filter(
        project=project,
    ).select_related(
        "journal_line__account",
        "journal_line__journal_entry",
    ).order_by("journal_line__journal_entry__date")

    return Response({
        "success": True,
        "data": {
            "project": _project_dict(project),
            "transactions": [_project_txn_dict(t) for t in txns],
        },
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def project_assign(request, pk):
    """Assign journal lines to a project."""
    try:
        project = Project.objects.get(id=pk)
    except Project.DoesNotExist:
        return Response(
            {"success": False, "message": "Project not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    journal_line_ids = request.data.get("journal_line_ids", [])
    if not journal_line_ids:
        return Response(
            {"success": False, "message": "journal_line_ids is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Validate that journal lines exist
    existing_lines = JournalEntryLine.objects.filter(id__in=journal_line_ids)
    found_ids = set(str(jl.id) for jl in existing_lines)
    missing = [lid for lid in journal_line_ids if str(lid) not in found_ids]
    if missing:
        return Response(
            {"success": False, "message": f"Journal lines not found: {missing}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    created_count = 0
    for jl in existing_lines:
        _, created = ProjectTransaction.objects.get_or_create(
            project=project,
            journal_line=jl,
        )
        if created:
            created_count += 1

    return Response({
        "success": True,
        "message": f"{created_count} journal lines assigned to project",
        "data": {"assigned_count": created_count},
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def project_pnl(request, pk):
    """Calculate project P&L from assigned transactions."""
    try:
        project = Project.objects.select_related("customer").get(id=pk)
    except Project.DoesNotExist:
        return Response(
            {"success": False, "message": "Project not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    txns = ProjectTransaction.objects.filter(
        project=project,
    ).select_related(
        "journal_line__account__account_type",
        "journal_line__journal_entry",
    )

    revenue_rows = []
    expense_rows = []
    revenue_total = Decimal("0")
    expense_total = Decimal("0")

    for txn in txns:
        jl = txn.journal_line
        acct = jl.account
        acct_type_name = acct.account_type.name if acct.account_type else ""

        row = {
            "account_code": acct.code,
            "account_name": acct.name,
            "debit": str(jl.debit),
            "credit": str(jl.credit),
            "entry_number": jl.journal_entry.entry_number,
            "entry_date": jl.journal_entry.date.isoformat() if jl.journal_entry.date else None,
            "description": jl.description,
        }

        if acct_type_name == "Revenue":
            amount = jl.credit - jl.debit
            row["amount"] = str(amount)
            revenue_rows.append(row)
            revenue_total += amount
        elif acct_type_name == "Expense":
            amount = jl.debit - jl.credit
            row["amount"] = str(amount)
            expense_rows.append(row)
            expense_total += amount

    net_income = revenue_total - expense_total

    return Response({
        "success": True,
        "data": {
            "project": _project_dict(project),
            "revenue": {"rows": revenue_rows, "total": str(revenue_total)},
            "expenses": {"rows": expense_rows, "total": str(expense_total)},
            "net_income": str(net_income),
            "budget": str(project.budget),
            "budget_remaining": str(project.budget - expense_total),
        },
    })


# =============================================================================
# 18-20  Documents
# =============================================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def documents_list_create(request):
    if request.method == "GET":
        qs = Document.objects.all()

        if request.query_params.get("journal_entry_id"):
            qs = qs.filter(journal_entry_id=request.query_params["journal_entry_id"])
        if request.query_params.get("invoice_id"):
            qs = qs.filter(invoice_id=request.query_params["invoice_id"])
        if request.query_params.get("bill_id"):
            qs = qs.filter(bill_id=request.query_params["bill_id"])

        return Response({
            "success": True,
            "data": {"documents": [_document_dict(d) for d in qs]},
        })

    # POST - file upload
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return Response(
            {"success": False, "message": "No file uploaded"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    doc = Document.objects.create(
        file=uploaded_file,
        filename=uploaded_file.name,
        description=request.data.get("description", ""),
        journal_entry_id=request.data.get("journal_entry_id") or None,
        invoice_id=request.data.get("invoice_id") or None,
        bill_id=request.data.get("bill_id") or None,
        expense_id=request.data.get("expense_id") or None,
        uploaded_by=(
            f"{request.user.first_name} {request.user.last_name}".strip()
            or request.user.username
        ),
    )
    log_action(request.user, "create", "Document", doc.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "Document uploaded",
        "data": {"document": _document_dict(doc)},
    }, status=status.HTTP_201_CREATED)


@api_view(["GET", "DELETE"])
@permission_classes([IsAuthenticated])
def documents_detail(request, pk):
    try:
        doc = Document.objects.get(id=pk)
    except Document.DoesNotExist:
        return Response(
            {"success": False, "message": "Document not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"document": _document_dict(doc)},
        })

    # DELETE
    doc.delete()
    log_action(request.user, "delete", "Document", pk, ip=_get_client_ip(request))
    return Response({"success": True, "message": "Document deleted"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def document_link(request, pk):
    """Link a document to a journal entry, invoice, bill, or expense."""
    try:
        doc = Document.objects.get(id=pk)
    except Document.DoesNotExist:
        return Response(
            {"success": False, "message": "Document not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    data = request.data
    if "journal_entry_id" in data:
        if data["journal_entry_id"]:
            try:
                JournalEntry.objects.get(id=data["journal_entry_id"])
            except JournalEntry.DoesNotExist:
                return Response(
                    {"success": False, "message": "Journal entry not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        doc.journal_entry_id = data["journal_entry_id"] or None

    if "invoice_id" in data:
        if data["invoice_id"]:
            try:
                Invoice.objects.get(id=data["invoice_id"])
            except Invoice.DoesNotExist:
                return Response(
                    {"success": False, "message": "Invoice not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        doc.invoice_id = data["invoice_id"] or None

    if "bill_id" in data:
        if data["bill_id"]:
            try:
                Bill.objects.get(id=data["bill_id"])
            except Bill.DoesNotExist:
                return Response(
                    {"success": False, "message": "Bill not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        doc.bill_id = data["bill_id"] or None

    if "expense_id" in data:
        from purchases.models import Expense
        if data["expense_id"]:
            try:
                Expense.objects.get(id=data["expense_id"])
            except Expense.DoesNotExist:
                return Response(
                    {"success": False, "message": "Expense not found"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        doc.expense_id = data["expense_id"] or None

    doc.save()
    return Response({
        "success": True,
        "message": "Document linked",
        "data": {"document": _document_dict(doc)},
    })


# =============================================================================
# 21-27  Reports
# =============================================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_tax(request):
    """Tax report for a period: tax collected (sales) vs tax paid (purchases)."""
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    if not date_from or not date_to:
        return Response(
            {"success": False, "message": "date_from and date_to are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tax_codes = TaxCode.objects.select_related("account").filter(is_active=True)

    filters = {
        "journal_entry__is_posted": True,
        "journal_entry__date__gte": date_from,
        "journal_entry__date__lte": date_to,
    }

    collected_rows = []
    paid_rows = []
    total_collected = Decimal("0")
    total_paid = Decimal("0")

    for tc in tax_codes:
        totals = JournalEntryLine.objects.filter(
            account=tc.account, **filters,
        ).aggregate(total_debit=Sum("debit"), total_credit=Sum("credit"))

        dr = totals["total_debit"] or Decimal("0")
        cr = totals["total_credit"] or Decimal("0")

        if dr == 0 and cr == 0:
            continue

        row = {
            "tax_code": tc.code,
            "tax_name": tc.name,
            "rate": str(tc.rate),
            "account_code": tc.account.code,
            "debit": str(dr),
            "credit": str(cr),
        }

        if tc.type in ("sales", "both"):
            # Tax collected on sales = credit side
            amount = cr - dr
            row["amount"] = str(amount)
            collected_rows.append(row)
            total_collected += amount

        if tc.type in ("purchase", "both"):
            # Tax paid on purchases = debit side
            amount = dr - cr
            row_copy = dict(row)
            row_copy["amount"] = str(amount)
            paid_rows.append(row_copy)
            total_paid += amount

    net_tax = total_collected - total_paid

    return Response({
        "success": True,
        "data": {
            "period": {"date_from": date_from, "date_to": date_to},
            "tax_collected": {"rows": collected_rows, "total": str(total_collected)},
            "tax_paid": {"rows": paid_rows, "total": str(total_paid)},
            "net_tax_payable": str(net_tax),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_cash_flow(request):
    """Cash flow statement for a period, grouped by operating/investing/financing."""
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    if not date_from or not date_to:
        return Response(
            {"success": False, "message": "date_from and date_to are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    filters = {
        "journal_entry__is_posted": True,
        "journal_entry__date__gte": date_from,
        "journal_entry__date__lte": date_to,
    }

    # Cash/bank accounts (Asset accounts starting with "10")
    cash_accounts = Account.objects.filter(
        is_active=True, code__startswith="10",
    )
    cash_account_ids = set(str(a.id) for a in cash_accounts)

    # Get all posted journal entries that touch cash accounts in the period
    cash_lines = JournalEntryLine.objects.filter(
        account__in=cash_accounts, **filters,
    ).select_related("journal_entry", "account")

    # For each cash line, find the contra accounts to classify
    operating = []
    investing = []
    financing = []
    operating_total = Decimal("0")
    investing_total = Decimal("0")
    financing_total = Decimal("0")

    # Classify based on account type of the contra entry
    # Revenue/Expense accounts -> Operating
    # Asset accounts (non-cash) -> Investing
    # Liability/Equity accounts -> Financing

    for cl in cash_lines:
        # Net cash effect: debit = inflow, credit = outflow
        net = cl.debit - cl.credit

        # Find contra lines in the same journal entry (non-cash accounts)
        contra_lines = JournalEntryLine.objects.filter(
            journal_entry=cl.journal_entry,
        ).exclude(id=cl.id).select_related("account__account_type")

        # Use the first contra line's account type for classification
        category = "operating"
        contra_desc = ""
        for contra in contra_lines:
            if str(contra.account_id) in cash_account_ids:
                continue
            acct_type = contra.account.account_type.name if contra.account.account_type else ""
            contra_desc = contra.account.name
            if acct_type in ("Revenue", "Expense"):
                category = "operating"
            elif acct_type == "Asset":
                category = "investing"
            elif acct_type in ("Liability", "Equity"):
                category = "financing"
            break

        row = {
            "date": cl.journal_entry.date.isoformat(),
            "entry_number": cl.journal_entry.entry_number,
            "description": cl.journal_entry.description or contra_desc,
            "amount": str(net),
        }

        if category == "operating":
            operating.append(row)
            operating_total += net
        elif category == "investing":
            investing.append(row)
            investing_total += net
        else:
            financing.append(row)
            financing_total += net

    net_change = operating_total + investing_total + financing_total

    return Response({
        "success": True,
        "data": {
            "period": {"date_from": date_from, "date_to": date_to},
            "operating": {"rows": operating, "total": str(operating_total)},
            "investing": {"rows": investing, "total": str(investing_total)},
            "financing": {"rows": financing, "total": str(financing_total)},
            "net_cash_change": str(net_change),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_aging_receivable(request):
    """AR aging report: outstanding invoices grouped by age buckets."""
    today = datetime.now().date()

    invoices = Invoice.objects.filter(
        status__in=("sent", "overdue"),
    ).select_related("customer").order_by("due_date")

    buckets = {
        "current": [],
        "1_30": [],
        "31_60": [],
        "61_90": [],
        "over_90": [],
    }
    bucket_totals = {
        "current": Decimal("0"),
        "1_30": Decimal("0"),
        "31_60": Decimal("0"),
        "61_90": Decimal("0"),
        "over_90": Decimal("0"),
    }

    for inv in invoices:
        balance = inv.total - inv.paid_amount
        if balance <= 0:
            continue

        days_overdue = (today - inv.due_date).days if inv.due_date else 0

        row = {
            "invoice_id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "customer_id": str(inv.customer_id),
            "customer_name": inv.customer.name if inv.customer else None,
            "date": inv.date.isoformat() if inv.date else None,
            "due_date": inv.due_date.isoformat() if inv.due_date else None,
            "total": str(inv.total),
            "paid_amount": str(inv.paid_amount),
            "balance": str(balance),
            "days_overdue": days_overdue,
        }

        if days_overdue <= 0:
            buckets["current"].append(row)
            bucket_totals["current"] += balance
        elif days_overdue <= 30:
            buckets["1_30"].append(row)
            bucket_totals["1_30"] += balance
        elif days_overdue <= 60:
            buckets["31_60"].append(row)
            bucket_totals["31_60"] += balance
        elif days_overdue <= 90:
            buckets["61_90"].append(row)
            bucket_totals["61_90"] += balance
        else:
            buckets["over_90"].append(row)
            bucket_totals["over_90"] += balance

    grand_total = sum(bucket_totals.values())

    return Response({
        "success": True,
        "data": {
            "as_of": today.isoformat(),
            "buckets": {
                "current": {"rows": buckets["current"], "total": str(bucket_totals["current"])},
                "1_30": {"rows": buckets["1_30"], "total": str(bucket_totals["1_30"])},
                "31_60": {"rows": buckets["31_60"], "total": str(bucket_totals["31_60"])},
                "61_90": {"rows": buckets["61_90"], "total": str(bucket_totals["61_90"])},
                "over_90": {"rows": buckets["over_90"], "total": str(bucket_totals["over_90"])},
            },
            "grand_total": str(grand_total),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_aging_payable(request):
    """AP aging report: outstanding bills grouped by age buckets."""
    today = datetime.now().date()

    bills = Bill.objects.filter(
        status__in=("approved", "overdue"),
    ).select_related("supplier").order_by("due_date")

    buckets = {
        "current": [],
        "1_30": [],
        "31_60": [],
        "61_90": [],
        "over_90": [],
    }
    bucket_totals = {
        "current": Decimal("0"),
        "1_30": Decimal("0"),
        "31_60": Decimal("0"),
        "61_90": Decimal("0"),
        "over_90": Decimal("0"),
    }

    for bill in bills:
        balance = bill.total - bill.paid_amount
        if balance <= 0:
            continue

        days_overdue = (today - bill.due_date).days if bill.due_date else 0

        row = {
            "bill_id": str(bill.id),
            "bill_number": bill.bill_number,
            "supplier_id": str(bill.supplier_id),
            "supplier_name": bill.supplier.name if bill.supplier else None,
            "date": bill.date.isoformat() if bill.date else None,
            "due_date": bill.due_date.isoformat() if bill.due_date else None,
            "total": str(bill.total),
            "paid_amount": str(bill.paid_amount),
            "balance": str(balance),
            "days_overdue": days_overdue,
        }

        if days_overdue <= 0:
            buckets["current"].append(row)
            bucket_totals["current"] += balance
        elif days_overdue <= 30:
            buckets["1_30"].append(row)
            bucket_totals["1_30"] += balance
        elif days_overdue <= 60:
            buckets["31_60"].append(row)
            bucket_totals["31_60"] += balance
        elif days_overdue <= 90:
            buckets["61_90"].append(row)
            bucket_totals["61_90"] += balance
        else:
            buckets["over_90"].append(row)
            bucket_totals["over_90"] += balance

    grand_total = sum(bucket_totals.values())

    return Response({
        "success": True,
        "data": {
            "as_of": today.isoformat(),
            "buckets": {
                "current": {"rows": buckets["current"], "total": str(bucket_totals["current"])},
                "1_30": {"rows": buckets["1_30"], "total": str(bucket_totals["1_30"])},
                "31_60": {"rows": buckets["31_60"], "total": str(bucket_totals["31_60"])},
                "61_90": {"rows": buckets["61_90"], "total": str(bucket_totals["61_90"])},
                "over_90": {"rows": buckets["over_90"], "total": str(bucket_totals["over_90"])},
            },
            "grand_total": str(grand_total),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_general_ledger(request):
    """General ledger: all accounts with all posted entries for a period."""
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    if not date_from or not date_to:
        return Response(
            {"success": False, "message": "date_from and date_to are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    filters = {
        "journal_entry__is_posted": True,
        "journal_entry__date__gte": date_from,
        "journal_entry__date__lte": date_to,
    }

    accounts = Account.objects.filter(
        is_active=True,
    ).select_related("account_type").order_by("code")

    ledger = []
    for acct in accounts:
        lines_qs = JournalEntryLine.objects.filter(
            account=acct, **filters,
        ).select_related("journal_entry").order_by(
            "journal_entry__date", "journal_entry__entry_number",
        )

        if not lines_qs.exists():
            continue

        lines = []
        running_balance = Decimal("0")
        for line in lines_qs:
            if acct.account_type.normal_balance == "debit":
                running_balance += line.debit - line.credit
            else:
                running_balance += line.credit - line.debit

            lines.append({
                "id": str(line.id),
                "date": line.journal_entry.date.isoformat(),
                "entry_number": line.journal_entry.entry_number,
                "description": line.description or line.journal_entry.description,
                "debit": str(line.debit),
                "credit": str(line.credit),
                "running_balance": str(running_balance),
            })

        totals = lines_qs.aggregate(
            total_debit=Sum("debit"),
            total_credit=Sum("credit"),
        )

        ledger.append({
            "account_id": str(acct.id),
            "account_code": acct.code,
            "account_name": acct.name,
            "account_type": acct.account_type.name,
            "lines": lines,
            "total_debit": str(totals["total_debit"] or 0),
            "total_credit": str(totals["total_credit"] or 0),
            "closing_balance": str(running_balance),
        })

    return Response({
        "success": True,
        "data": {
            "period": {"date_from": date_from, "date_to": date_to},
            "accounts": ledger,
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_account_specification(request):
    """Single account detail with all posted lines and running balance."""
    account_id = request.query_params.get("account_id")
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")

    if not account_id:
        return Response(
            {"success": False, "message": "account_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        acct = Account.objects.select_related("account_type").get(id=account_id)
    except Account.DoesNotExist:
        return Response(
            {"success": False, "message": "Account not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Opening balance: sum of all posted lines before date_from
    opening_balance = Decimal("0")
    if date_from:
        ob_totals = JournalEntryLine.objects.filter(
            account=acct,
            journal_entry__is_posted=True,
            journal_entry__date__lt=date_from,
        ).aggregate(total_debit=Sum("debit"), total_credit=Sum("credit"))

        ob_dr = ob_totals["total_debit"] or Decimal("0")
        ob_cr = ob_totals["total_credit"] or Decimal("0")
        if acct.account_type.normal_balance == "debit":
            opening_balance = ob_dr - ob_cr
        else:
            opening_balance = ob_cr - ob_dr

    # Lines in period
    filters = {
        "journal_entry__is_posted": True,
    }
    if date_from:
        filters["journal_entry__date__gte"] = date_from
    if date_to:
        filters["journal_entry__date__lte"] = date_to

    lines_qs = JournalEntryLine.objects.filter(
        account=acct, **filters,
    ).select_related("journal_entry").order_by(
        "journal_entry__date", "journal_entry__entry_number",
    )

    running_balance = opening_balance
    lines = []
    for line in lines_qs:
        if acct.account_type.normal_balance == "debit":
            running_balance += line.debit - line.credit
        else:
            running_balance += line.credit - line.debit

        lines.append({
            "id": str(line.id),
            "date": line.journal_entry.date.isoformat(),
            "entry_number": line.journal_entry.entry_number,
            "description": line.description or line.journal_entry.description,
            "reference": line.journal_entry.reference,
            "debit": str(line.debit),
            "credit": str(line.credit),
            "running_balance": str(running_balance),
        })

    period_totals = lines_qs.aggregate(
        total_debit=Sum("debit"),
        total_credit=Sum("credit"),
    )

    return Response({
        "success": True,
        "data": {
            "account": {
                "id": str(acct.id),
                "code": acct.code,
                "name": acct.name,
                "account_type": acct.account_type.name,
                "normal_balance": acct.account_type.normal_balance,
            },
            "period": {"date_from": date_from, "date_to": date_to},
            "opening_balance": str(opening_balance),
            "lines": lines,
            "total_debit": str(period_totals["total_debit"] or 0),
            "total_credit": str(period_totals["total_credit"] or 0),
            "closing_balance": str(running_balance),
        },
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def report_project_pnl(request):
    """P&L for a specific project (query param: project_id)."""
    project_id = request.query_params.get("project_id")
    if not project_id:
        return Response(
            {"success": False, "message": "project_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        project = Project.objects.select_related("customer").get(id=project_id)
    except Project.DoesNotExist:
        return Response(
            {"success": False, "message": "Project not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    txns = ProjectTransaction.objects.filter(
        project=project,
    ).select_related(
        "journal_line__account__account_type",
        "journal_line__journal_entry",
    )

    revenue_rows = []
    expense_rows = []
    revenue_total = Decimal("0")
    expense_total = Decimal("0")

    for txn in txns:
        jl = txn.journal_line
        acct = jl.account
        acct_type_name = acct.account_type.name if acct.account_type else ""

        row = {
            "account_code": acct.code,
            "account_name": acct.name,
            "debit": str(jl.debit),
            "credit": str(jl.credit),
            "entry_number": jl.journal_entry.entry_number,
            "entry_date": jl.journal_entry.date.isoformat() if jl.journal_entry.date else None,
            "description": jl.description,
        }

        if acct_type_name == "Revenue":
            amount = jl.credit - jl.debit
            row["amount"] = str(amount)
            revenue_rows.append(row)
            revenue_total += amount
        elif acct_type_name == "Expense":
            amount = jl.debit - jl.credit
            row["amount"] = str(amount)
            expense_rows.append(row)
            expense_total += amount

    net_income = revenue_total - expense_total

    return Response({
        "success": True,
        "data": {
            "project": _project_dict(project),
            "revenue": {"rows": revenue_rows, "total": str(revenue_total)},
            "expenses": {"rows": expense_rows, "total": str(expense_total)},
            "net_income": str(net_income),
            "budget": str(project.budget),
            "budget_remaining": str(project.budget - expense_total),
        },
    })


# =============================================================================
# 28  Audit Log
# =============================================================================

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def audit_log_list(request):
    """List audit logs with filters and pagination."""
    qs = AuditLog.objects.select_related("user").all()

    if request.query_params.get("user_id"):
        qs = qs.filter(user_id=request.query_params["user_id"])
    if request.query_params.get("action"):
        qs = qs.filter(action=request.query_params["action"])
    if request.query_params.get("model_name"):
        qs = qs.filter(model_name=request.query_params["model_name"])
    if request.query_params.get("date_from"):
        qs = qs.filter(timestamp__date__gte=request.query_params["date_from"])
    if request.query_params.get("date_to"):
        qs = qs.filter(timestamp__date__lte=request.query_params["date_to"])

    total_count = qs.count()

    try:
        page = int(request.query_params.get("page", 1))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = int(request.query_params.get("page_size", 50))
    except (ValueError, TypeError):
        page_size = 50
    page_size = min(page_size, 200)
    offset = (page - 1) * page_size

    logs = qs[offset:offset + page_size]

    return Response({
        "success": True,
        "data": {
            "audit_logs": [_audit_log_dict(log) for log in logs],
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
        },
    })


# =============================================================================
# 29  Company Settings
# =============================================================================

@api_view(["GET", "PUT"])
@permission_classes([IsAuthenticated])
def settings_detail(request):
    """Company settings (singleton - create on first GET if not exists)."""
    settings_obj, _ = CompanySettings.objects.get_or_create(
        defaults={
            "company_name": "",
            "country": "Morocco",
            "currency": "MAD",
            "fiscal_year_start_month": 1,
        },
        **({} if CompanySettings.objects.exists() else {}),
    )
    # get_or_create needs a unique lookup. Since it is a singleton, just get or
    # create the first (and only) row.
    settings_obj = CompanySettings.objects.first()
    if not settings_obj:
        settings_obj = CompanySettings.objects.create(
            company_name="",
            country="Morocco",
            currency="MAD",
            fiscal_year_start_month=1,
        )

    if request.method == "GET":
        return Response({
            "success": True,
            "data": {"settings": _settings_dict(settings_obj)},
        })

    # PUT
    data = request.data
    for field in (
        "company_name", "address", "city", "country", "tax_id",
        "phone", "email", "currency", "fiscal_year_start_month",
    ):
        if field in data:
            setattr(settings_obj, field, data[field])
    settings_obj.save()
    log_action(request.user, "update", "CompanySettings", settings_obj.id, ip=_get_client_ip(request))

    return Response({
        "success": True,
        "message": "Settings updated",
        "data": {"settings": _settings_dict(settings_obj)},
    })


# =============================================================================
# 30-31  Users & Roles
# =============================================================================

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def users_list_create(request):
    if request.method == "GET":
        users = User.objects.all().order_by("username")
        return Response({
            "success": True,
            "data": {"users": [_user_dict(u) for u in users]},
        })

    # POST - create user with role
    data = request.data
    for field in ("username", "password"):
        if not data.get(field):
            return Response(
                {"success": False, "message": f"{field} is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if User.objects.filter(username=data["username"]).exists():
        return Response(
            {"success": False, "message": "Username already exists"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=data["username"],
        password=data["password"],
        email=data.get("email", ""),
        first_name=data.get("first_name", ""),
        last_name=data.get("last_name", ""),
    )

    role_name = data.get("role", "viewer")
    UserRole.objects.create(user=user, role=role_name)

    log_action(request.user, "create", "User", user.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "User created",
        "data": {"user": _user_dict(user)},
    }, status=status.HTTP_201_CREATED)


@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def user_role_update(request, pk):
    """Update a user's role."""
    try:
        user = User.objects.get(id=pk)
    except User.DoesNotExist:
        return Response(
            {"success": False, "message": "User not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    role_name = request.data.get("role")
    if not role_name:
        return Response(
            {"success": False, "message": "role is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid_roles = ("admin", "accountant", "viewer")
    if role_name not in valid_roles:
        return Response(
            {"success": False, "message": f"role must be one of: {', '.join(valid_roles)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_role, created = UserRole.objects.get_or_create(
        user=user,
        defaults={"role": role_name},
    )
    if not created:
        user_role.role = role_name
        user_role.save()

    log_action(request.user, "update", "UserRole", user_role.id, ip=_get_client_ip(request))
    return Response({
        "success": True,
        "message": "User role updated",
        "data": {"user": _user_dict(user)},
    })
