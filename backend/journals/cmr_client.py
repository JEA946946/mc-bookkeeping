"""HTTP client for the CMR integrations API."""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class CMRClient:
    """Thin wrapper around the CMR /api/v1/integrations/ endpoints."""

    def __init__(self, base_url=None, token=None):
        self.base_url = (base_url or settings.CMR_API_BASE).rstrip("/")
        self.token = token or getattr(settings, "CMR_API_TOKEN", "")

    def _headers(self):
        headers = {"Accept": "application/json", "Host": "localhost"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def get_finance_events(self, since):
        """Fetch invoices and supplier payments updated after `since` (ISO string)."""
        url = f"{self.base_url}/integrations/finance-events"
        params = {"since": since}
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_supplier(self, supplier_id):
        """Fetch a single supplier by UUID."""
        url = f"{self.base_url}/integrations/suppliers"
        params = {"ids": supplier_id}
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        suppliers = data.get("data", {}).get("suppliers", [])
        return suppliers[0] if suppliers else None

    def get_suppliers(self, search=None, category=None):
        """Fetch suppliers list, optionally filtered by search term or category."""
        url = f"{self.base_url}/integrations/suppliers"
        params = {}
        if search:
            params["search"] = search
        if category:
            params["category"] = category
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("suppliers", [])

    def get_client(self, client_id):
        """Fetch a single client by UUID."""
        url = f"{self.base_url}/integrations/clients"
        params = {"ids": client_id}
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        clients = data.get("data", {}).get("clients", [])
        return clients[0] if clients else None

    def get_clients(self, search=None):
        """Fetch clients list, optionally filtered by search term."""
        url = f"{self.base_url}/integrations/clients"
        params = {}
        if search:
            params["search"] = search
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("clients", [])

    # ── Invoices ─────────────────────────────────────────────────────────

    def get_invoices(self, since=None, status=None, fetch_all=False):
        """Fetch invoices with line items and customer UUIDs.

        Args:
            since: ISO datetime string — only invoices updated after this time.
            status: filter by invoice status (e.g. "paid", "not issued").
            fetch_all: if True, return all sent_to_finance invoices regardless of date.
        """
        url = f"{self.base_url}/integrations/invoices"
        params = {}
        if fetch_all:
            params["all"] = "true"
        elif since:
            params["since"] = since
        if status:
            params["status"] = status
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("invoices", [])

    def get_invoice(self, invoice_id):
        """Fetch a single invoice by UUID."""
        url = f"{self.base_url}/integrations/invoices"
        params = {"ids": invoice_id}
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        invoices = data.get("data", {}).get("invoices", [])
        return invoices[0] if invoices else None

    # ── Supplier Payments ────────────────────────────────────────────────

    def get_supplier_payments(self, since=None, category=None, fetch_all=False):
        """Fetch supplier payments with resolved supplier UUIDs.

        Args:
            since: ISO datetime string — only payments from opportunities updated after this.
            category: filter by payment category (e.g. "Accommodation").
            fetch_all: if True, return all payments regardless of date.
        """
        url = f"{self.base_url}/integrations/supplier-payments"
        params = {}
        if fetch_all:
            params["all"] = "true"
        elif since:
            params["since"] = since
        if category:
            params["category"] = category
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("payments", [])

    # ── Opportunities ────────────────────────────────────────────────────

    def get_opportunities(self, since=None, stage=None, fetch_all=False):
        """Fetch sales opportunities with financial summaries.

        Args:
            since: ISO datetime string — only opportunities updated after this.
            stage: filter by stage name (e.g. "Confirmed", "Invoiced").
            fetch_all: if True, return all active opportunities regardless of date.
        """
        url = f"{self.base_url}/integrations/opportunities"
        params = {}
        if fetch_all:
            params["all"] = "true"
        elif since:
            params["since"] = since
        if stage:
            params["stage"] = stage
        resp = requests.get(url, params=params, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("opportunities", [])
