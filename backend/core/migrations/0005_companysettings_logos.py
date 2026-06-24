from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_companysettings_date_format"),
    ]

    operations = [
        migrations.AddField(
            model_name="companysettings",
            name="logo1",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="companysettings",
            name="logo2",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="companysettings",
            name="logo3",
            field=models.TextField(blank=True, default=""),
        ),
    ]
