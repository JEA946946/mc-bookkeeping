from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0003_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="companysettings",
            name="date_format",
            field=models.CharField(default="DD-MM-YYYY", max_length=20),
        ),
    ]
