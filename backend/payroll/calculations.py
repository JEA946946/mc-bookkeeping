"""Moroccan payroll calculations: CNSS contributions and IR income tax."""

from decimal import Decimal, ROUND_HALF_UP

# Monthly CNSS ceiling
CNSS_CEILING = Decimal("6000")

# ── Employee CNSS contributions ─────────────────────────────────────────────

# Contributions WITH ceiling (capped at 6.000 DH/month)
EMPLOYEE_PENSION = Decimal("0.0448")       # Pension + death/disability
EMPLOYEE_SHORT_TERM = Decimal("0.0033")    # Short-term (illness/maternity)
EMPLOYEE_IPE = Decimal("0.0019")           # Unemployment insurance

# Contributions WITHOUT ceiling
EMPLOYEE_AMO = Decimal("0.0226")           # Health insurance (AMO)

# ── Employer CNSS contributions ─────────────────────────────────────────────

# Contributions WITH ceiling
EMPLOYER_PENSION = Decimal("0.0898")
EMPLOYER_SHORT_TERM = Decimal("0.0067")
EMPLOYER_IPE = Decimal("0.0038")

# Contributions WITHOUT ceiling
EMPLOYER_AMO = Decimal("0.0226")
EMPLOYER_AMO_SOLIDARITE = Decimal("0.0185")   # AMO Solidarité (Tadamoun)
EMPLOYER_FAMILY = Decimal("0.0640")           # Family allowance
EMPLOYER_TRAINING = Decimal("0.0160")         # Vocational training tax

# ── IR (Impôt sur le Revenu) monthly brackets ──────────────────────────────

IR_BRACKETS = [
    # (upper_limit, rate, cumulative_deduction)
    # Monthly tranches derived from annual brackets / 12
    (Decimal("2500"), Decimal("0.00"), Decimal("0")),
    (Decimal("4166"), Decimal("0.10"), Decimal("250")),
    (Decimal("5000"), Decimal("0.20"), Decimal("666.60")),
    (Decimal("6666"), Decimal("0.30"), Decimal("1166.60")),
    (Decimal("15000"), Decimal("0.34"), Decimal("1433.26")),
    (None, Decimal("0.38"), Decimal("2033.26")),
]

TWO = Decimal("0.01")


def _round(value):
    """Round to 2 decimal places."""
    return value.quantize(TWO, rounding=ROUND_HALF_UP)


def calculate_cnss_employee(gross):
    """Calculate total employee CNSS contribution."""
    capped = min(gross, CNSS_CEILING)

    pension = _round(capped * EMPLOYEE_PENSION)
    short_term = _round(capped * EMPLOYEE_SHORT_TERM)
    ipe = _round(capped * EMPLOYEE_IPE)
    amo = _round(gross * EMPLOYEE_AMO)

    return _round(pension + short_term + ipe + amo)


def calculate_cnss_employer(gross):
    """Calculate total employer CNSS contribution."""
    capped = min(gross, CNSS_CEILING)

    pension = _round(capped * EMPLOYER_PENSION)
    short_term = _round(capped * EMPLOYER_SHORT_TERM)
    ipe = _round(capped * EMPLOYER_IPE)
    amo = _round(gross * EMPLOYER_AMO)
    amo_solidarite = _round(gross * EMPLOYER_AMO_SOLIDARITE)
    family = _round(gross * EMPLOYER_FAMILY)
    training = _round(gross * EMPLOYER_TRAINING)

    return _round(pension + short_term + ipe + amo + amo_solidarite + family + training)


def calculate_ir(taxable_income):
    """Calculate monthly IR (income tax) on taxable income.

    taxable_income = gross - cnss_employee
    """
    if taxable_income <= Decimal("0"):
        return Decimal("0")

    for upper, rate, deduction in IR_BRACKETS:
        if upper is None or taxable_income <= upper:
            return _round(taxable_income * rate - deduction)

    # Should not reach here
    return Decimal("0")


def calculate_payroll_line(gross_salary):
    """Calculate all payroll amounts for a given gross salary.

    Returns dict with:
        gross_salary, cnss_employee, cnss_employer, ir_amount, net_salary
    """
    gross = Decimal(str(gross_salary))

    cnss_employee = calculate_cnss_employee(gross)
    cnss_employer = calculate_cnss_employer(gross)

    taxable = gross - cnss_employee
    ir_amount = calculate_ir(taxable)

    # Ensure IR is not negative
    if ir_amount < Decimal("0"):
        ir_amount = Decimal("0")

    net_salary = _round(gross - cnss_employee - ir_amount)

    return {
        "gross_salary": gross,
        "cnss_employee": cnss_employee,
        "cnss_employer": cnss_employer,
        "ir_amount": ir_amount,
        "net_salary": net_salary,
    }


def calculate_gross_from_net(desired_net):
    """Reverse-calculate gross salary from desired net salary using binary search.

    Given a desired net salary (what the employee should receive after
    CNSS employee contribution and IR deductions), find the gross salary
    that produces that net amount.
    """
    desired = Decimal(str(desired_net))
    if desired <= Decimal("0"):
        return Decimal("0")

    # Binary search: gross is always >= net
    lo = desired
    hi = desired * Decimal("2")

    # Ensure upper bound is high enough
    for _ in range(10):
        calc = calculate_payroll_line(hi)
        if calc["net_salary"] >= desired:
            break
        hi *= Decimal("2")

    # Binary search with precision to 0.01
    best_gross = lo
    best_diff = abs(calculate_payroll_line(lo)["net_salary"] - desired)

    for _ in range(200):
        mid = _round((lo + hi) / Decimal("2"))
        calc = calculate_payroll_line(mid)
        diff = calc["net_salary"] - desired

        if abs(diff) < best_diff:
            best_diff = abs(diff)
            best_gross = mid

        if diff == Decimal("0"):
            return mid
        elif abs(diff) <= Decimal("0.01"):
            # Close enough, but prefer the gross that gives net >= desired
            if diff >= Decimal("0"):
                return mid
            lo = mid + Decimal("0.01")
        elif diff < Decimal("0"):
            lo = mid + Decimal("0.01")
        else:
            hi = mid - Decimal("0.01")

        if lo > hi:
            break

    # Final check: try best_gross and best_gross + 0.01 to get net >= desired
    calc = calculate_payroll_line(best_gross)
    if calc["net_salary"] < desired:
        best_gross = best_gross + Decimal("0.01")

    return best_gross
