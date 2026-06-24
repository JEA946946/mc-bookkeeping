from django.urls import path

from . import views

urlpatterns = [
    # Employees
    path("payroll/employees", views.employees_list_create, name="employees-list-create"),
    path("payroll/employees/<uuid:pk>", views.employees_detail, name="employees-detail"),
    # Payroll runs
    path("payroll/runs", views.payroll_runs_list_create, name="payroll-runs-list-create"),
    path("payroll/runs/<uuid:pk>", views.payroll_runs_detail, name="payroll-runs-detail"),
    path("payroll/runs/<uuid:pk>/lines/<uuid:line_pk>", views.payroll_run_update_line, name="payroll-run-update-line"),
    path("payroll/runs/<uuid:pk>/approve", views.payroll_run_approve, name="payroll-run-approve"),
    # Leave / vacation
    path("payroll/leave/overview", views.leave_overview, name="leave-overview"),
    path("payroll/leave", views.leave_list_create, name="leave-list-create"),
    path("payroll/leave/<uuid:pk>", views.leave_detail, name="leave-detail"),
    # Public holidays (double pay if worked)
    path("payroll/holidays/seed", views.holidays_seed, name="holidays-seed"),
    path("payroll/holidays", views.holidays_list_create, name="holidays-list-create"),
    path("payroll/holidays/<uuid:pk>", views.holidays_detail, name="holidays-detail"),
    path("payroll/holidays/<uuid:pk>/workers", views.holiday_workers, name="holiday-workers"),
]
