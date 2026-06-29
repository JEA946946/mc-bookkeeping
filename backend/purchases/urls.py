from django.urls import path

from . import views

urlpatterns = [
    # Supplier import/export — must be before <uuid:pk>
    path("suppliers/import/preview", views.suppliers_import_preview, name="suppliers-import-preview"),
    path("suppliers/import/confirm", views.suppliers_import_confirm, name="suppliers-import-confirm"),
    path("suppliers/import/cmr-bulk", views.suppliers_import_cmr_bulk, name="suppliers-import-cmr-bulk"),
    # Suppliers
    path("suppliers", views.suppliers_list_create, name="suppliers-list-create"),
    path("suppliers/<uuid:pk>", views.suppliers_detail, name="suppliers-detail"),
    path("suppliers/<uuid:pk>/statement", views.supplier_statement, name="supplier-statement"),
    # Bill import/export — must be before <uuid:pk>
    path("bills/import/preview", views.bills_import_preview, name="bills-import-preview"),
    path("bills/import/confirm", views.bills_import_confirm, name="bills-import-confirm"),
    path("bills/export", views.bills_export, name="bills-export"),
    path("bills/bulk-approve", views.bills_bulk_approve, name="bills-bulk-approve"),
    path("bills/match-suggestions", views.bill_match_suggestions, name="bill-match-suggestions"),
    path("bills/auto-match", views.bill_auto_match, name="bill-auto-match"),
    path("bills/linked-transaction-ids", views.bill_linked_transaction_ids, name="bill-linked-transaction-ids"),
    path("bills/from-transaction", views.bill_create_from_transaction, name="bill-create-from-transaction"),
    path("transactions/<uuid:jel_id>/categorize", views.bank_transaction_categorize, name="bank-transaction-categorize"),
    path("transactions/<uuid:jel_id>/reconciliation", views.bank_transaction_reconciliation, name="bank-transaction-reconciliation"),
    # Bills
    path("bills", views.bills_list_create, name="bills-list-create"),
    path("bills/<uuid:pk>", views.bills_detail, name="bills-detail"),
    path("bills/<uuid:pk>/approve", views.bill_approve, name="bill-approve"),
    path("bills/<uuid:pk>/move-to-expenses", views.bill_move_to_expenses, name="bill-move-to-expenses"),
    path("bills/<uuid:pk>/record-payment", views.bill_record_payment, name="bill-record-payment"),
    # Expenses
    path("expenses", views.expenses_list_create, name="expenses-list-create"),
    path("expenses/<uuid:pk>", views.expenses_detail, name="expenses-detail"),
    path("expenses/<uuid:pk>/approve", views.expense_approve, name="expense-approve"),
]
