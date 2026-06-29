import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('journals', '0007_alter_journalentry_source'),
        ('purchases', '0007_expenseline'),
    ]

    operations = [
        migrations.CreateModel(
            name='BankTransactionCategorization',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=15)),
                ('categorized_by', models.CharField(blank=True, default='', max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('journal_entry', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transaction_categorizations', to='journals.journalentry')),
                ('journal_entry_line', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='categorization', to='journals.journalentryline')),
            ],
            options={
                'db_table': 'bank_transaction_categorizations',
            },
        ),
    ]
