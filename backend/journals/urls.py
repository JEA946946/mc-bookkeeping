from django.urls import path

from . import views

urlpatterns = [
    # Journal entries export — must be before <uuid:pk>
    path("journal-entries/export", views.journal_entries_export),
    # Journal Entries CRUD
    path("journal-entries", views.journal_entries_list_create),
    path("journal-entries/<uuid:pk>", views.journal_entries_detail),
    path("journal-entries/<uuid:pk>/post", views.journal_entry_post),
    path("journal-entries/<uuid:pk>/unpost", views.journal_entry_unpost),
    # Bank Statements
    path("bank-statements/upload", views.bank_statement_upload),
    path("bank-statements/auto-map", views.bank_statement_auto_map),
    path("bank-statements/confirm", views.bank_statement_confirm),
    path("bank-statements/history", views.bank_statement_history),
    # Bank Transactions
    path("bank-transactions/export", views.bank_transactions_export),
    path("bank-transactions", views.bank_transactions_list),
    # Reports
    path("reports/trial-balance", views.report_trial_balance),
    path("reports/profit-and-loss", views.report_profit_and_loss),
    path("reports/balance-sheet", views.report_balance_sheet),
    # Margin Recognition & TVA
    path("margin-recognition/preview", views.margin_recognition_preview),
    path("margin-recognition/create", views.margin_recognition_create),
    # CMR Sync
    path("cmr/sync", views.cmr_sync),
    path("cmr/sync-contacts", views.cmr_sync_contacts),
    path("cmr/clients", views.cmr_clients_list),
    path("cmr/suppliers", views.cmr_suppliers_list),
    # CMR Invoice Import
    path("cmr/invoices", views.cmr_invoices_list),
    path("cmr/invoices/import", views.cmr_invoice_import),
    # Google Places proxy
    path("places/autocomplete", views.places_autocomplete),
    path("places/details", views.places_details),
]
