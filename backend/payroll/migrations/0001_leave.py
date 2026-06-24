"""Idempotent schema additions for leave tracking.

The payroll tables (employees, payroll_runs, payroll_lines) already exist in the
database but were created outside Django's migration system, so this app has no
prior migration state. To avoid recreating existing tables, this migration uses
raw, idempotent SQL (IF NOT EXISTS) instead of model state operations.
"""

from django.db import migrations


class Migration(migrations.Migration):

    initial = True
    dependencies = []

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE employees "
                "ADD COLUMN IF NOT EXISTS annual_leave_days numeric(5,1) NOT NULL DEFAULT 18;"
                "\n"
                "CREATE TABLE IF NOT EXISTS leave_entries ("
                "  id uuid PRIMARY KEY,"
                "  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,"
                "  start_date date NOT NULL,"
                "  end_date date NOT NULL,"
                "  days numeric(5,1) NOT NULL DEFAULT 0,"
                "  leave_type varchar(20) NOT NULL DEFAULT 'annual',"
                "  note text NOT NULL DEFAULT '',"
                "  created_at timestamptz NOT NULL DEFAULT now(),"
                "  updated_at timestamptz NOT NULL DEFAULT now()"
                ");"
                "\n"
                "CREATE INDEX IF NOT EXISTS leave_entries_employee_idx "
                "ON leave_entries(employee_id);"
            ),
            reverse_sql=(
                "DROP TABLE IF EXISTS leave_entries;"
                "ALTER TABLE employees DROP COLUMN IF EXISTS annual_leave_days;"
            ),
        ),
    ]
