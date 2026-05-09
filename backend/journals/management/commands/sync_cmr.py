"""Sync invoices and supplier payments from CMR into journal entries.

Usage:
    python manage.py sync_cmr                          # last 24h
    python manage.py sync_cmr --since=2020-01-01       # from specific date
    python manage.py sync_cmr --dry-run                # preview only
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import Account, SupplierAccountMapping
from journals.models import JournalEntry, JournalEntryLine
from journals.cmr_client import CMRClient


# Bank name → account code
BANK_MAP = {
    "CIH300": "101001",
    "CIH600": "101002",
    "CIH600-DH": "101002",
    "BP09": "101004",
}

# Supplier category → parent account code (fallback when no mapping exists)
CATEGORY_ACCOUNT_MAP = {
    "accommodation": "523300",
    "hotel": "523300",
    "restaurant": "533100",
    "transport": "553800",
    "transportation": "553800",
    "guide": "533600",
    "entry": "514000",
    "entries": "514000",
    "package": "510000",
}

# Ultimate fallback account
FALLBACK_ACCOUNT_CODE = "510000"  # Cost of Sales

# Well-known accounts
ACCOUNTS_RECEIVABLE_CODE = "120000"
CLIENT_FUNDS_CODE = "240000"


def _next_entry_number():
    """Generate next sequential entry number like JE-0001."""
    last = JournalEntry.objects.order_by("-entry_number").first()
    if not last:
        return "JE-0001"
    try:
        num = int(last.entry_number.split("-")[1])
        return f"JE-{num + 1:04d}"
    except (IndexError, ValueError):
        return f"JE-{JournalEntry.objects.count() + 1:04d}"


class Command(BaseCommand):
    help = "Sync invoices and supplier payments from CMR into journal entries"

    def add_arguments(self, parser):
        parser.add_argument(
            "--since",
            help="ISO datetime to sync from (default: 24 hours ago)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Preview what would be created without writing to the database",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        since_str = options.get("since")

        if since_str:
            since = since_str
        else:
            since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

        self.stdout.write(f"Syncing CMR events since {since}")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no entries will be created"))

        # Fetch invoices and payments from CMR
        client = CMRClient()
        try:
            invoices = client.get_invoices(since=since)
            payments = client.get_supplier_payments(since=since)
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Failed to fetch CMR events: {e}"))
            return

        self.stdout.write(f"  Fetched {len(invoices)} invoice(s), {len(payments)} supplier payment(s)")

        # Pre-load account cache
        account_cache = {}
        for acct in Account.objects.filter(is_active=True):
            account_cache[acct.code] = acct

        # Pre-load supplier mappings
        mapping_cache = {}
        for m in SupplierAccountMapping.objects.select_related("account"):
            mapping_cache[m.cmr_supplier_id] = m.account

        created_invoices = 0
        created_payments_je = 0
        skipped = 0

        # ── Process invoices ─────────────────────────────────────────────────
        self.stdout.write("\n--- Processing invoices ---")
        for inv in invoices:
            inv_id = inv.get("id", "")
            source_id = inv_id

            # Skip if JE already exists
            if JournalEntry.objects.filter(source="cmr_invoice", source_id=source_id).exists():
                self.stdout.write(f"  SKIP invoice {inv.get('invoice_number')} — JE exists")
                skipped += 1
                continue

            total = Decimal(str(inv.get("total", "0")))
            if total <= 0:
                self.stdout.write(f"  SKIP invoice {inv.get('invoice_number')} — zero total")
                skipped += 1
                continue

            inv_date = inv.get("invoice_date") or inv.get("updated_at", "")[:10]
            description = (
                f"CMR Invoice {inv.get('invoice_number', '')} — "
                f"{inv.get('customer_name', '')} — {inv.get('opportunity_title', '')}"
            )

            # Resolve Accounts Receivable and Client Funds
            ar_acct = account_cache.get(ACCOUNTS_RECEIVABLE_CODE)
            cf_acct = account_cache.get(CLIENT_FUNDS_CODE)
            if not ar_acct or not cf_acct:
                self.stdout.write(self.style.ERROR(
                    f"  Missing account {ACCOUNTS_RECEIVABLE_CODE} or {CLIENT_FUNDS_CODE}"
                ))
                continue

            # Build category-split CR lines from line_items
            line_items = inv.get("line_items") or []
            category_totals = {}
            for li in line_items:
                cat = (li.get("category") or "").strip()
                amt = Decimal(str(li.get("amount", 0)))
                if amt > 0 and cat:
                    category_totals[cat] = category_totals.get(cat, Decimal("0")) + amt

            inv_num = inv.get("invoice_number", "")
            if category_totals:
                self.stdout.write(
                    f"  Invoice {inv_num}: DR {ACCOUNTS_RECEIVABLE_CODE} = {total}"
                )
                cr_sum = Decimal("0")
                cat_items = list(category_totals.items())
                for i, (cat, cat_amt) in enumerate(cat_items):
                    if i == len(cat_items) - 1:
                        cat_amt = total - cr_sum
                    cr_sum += cat_amt
                    self.stdout.write(
                        f"    CR {CLIENT_FUNDS_CODE} — {cat} = {cat_amt}"
                    )
            else:
                self.stdout.write(
                    f"  Invoice {inv_num}: "
                    f"DR {ACCOUNTS_RECEIVABLE_CODE} / CR {CLIENT_FUNDS_CODE} = {total}"
                )

            if not dry_run:
                with transaction.atomic():
                    entry = JournalEntry.objects.create(
                        entry_number=_next_entry_number(),
                        date=inv_date,
                        description=description,
                        reference=f"CMR:{inv_num}",
                        source="cmr_invoice",
                        source_id=source_id,
                        is_posted=True,
                        created_by="sync_cmr",
                    )
                    JournalEntryLine.objects.create(
                        journal_entry=entry,
                        account=ar_acct,
                        debit=total,
                        credit=Decimal("0"),
                        description=description,
                    )
                    if category_totals:
                        cr_sum = Decimal("0")
                        cat_items = list(category_totals.items())
                        for i, (cat, cat_amt) in enumerate(cat_items):
                            if i == len(cat_items) - 1:
                                cat_amt = total - cr_sum
                            cr_sum += cat_amt
                            cr_desc = f"CMR Invoice {inv_num} — {cat}"
                            JournalEntryLine.objects.create(
                                journal_entry=entry,
                                account=cf_acct,
                                debit=Decimal("0"),
                                credit=cat_amt,
                                description=cr_desc,
                            )
                    else:
                        JournalEntryLine.objects.create(
                            journal_entry=entry,
                            account=cf_acct,
                            debit=Decimal("0"),
                            credit=total,
                            description=description,
                        )
            created_invoices += 1

            # If invoice is paid, also create payment JE
            if inv.get("status") == "paid" and inv.get("payment_date"):
                payment_source_id = f"{inv_id}:payment"
                if JournalEntry.objects.filter(source="cmr_invoice", source_id=payment_source_id).exists():
                    self.stdout.write(f"  SKIP payment for {inv.get('invoice_number')} — JE exists")
                    continue

                bank_name = inv.get("bank_account", "")
                bank_code = BANK_MAP.get(bank_name)
                bank_acct = account_cache.get(bank_code) if bank_code else None
                if not bank_acct:
                    # Fallback to first available bank
                    bank_acct = account_cache.get("101001")

                if not bank_acct:
                    self.stdout.write(self.style.WARNING(
                        f"  WARN: No bank account for {bank_name}, skipping payment JE"
                    ))
                    continue

                pay_desc = (
                    f"Payment received — Invoice {inv.get('invoice_number', '')} — "
                    f"{inv.get('customer_name', '')}"
                )

                self.stdout.write(
                    f"  Payment {inv.get('invoice_number')}: "
                    f"DR {bank_acct.code} / CR {ACCOUNTS_RECEIVABLE_CODE} = {total}"
                )

                if not dry_run:
                    with transaction.atomic():
                        entry = JournalEntry.objects.create(
                            entry_number=_next_entry_number(),
                            date=inv.get("payment_date"),
                            description=pay_desc,
                            reference=f"CMR:{inv.get('invoice_number', '')}:payment",
                            source="cmr_invoice",
                            source_id=payment_source_id,
                            is_posted=True,
                            created_by="sync_cmr",
                        )
                        JournalEntryLine.objects.create(
                            journal_entry=entry,
                            account=bank_acct,
                            debit=total,
                            credit=Decimal("0"),
                            description=pay_desc,
                        )
                        JournalEntryLine.objects.create(
                            journal_entry=entry,
                            account=ar_acct,
                            debit=Decimal("0"),
                            credit=total,
                            description=pay_desc,
                        )

        # ── Process supplier payments ────────────────────────────────────────
        self.stdout.write("\n--- Processing supplier payments ---")
        for pmt in payments:
            opp_id = pmt.get("opportunity_id", "")
            category = pmt.get("category", "")
            index = pmt.get("index", 0)
            source_id = f"{opp_id}:{category}:{index}"

            if JournalEntry.objects.filter(source="cmr_payment", source_id=source_id).exists():
                self.stdout.write(f"  SKIP payment {source_id} — JE exists")
                skipped += 1
                continue

            amount_raw = pmt.get("amount")
            if not amount_raw:
                self.stdout.write(f"  SKIP payment {source_id} — no amount")
                skipped += 1
                continue

            try:
                amount = Decimal(str(amount_raw))
            except Exception:
                self.stdout.write(f"  SKIP payment {source_id} — invalid amount '{amount_raw}'")
                skipped += 1
                continue

            if amount <= 0:
                skipped += 1
                continue

            pmt_date = pmt.get("payment_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            supplier_name = pmt.get("supplier_name", "Unknown")

            description = (
                f"Supplier payment — {supplier_name} — "
                f"{pmt.get('notes', '')} — Opp: {pmt.get('opportunity_title', '')}"
            ).strip(" —")

            # Resolve expense account:
            # 1) Check SupplierAccountMapping (not used here since payments don't carry supplier UUID)
            # 2) Fallback to category-based parent account
            # 3) Ultimate fallback to 510000 Cost of Sales
            cat_lower = category.lower().strip()
            parent_code = CATEGORY_ACCOUNT_MAP.get(cat_lower, FALLBACK_ACCOUNT_CODE)
            expense_acct = account_cache.get(parent_code)
            if not expense_acct:
                expense_acct = account_cache.get(FALLBACK_ACCOUNT_CODE)
            if not expense_acct:
                self.stdout.write(self.style.ERROR(
                    f"  Missing fallback account {FALLBACK_ACCOUNT_CODE}"
                ))
                continue

            # Resolve bank account
            bank_name = pmt.get("bank_account", "")
            bank_code = BANK_MAP.get(bank_name)
            bank_acct = account_cache.get(bank_code) if bank_code else None
            if not bank_acct:
                bank_acct = account_cache.get("101001")
            if not bank_acct:
                self.stdout.write(self.style.WARNING(
                    f"  WARN: No bank account for '{bank_name}', skipping"
                ))
                continue

            self.stdout.write(
                f"  Payment {supplier_name} ({category}): "
                f"DR {expense_acct.code} / CR {bank_acct.code} = {amount}"
            )

            if not dry_run:
                with transaction.atomic():
                    entry = JournalEntry.objects.create(
                        entry_number=_next_entry_number(),
                        date=pmt_date,
                        description=description,
                        reference=f"CMR:{opp_id}:{category}:{index}",
                        source="cmr_payment",
                        source_id=source_id,
                        is_posted=True,
                        created_by="sync_cmr",
                    )
                    JournalEntryLine.objects.create(
                        journal_entry=entry,
                        account=expense_acct,
                        debit=amount,
                        credit=Decimal("0"),
                        description=description,
                    )
                    JournalEntryLine.objects.create(
                        journal_entry=entry,
                        account=bank_acct,
                        debit=Decimal("0"),
                        credit=amount,
                        description=description,
                    )
            created_payments_je += 1

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write(f"\n--- Summary ---")
        self.stdout.write(f"  Invoice JEs created: {created_invoices}")
        self.stdout.write(f"  Payment JEs created: {created_payments_je}")
        self.stdout.write(f"  Skipped (duplicates/invalid): {skipped}")

        if dry_run:
            self.stdout.write(self.style.SUCCESS("\nDRY RUN complete — no entries were created"))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"\nSync complete — {created_invoices + created_payments_je} entries created"
            ))
