from django.contrib import admin

from .models import (
    TaxCode, Payment, PaymentAllocation, BankRule,
    BankReconciliation, BankReconciliationLine, Project,
    ProjectTransaction, Document, AuditLog, CompanySettings, UserRole,
)

admin.site.register(TaxCode)
admin.site.register(Payment)
admin.site.register(PaymentAllocation)
admin.site.register(BankRule)
admin.site.register(BankReconciliation)
admin.site.register(BankReconciliationLine)
admin.site.register(Project)
admin.site.register(ProjectTransaction)
admin.site.register(Document)
admin.site.register(AuditLog)
admin.site.register(CompanySettings)
admin.site.register(UserRole)
