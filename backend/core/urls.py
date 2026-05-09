from django.urls import path

from . import views

urlpatterns = [
    # Tax Codes
    path("tax-codes", views.tax_codes_list_create, name="tax-codes-list-create"),
    path("tax-codes/<uuid:pk>", views.tax_codes_detail, name="tax-codes-detail"),
    # Payments
    path("payments", views.payments_list_create, name="payments-list-create"),
    path("payments/<uuid:pk>", views.payments_detail, name="payments-detail"),
    path("payments/<uuid:pk>/allocate", views.payment_allocate, name="payment-allocate"),
    # Bank Rules
    path("bank-rules", views.bank_rules_list_create, name="bank-rules-list-create"),
    path("bank-rules/<uuid:pk>", views.bank_rules_detail, name="bank-rules-detail"),
    path("bank-rules/test", views.bank_rules_test, name="bank-rules-test"),
    # Bank Reconciliation
    path("bank-reconciliations", views.bank_reconciliations_list_create, name="bank-reconciliations-list-create"),
    path("bank-reconciliations/<uuid:pk>", views.bank_reconciliations_detail, name="bank-reconciliations-detail"),
    path("bank-reconciliations/<uuid:pk>/match", views.bank_reconciliation_match, name="bank-reconciliation-match"),
    path("bank-reconciliations/<uuid:pk>/complete", views.bank_reconciliation_complete, name="bank-reconciliation-complete"),
    # Projects
    path("projects", views.projects_list_create, name="projects-list-create"),
    path("projects/<uuid:pk>", views.projects_detail, name="projects-detail"),
    path("projects/<uuid:pk>/transactions", views.project_transactions, name="project-transactions"),
    path("projects/<uuid:pk>/assign", views.project_assign, name="project-assign"),
    path("projects/<uuid:pk>/pnl", views.project_pnl, name="project-pnl"),
    # Documents
    path("documents", views.documents_list_create, name="documents-list-create"),
    path("documents/<uuid:pk>", views.documents_detail, name="documents-detail"),
    path("documents/<uuid:pk>/link", views.document_link, name="document-link"),
    # Reports
    path("reports/tax", views.report_tax, name="report-tax"),
    path("reports/cash-flow", views.report_cash_flow, name="report-cash-flow"),
    path("reports/aging-receivable", views.report_aging_receivable, name="report-aging-receivable"),
    path("reports/aging-payable", views.report_aging_payable, name="report-aging-payable"),
    path("reports/general-ledger", views.report_general_ledger, name="report-general-ledger"),
    path("reports/account-specification", views.report_account_specification, name="report-account-specification"),
    path("reports/project-pnl", views.report_project_pnl, name="report-project-pnl"),
    # Audit & Settings
    path("audit-log", views.audit_log_list, name="audit-log-list"),
    path("settings", views.settings_detail, name="settings-detail"),
    path("users", views.users_list_create, name="users-list-create"),
    path("users/<int:pk>/role", views.user_role_update, name="user-role-update"),
]
