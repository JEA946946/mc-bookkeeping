import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_supplieraccountmapping"),
        ("journals", "0003_bank_description_mapping"),
    ]

    operations = [
        migrations.CreateModel(
            name="BankStatementUpload",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("filename", models.CharField(default="", max_length=500)),
                ("date_from", models.DateField(blank=True, null=True)),
                ("date_to", models.DateField(blank=True, null=True)),
                ("transaction_count", models.IntegerField(default=0)),
                ("uploaded_by", models.CharField(blank=True, default="", max_length=200)),
                ("uploaded_at", models.DateTimeField(auto_now_add=True)),
                (
                    "bank_account",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="statement_uploads",
                        to="accounts.account",
                    ),
                ),
            ],
            options={
                "db_table": "bank_statement_uploads",
                "ordering": ["-uploaded_at"],
            },
        ),
    ]
