from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('journals', '0006_alter_journalentry_source'),
    ]

    operations = [
        migrations.AlterField(
            model_name='journalentry',
            name='source',
            field=models.CharField(choices=[('manual', 'Manual'), ('cmr_invoice', 'CMR Invoice'), ('cmr_payment', 'CMR Payment'), ('invoice', 'Invoice'), ('credit_note', 'Credit Note'), ('expense', 'Expense'), ('bank', 'Bank'), ('margin_recognition', 'Margin Recognition'), ('tva_margin', 'TVA on Margin'), ('payroll', 'Payroll'), ('reclass', 'Reclassification')], default='manual', max_length=20),
        ),
    ]
