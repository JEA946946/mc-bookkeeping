"""Idempotent schema for public holidays + holiday work tracking."""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("payroll", "0001_leave"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "CREATE TABLE IF NOT EXISTS public_holidays ("
                "  id uuid PRIMARY KEY,"
                "  date date NOT NULL,"
                "  name varchar(200) NOT NULL DEFAULT '',"
                "  created_at timestamptz NOT NULL DEFAULT now(),"
                "  updated_at timestamptz NOT NULL DEFAULT now()"
                ");"
                "\n"
                "CREATE TABLE IF NOT EXISTS holiday_work ("
                "  id uuid PRIMARY KEY,"
                "  holiday_id uuid NOT NULL REFERENCES public_holidays(id) ON DELETE CASCADE,"
                "  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,"
                "  created_at timestamptz NOT NULL DEFAULT now(),"
                "  UNIQUE (holiday_id, employee_id)"
                ");"
                "\n"
                "CREATE INDEX IF NOT EXISTS holiday_work_holiday_idx ON holiday_work(holiday_id);"
                "CREATE INDEX IF NOT EXISTS holiday_work_employee_idx ON holiday_work(employee_id);"
            ),
            reverse_sql=(
                "DROP TABLE IF EXISTS holiday_work;"
                "DROP TABLE IF EXISTS public_holidays;"
            ),
        ),
    ]
