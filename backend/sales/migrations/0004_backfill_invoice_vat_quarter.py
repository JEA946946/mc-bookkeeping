from django.db import migrations


def backfill_vat_quarter(apps, schema_editor):
    Invoice = apps.get_model("sales", "Invoice")
    for invoice in Invoice.objects.all():
        if invoice.date:
            invoice.vat_quarter = (invoice.date.month - 1) // 3 + 1
            invoice.vat_year = invoice.date.year
            invoice.save(update_fields=["vat_quarter", "vat_year"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0003_invoice_vat_quarter_vat_year"),
    ]

    operations = [
        migrations.RunPython(backfill_vat_quarter, noop),
    ]
