from django.db import migrations


def backfill_vat_quarter(apps, schema_editor):
    Bill = apps.get_model("purchases", "Bill")
    for bill in Bill.objects.all():
        if bill.date:
            bill.vat_quarter = (bill.date.month - 1) // 3 + 1
            bill.vat_year = bill.date.year
            bill.save(update_fields=["vat_quarter", "vat_year"])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0004_bill_vat_quarter_vat_year"),
    ]

    operations = [
        migrations.RunPython(backfill_vat_quarter, noop),
    ]
