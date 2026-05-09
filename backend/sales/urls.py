from django.urls import path

from . import views

urlpatterns = [
    # Customer import/export — must be before <uuid:pk>
    path("customers/import/preview", views.customers_import_preview, name="customers-import-preview"),
    path("customers/import/confirm", views.customers_import_confirm, name="customers-import-confirm"),
    # Customers
    path("customers", views.customers_list_create, name="customers-list-create"),
    path("customers/<uuid:pk>", views.customers_detail, name="customers-detail"),
    path("customers/<uuid:pk>/statement", views.customer_statement, name="customer-statement"),
    # Invoice export — must be before <uuid:pk>
    path("invoices/export", views.invoices_export, name="invoices-export"),
    # Invoices
    path("invoices", views.invoices_list_create, name="invoices-list-create"),
    path("invoices/<uuid:pk>", views.invoices_detail, name="invoices-detail"),
    path("invoices/<uuid:pk>/post", views.invoice_post, name="invoice-post"),
    path("invoices/<uuid:pk>/send", views.invoice_send, name="invoice-send"),
    # Credit Notes
    path("credit-notes", views.credit_notes_list_create, name="credit-notes-list-create"),
    path("credit-notes/<uuid:pk>", views.credit_notes_detail, name="credit-notes-detail"),
    path("credit-notes/<uuid:pk>/apply", views.credit_note_apply, name="credit-note-apply"),
]
