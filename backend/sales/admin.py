from django.contrib import admin

from .models import Customer, Invoice, InvoiceLine, CreditNote

admin.site.register(Customer)
admin.site.register(Invoice)
admin.site.register(InvoiceLine)
admin.site.register(CreditNote)
