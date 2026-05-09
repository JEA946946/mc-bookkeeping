from django.urls import path

from . import views

urlpatterns = [
    # Auth
    path("auth/login", views.login),
    path("auth/refresh", views.refresh_token),
    path("auth/profile", views.profile),
    # Account types
    path("accounts/types", views.account_types_list),
    # Account import — must be before <uuid:pk>
    path("accounts/import/preview", views.accounts_import_preview),
    path("accounts/import/confirm", views.accounts_import_confirm),
    # Accounts CRUD
    path("accounts", views.accounts_list_create),
    path("accounts/<uuid:pk>", views.accounts_detail),
    path("accounts/<uuid:pk>/ledger", views.account_ledger),
    # Fiscal years
    path("fiscal-years", views.fiscal_years_list_create),
    path("fiscal-years/<uuid:pk>", views.fiscal_years_detail),
    # Supplier account mappings
    path("supplier-mappings", views.supplier_mappings_list_create),
    path("supplier-mappings/<uuid:pk>", views.supplier_mappings_delete),
]
