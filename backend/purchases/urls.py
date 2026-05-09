from django.urls import path

from . import views

urlpatterns = [
    # Supplier import/export — must be before <uuid:pk>
    path("suppliers/import/preview", views.suppliers_import_preview, name="suppliers-import-preview"),
    path("suppliers/import/confirm", views.suppliers_import_confirm, name="suppliers-import-confirm"),
    # Suppliers
    path("suppliers", views.suppliers_list_create, name="suppliers-list-create"),
    path("suppliers/<uuid:pk>", views.suppliers_detail, name="suppliers-detail"),
    path("suppliers/<uuid:pk>/statement", views.supplier_statement, name="supplier-statement"),
    # Bill export — must be before <uuid:pk>
    path("bills/export", views.bills_export, name="bills-export"),
    # Bills
    path("bills", views.bills_list_create, name="bills-list-create"),
    path("bills/<uuid:pk>", views.bills_detail, name="bills-detail"),
    path("bills/<uuid:pk>/approve", views.bill_approve, name="bill-approve"),
    # Expenses
    path("expenses", views.expenses_list_create, name="expenses-list-create"),
    path("expenses/<uuid:pk>", views.expenses_detail, name="expenses-detail"),
    path("expenses/<uuid:pk>/approve", views.expense_approve, name="expense-approve"),
]
