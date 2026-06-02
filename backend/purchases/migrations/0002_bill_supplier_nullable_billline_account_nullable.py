"""Make Bill.supplier and BillLine.account nullable for import without mapping."""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="bill",
            name="supplier",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bills",
                to="purchases.supplier",
            ),
        ),
        migrations.AlterField(
            model_name="billline",
            name="account",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="bill_lines",
                to="accounts.account",
            ),
        ),
    ]
