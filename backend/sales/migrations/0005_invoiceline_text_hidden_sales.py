import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("sales", "0004_backfill_invoice_vat_quarter"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoiceline",
            name="sales_price",
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text="Sales price — informational only, does not affect totals",
                max_digits=15,
            ),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="is_text",
            field=models.BooleanField(
                default=False,
                help_text="Text-only line (no quantity/price/account)",
            ),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="is_hidden",
            field=models.BooleanField(
                default=False,
                help_text="Hidden on the printed/customer invoice, still counts in totals",
            ),
        ),
        migrations.AddField(
            model_name="invoiceline",
            name="position",
            field=models.IntegerField(
                default=0, help_text="Display order within the invoice"
            ),
        ),
        migrations.AlterField(
            model_name="invoiceline",
            name="account",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="invoice_lines",
                to="accounts.account",
            ),
        ),
        migrations.AlterModelOptions(
            name="invoiceline",
            options={"ordering": ["position", "id"]},
        ),
    ]
