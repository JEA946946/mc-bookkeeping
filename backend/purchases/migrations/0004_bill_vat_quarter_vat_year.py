from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("purchases", "0003_supplier_default_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="bill",
            name="vat_quarter",
            field=models.IntegerField(
                choices=[(1, "Q1"), (2, "Q2"), (3, "Q3"), (4, "Q4")],
                default=1,
            ),
        ),
        migrations.AddField(
            model_name="bill",
            name="vat_year",
            field=models.IntegerField(default=2025),
        ),
    ]
