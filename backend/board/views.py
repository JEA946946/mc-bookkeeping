"""Read-only board endpoint for the external AI-board app.

Protected by a bearer token (Authorization: Bearer <token>) read from the
BOARD_API_TOKEN environment variable, so the token can be rotated without any
code change (set the env var + restart). Returns 401 on missing/wrong token.

Read-only; exposes only the aggregate finance figures the board app expects.
"""

import datetime as dt
import os
from decimal import Decimal

from django.db.models import Q, Sum
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from journals.models import JournalEntryLine

# Account code prefixes (Moroccan chart of accounts in this system)
CASH_BANK_PREFIXES = ["10"]            # 100000-101004 cash + banks
MARKETING_PREFIXES = ["592301"]        # ONMT — tourism board / marketing
# Fixed/operating overhead: operating expenses (59xxxx) + salaries (5722xx),
# excluding marketing (reported separately) and cost-of-sales supplier accounts.
FIXED_PREFIXES = ["59", "5722"]
FIXED_EXCLUDE = ["592301"]


def _authorized(request):
    token = os.environ.get("BOARD_API_TOKEN", "")
    if not token:
        return False
    header = request.META.get("HTTP_AUTHORIZATION", "")
    if not header.startswith("Bearer "):
        return False
    return header[7:].strip() == token


def _code_cond(prefixes):
    cond = Q()
    for p in prefixes:
        cond |= Q(account__code__startswith=p)
    return cond


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def board_finance(request):
    if not _authorized(request):
        return Response({"detail": "Invalid or missing token"}, status=401)

    periode = request.query_params.get("periode") or ""
    try:
        year, month = (int(x) for x in periode.split("-")[:2])
        month_start = dt.date(year, month, 1)
        month_end = (
            dt.date(year, 12, 31) if month == 12
            else dt.date(year, month + 1, 1) - dt.timedelta(days=1)
        )
    except (ValueError, TypeError):
        today = dt.date.today()
        month_start = today.replace(day=1)
        month_end = today

    def movement(prefixes, exclude=()):
        """Net debit-credit for matching accounts within the month."""
        qs = JournalEntryLine.objects.filter(
            journal_entry__is_posted=True,
            journal_entry__date__gte=month_start,
            journal_entry__date__lte=month_end,
        ).filter(_code_cond(prefixes))
        for ex in exclude:
            qs = qs.exclude(account__code__startswith=ex)
        agg = qs.aggregate(d=Sum("debit"), c=Sum("credit"))
        return (agg["d"] or Decimal("0")) - (agg["c"] or Decimal("0"))

    def balance(prefixes):
        """Cumulative debit-credit balance up to month end."""
        qs = JournalEntryLine.objects.filter(
            journal_entry__is_posted=True,
            journal_entry__date__lte=month_end,
        ).filter(_code_cond(prefixes))
        agg = qs.aggregate(d=Sum("debit"), c=Sum("credit"))
        return (agg["d"] or Decimal("0")) - (agg["c"] or Decimal("0"))

    return Response({
        "faste_udgifter_pr_md": round(float(movement(FIXED_PREFIXES, FIXED_EXCLUDE)), 2),
        "markedsfoering_pr_md": round(float(movement(MARKETING_PREFIXES)), 2),
        "likviditet": round(float(balance(CASH_BANK_PREFIXES)), 2),
    })
