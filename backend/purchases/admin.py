from django.contrib import admin

from .models import Supplier, Bill, BillLine, Expense

admin.site.register(Supplier)
admin.site.register(Bill)
admin.site.register(BillLine)
admin.site.register(Expense)
