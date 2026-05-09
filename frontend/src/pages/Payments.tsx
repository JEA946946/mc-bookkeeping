import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Tooltip, TablePagination,
  Autocomplete, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Delete as DeleteIcon, RemoveRedEye as ViewIcon,
  Search as SearchIcon, AccountBalance as AllocateIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface PaymentAllocation {
  id?: string;
  content_type: 'invoice' | 'bill';
  object_id: string;
  amount: string;
  reference?: string;
  date?: string;
}

interface Payment {
  id: string;
  payment_number: string;
  type: 'incoming' | 'outgoing';
  date: string;
  amount: string;
  currency: string;
  method: string;
  bank_account_id: string;
  bank_account_code?: string;
  bank_account_name?: string;
  customer_id: string | null;
  customer_name?: string;
  supplier_id: string | null;
  supplier_name?: string;
  reference: string;
  notes: string;
  allocations?: PaymentAllocation[];
}

interface OpenDocument {
  id: string;
  reference: string;
  date: string;
  total: string;
  balance_due: string;
  allocate_amount: string;
}

type PaymentForm = {
  type: 'incoming' | 'outgoing';
  date: string;
  amount: string;
  currency: string;
  method: string;
  bank_account_id: string;
  customer_id: string | null;
  supplier_id: string | null;
  reference: string;
  notes: string;
};

const EMPTY_FORM: PaymentForm = {
  type: 'incoming',
  date: new Date().toISOString().split('T')[0],
  amount: '',
  currency: 'MAD',
  method: 'bank_transfer',
  bank_account_id: '',
  customer_id: null,
  supplier_id: null,
  reference: '',
  notes: '',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Payments: React.FC = () => {
  const { t, i18n } = useTranslation();

  const METHOD_OPTIONS = [
    { value: 'bank_transfer', label: t('payments.bankTransfer') },
    { value: 'cash', label: t('payments.cash') },
    { value: 'card', label: t('payments.card') },
    { value: 'check', label: t('payments.check') },
    { value: 'other', label: t('payments.other') },
  ];

  const METHOD_LABEL: Record<string, string> = {
    bank_transfer: t('payments.bankTransfer'),
    cash: t('payments.cash'),
    card: t('payments.card'),
    check: t('payments.check'),
    other: t('payments.other'),
  };

  /* --- list state --- */
  const [payments, setPayments] = useState<Payment[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  /* --- filter state --- */
  const [filterType, setFilterType] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  /* --- lookup data --- */
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  /* --- create dialog --- */
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<PaymentForm>({ ...EMPTY_FORM });
  const [formError, setFormError] = useState('');

  /* --- view dialog --- */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewing, setViewing] = useState<Payment | null>(null);

  /* --- allocate dialog --- */
  const [allocateOpen, setAllocateOpen] = useState(false);
  const [allocatingPayment, setAllocatingPayment] = useState<Payment | null>(null);
  const [openDocuments, setOpenDocuments] = useState<OpenDocument[]>([]);
  const [allocateError, setAllocateError] = useState('');

  /* ---------------------------------------------------------------- */
  /*  Fetch helpers                                                    */
  /* ---------------------------------------------------------------- */

  const fetchPayments = useCallback((p?: number) => {
    const params = new URLSearchParams();
    if (filterType) params.set('type', filterType);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);
    const currentPage = p !== undefined ? p : page;
    params.set('page', String(currentPage + 1));
    params.set('page_size', String(rowsPerPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/payments${qs}`).then(res => {
      if (res.data.success) {
        setPayments(res.data.data.payments);
        setTotalCount(res.data.data.total_count ?? res.data.data.count ?? 0);
      }
    });
  }, [filterType, filterDateFrom, filterDateTo, filterSearch, page, rowsPerPage]);

  const fetchLookups = useCallback(() => {
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) {
        const accts: Account[] = res.data.data.accounts;
        setAccounts(accts);
        setBankAccounts(accts.filter(a => a.code.startsWith('10')));
      }
    });
    api.get('/customers').then(res => {
      if (res.data.success) setCustomers(res.data.data.customers);
    });
    api.get('/suppliers').then(res => {
      if (res.data.success) setSuppliers(res.data.data.suppliers);
    });
  }, []);

  useEffect(() => {
    fetchPayments();
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Filter handlers                                                  */
  /* ---------------------------------------------------------------- */

  const handleApplyFilters = () => {
    setPage(0);
    fetchPayments(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    fetchPayments(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    setTimeout(() => fetchPayments(0), 0);
  };

  /* ---------------------------------------------------------------- */
  /*  Create dialog                                                    */
  /* ---------------------------------------------------------------- */

  const handleCreateOpen = () => {
    setForm({ ...EMPTY_FORM });
    setFormError('');
    setCreateOpen(true);
  };

  const handleCreateSave = async () => {
    setFormError('');
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setFormError(t('payments.errorInvalidAmount'));
      return;
    }
    if (!form.bank_account_id) {
      setFormError(t('payments.errorSelectBankAccount'));
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        date: form.date,
        amount: form.amount,
        currency: form.currency,
        method: form.method,
        bank_account_id: form.bank_account_id,
        reference: form.reference,
        notes: form.notes,
      };
      if (form.type === 'incoming' && form.customer_id) {
        payload.customer_id = form.customer_id;
      }
      if (form.type === 'outgoing' && form.supplier_id) {
        payload.supplier_id = form.supplier_id;
      }
      await api.post('/payments', payload);
      setCreateOpen(false);
      fetchPayments();
    } catch (err: any) {
      setFormError(err.response?.data?.message || t('payments.errorCreating'));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  View dialog                                                      */
  /* ---------------------------------------------------------------- */

  const handleView = async (payment: Payment) => {
    try {
      const res = await api.get(`/payments/${payment.id}`);
      if (res.data.success) {
        setViewing(res.data.data.payment);
        setViewOpen(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || t('payments.errorFetching'));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Delete                                                           */
  /* ---------------------------------------------------------------- */

  const handleDelete = async (id: string) => {
    if (!confirm(t('payments.confirmDelete'))) return;
    try {
      await api.delete(`/payments/${id}`);
      fetchPayments();
    } catch (err: any) {
      alert(err.response?.data?.message || t('payments.errorDeleting'));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Allocate dialog                                                  */
  /* ---------------------------------------------------------------- */

  const handleAllocateOpen = async (payment: Payment) => {
    setAllocateError('');
    setAllocatingPayment(payment);

    try {
      let docs: OpenDocument[] = [];
      if (payment.type === 'incoming' && payment.customer_id) {
        const res = await api.get(`/invoices?customer_id=${payment.customer_id}&status=open`);
        if (res.data.success) {
          docs = (res.data.data.invoices || []).map((inv: any) => ({
            id: inv.id,
            reference: inv.invoice_number || inv.reference || '',
            date: inv.date || inv.invoice_date || '',
            total: inv.total || inv.amount || '0',
            balance_due: inv.balance_due || inv.amount_due || '0',
            allocate_amount: '',
          }));
        }
      } else if (payment.type === 'outgoing' && payment.supplier_id) {
        const res = await api.get(`/bills?supplier_id=${payment.supplier_id}&status=open`);
        if (res.data.success) {
          docs = (res.data.data.bills || []).map((bill: any) => ({
            id: bill.id,
            reference: bill.bill_number || bill.reference || '',
            date: bill.date || bill.bill_date || '',
            total: bill.total || bill.amount || '0',
            balance_due: bill.balance_due || bill.amount_due || '0',
            allocate_amount: '',
          }));
        }
      }
      setOpenDocuments(docs);
      setAllocateOpen(true);
    } catch (err: any) {
      alert(err.response?.data?.message || t('payments.errorFetchingOpenDocuments'));
    }
  };

  const handleAllocateAmountChange = (index: number, value: string) => {
    setOpenDocuments(prev =>
      prev.map((d, i) => (i === index ? { ...d, allocate_amount: value } : d))
    );
  };

  const totalAllocated = openDocuments.reduce(
    (sum, d) => sum + parseFloat(d.allocate_amount || '0'),
    0
  );

  const handleAllocateConfirm = async () => {
    if (!allocatingPayment) return;
    setAllocateError('');

    const allocations = openDocuments
      .filter(d => parseFloat(d.allocate_amount || '0') > 0)
      .map(d => ({
        content_type: allocatingPayment.type === 'incoming' ? 'invoice' as const : 'bill' as const,
        object_id: d.id,
        amount: d.allocate_amount,
      }));

    if (allocations.length === 0) {
      setAllocateError(t('payments.errorNoAllocation'));
      return;
    }

    const paymentAmount = parseFloat(allocatingPayment.amount);
    if (totalAllocated > paymentAmount + 0.01) {
      setAllocateError(
        t('payments.errorAllocationExceeds', {
          allocated: totalAllocated.toFixed(2),
          paymentAmount: paymentAmount.toFixed(2),
        })
      );
      return;
    }

    try {
      await api.post(`/payments/${allocatingPayment.id}/allocate`, { allocations });
      setAllocateOpen(false);
      setAllocatingPayment(null);
      fetchPayments();
    } catch (err: any) {
      setAllocateError(err.response?.data?.message || t('payments.errorAllocating'));
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Helpers                                                          */
  /* ---------------------------------------------------------------- */

  const formatAmount = (value: string) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0,00' : num.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const selectedBankAccount = bankAccounts.find(a => a.id === form.bank_account_id) || null;
  const selectedCustomer = customers.find(c => c.id === form.customer_id) || null;
  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id) || null;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('payments.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateOpen} sx={{ bgcolor: '#2e7d32' }}>
          {t('payments.newPayment')}
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select label={t('common.type')} value={filterType} size="small"
          onChange={e => setFilterType(e.target.value)}
          sx={{ width: 150 }}
        >
          <MenuItem value="">{t('common.all')}</MenuItem>
          <MenuItem value="incoming">{t('payments.incoming')}</MenuItem>
          <MenuItem value="outgoing">{t('payments.outgoing')}</MenuItem>
        </TextField>
        <TextField
          label={t('common.fromDate')} type="date" value={filterDateFrom} size="small"
          onChange={e => setFilterDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
        />
        <TextField
          label={t('common.toDate')} type="date" value={filterDateTo} size="small"
          onChange={e => setFilterDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
        />
        <TextField
          label={t('common.search')} value={filterSearch} size="small"
          onChange={e => setFilterSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
          sx={{ width: 200 }}
          InputProps={{ endAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /> }}
        />
        <Button variant="outlined" size="small" onClick={handleApplyFilters}>
          {t('common.apply')}
        </Button>
      </Paper>

      {/* Payments Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('payments.paymentNumber')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.type')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.date')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.amount')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('payments.method')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('payments.customerSupplier')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.reference')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map(payment => (
              <TableRow key={payment.id} hover sx={{ '& td': { py: 0.3, whiteSpace: 'nowrap' } }}>
                <TableCell>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8rem' }}>
                    {payment.payment_number}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={payment.type === 'incoming' ? t('payments.incoming') : t('payments.outgoing')}
                    size="small"
                    color={payment.type === 'incoming' ? 'success' : 'error'}
                    sx={{ height: 22, fontSize: '0.75rem', '& .MuiChip-label': { px: 0.8 } }}
                  />
                </TableCell>
                <TableCell>{payment.date}</TableCell>
                <TableCell align="right">
                  {formatAmount(payment.amount)} {payment.currency}
                </TableCell>
                <TableCell>{METHOD_LABEL[payment.method] || payment.method}</TableCell>
                <TableCell>
                  {payment.type === 'incoming'
                    ? payment.customer_name || '-'
                    : payment.supplier_name || '-'}
                </TableCell>
                <TableCell>{payment.reference || '-'}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('payments.viewPayment')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleView(payment)}>
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('payments.allocatePayment')}>
                    <IconButton size="small" sx={{ p: 0.3 }} color="primary" onClick={() => handleAllocateOpen(payment)}>
                      <AllocateIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(payment.id)}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('payments.noPayments')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage={t('common.rowsPerPage')}
          labelDisplayedRows={({ from, to, count }) =>
            t('common.displayedRows', { from, to, count: count !== -1 ? count : `>${to}` })
          }
        />
      </TableContainer>

      {/* ============================================================ */}
      {/*  Create Payment Dialog                                        */}
      {/* ============================================================ */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('payments.newPayment')}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{formError}</Alert>}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* Type */}
            <TextField
              select label={t('common.type')} value={form.type} size="small" fullWidth
              onChange={e => {
                const newType = e.target.value as 'incoming' | 'outgoing';
                setForm(prev => ({
                  ...prev,
                  type: newType,
                  customer_id: newType === 'incoming' ? prev.customer_id : null,
                  supplier_id: newType === 'outgoing' ? prev.supplier_id : null,
                }));
              }}
            >
              <MenuItem value="incoming">{t('payments.incoming')}</MenuItem>
              <MenuItem value="outgoing">{t('payments.outgoing')}</MenuItem>
            </TextField>

            {/* Date + Amount row */}
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('common.date')} type="date" value={form.date} size="small"
                onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
                InputLabelProps={{ shrink: true }} sx={{ flex: 1 }}
              />
              <TextField
                label={t('common.amount')} type="number" value={form.amount} size="small"
                onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                inputProps={{ min: 0, step: '0.01' }}
                sx={{ flex: 1 }}
              />
              <TextField
                label={t('common.currency')} value={form.currency} size="small"
                onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
                sx={{ width: 90 }}
              />
            </Box>

            {/* Method */}
            <TextField
              select label={t('payments.method')} value={form.method} size="small" fullWidth
              onChange={e => setForm(prev => ({ ...prev, method: e.target.value }))}
            >
              {METHOD_OPTIONS.map(o => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>

            {/* Bank Account */}
            <Autocomplete
              size="small"
              options={bankAccounts}
              value={selectedBankAccount}
              onChange={(_, val) => setForm(prev => ({ ...prev, bank_account_id: val?.id || '' }))}
              getOptionLabel={(o) => `${o.code} \u2014 ${o.name}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={t('payments.bankAccount')} />}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>
                    {option.code}
                  </Typography>
                  {option.name}
                </li>
              )}
              filterOptions={(options, { inputValue }) => {
                if (!inputValue) return options.slice(0, 50);
                const q = inputValue.toLowerCase();
                return options.filter(o =>
                  o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
                ).slice(0, 50);
              }}
              ListboxProps={{ style: { maxHeight: 200 } }}
            />

            {/* Customer (shown for incoming) */}
            {form.type === 'incoming' && (
              <Autocomplete
                size="small"
                options={customers}
                value={selectedCustomer}
                onChange={(_, val) => setForm(prev => ({ ...prev, customer_id: val?.id || null }))}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                renderInput={(params) => <TextField {...params} label={t('payments.customer')} />}
                filterOptions={(options, { inputValue }) => {
                  if (!inputValue) return options.slice(0, 50);
                  const q = inputValue.toLowerCase();
                  return options.filter(o => o.name.toLowerCase().includes(q)).slice(0, 50);
                }}
                ListboxProps={{ style: { maxHeight: 200 } }}
              />
            )}

            {/* Supplier (shown for outgoing) */}
            {form.type === 'outgoing' && (
              <Autocomplete
                size="small"
                options={suppliers}
                value={selectedSupplier}
                onChange={(_, val) => setForm(prev => ({ ...prev, supplier_id: val?.id || null }))}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                renderInput={(params) => <TextField {...params} label={t('payments.supplier')} />}
                filterOptions={(options, { inputValue }) => {
                  if (!inputValue) return options.slice(0, 50);
                  const q = inputValue.toLowerCase();
                  return options.filter(o => o.name.toLowerCase().includes(q)).slice(0, 50);
                }}
                ListboxProps={{ style: { maxHeight: 200 } }}
              />
            )}

            {/* Reference */}
            <TextField
              label={t('common.reference')} value={form.reference} size="small" fullWidth
              onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))}
            />

            {/* Notes */}
            <TextField
              label={t('common.notes')} value={form.notes} size="small" fullWidth multiline rows={3}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreateSave} sx={{ bgcolor: '#2e7d32' }}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/*  View Payment Dialog                                          */}
      {/* ============================================================ */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {t('payments.viewPayment')} {viewing?.payment_number}
          {viewing && (
            <Chip
              label={viewing.type === 'incoming' ? t('payments.incoming') : t('payments.outgoing')}
              size="small"
              color={viewing.type === 'incoming' ? 'success' : 'error'}
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {viewing && (
            <Box sx={{ mt: 1 }}>
              {/* Details grid */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 3 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.date')}</Typography>
                  <Typography variant="body2">{viewing.date}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.amount')}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatAmount(viewing.amount)} {viewing.currency}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('payments.method')}</Typography>
                  <Typography variant="body2">{METHOD_LABEL[viewing.method] || viewing.method}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('payments.bankAccount')}</Typography>
                  <Typography variant="body2">
                    {viewing.bank_account_code ? `${viewing.bank_account_code} \u2014 ${viewing.bank_account_name}` : '-'}
                  </Typography>
                </Box>
                {viewing.type === 'incoming' && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{t('payments.customer')}</Typography>
                    <Typography variant="body2">{viewing.customer_name || '-'}</Typography>
                  </Box>
                )}
                {viewing.type === 'outgoing' && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{t('payments.supplier')}</Typography>
                    <Typography variant="body2">{viewing.supplier_name || '-'}</Typography>
                  </Box>
                )}
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.reference')}</Typography>
                  <Typography variant="body2">{viewing.reference || '-'}</Typography>
                </Box>
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Typography variant="caption" color="text.secondary">{t('common.notes')}</Typography>
                  <Typography variant="body2">{viewing.notes || '-'}</Typography>
                </Box>
              </Box>

              {/* Allocations table */}
              {viewing.allocations && viewing.allocations.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('payments.allocations')}</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.type')}</TableCell>
                          <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('payments.document')}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('common.amount')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {viewing.allocations.map((alloc, i) => (
                          <TableRow key={alloc.id || i}>
                            <TableCell>
                              <Chip
                                label={alloc.content_type === 'invoice' ? t('payments.invoice') : t('payments.bill')}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                              />
                            </TableCell>
                            <TableCell>{alloc.reference || alloc.object_id}</TableCell>
                            <TableCell align="right">{formatAmount(alloc.amount)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell colSpan={2} align="right" sx={{ fontWeight: 600 }}>
                            {t('payments.totalAllocated')}
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {formatAmount(
                              viewing.allocations
                                .reduce((sum, a) => sum + parseFloat(a.amount || '0'), 0)
                                .toFixed(2)
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}

              {(!viewing.allocations || viewing.allocations.length === 0) && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t('payments.noAllocationsYet')}
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/*  Allocate Payment Dialog                                      */}
      {/* ============================================================ */}
      <Dialog open={allocateOpen} onClose={() => setAllocateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {t('payments.allocatePayment')} {allocatingPayment?.payment_number}
          {allocatingPayment && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('payments.paymentAmount')}: {formatAmount(allocatingPayment.amount)} {allocatingPayment.currency}
              {' \u2014 '}
              {allocatingPayment.type === 'incoming'
                ? `${t('payments.customer')}: ${allocatingPayment.customer_name || '-'}`
                : `${t('payments.supplier')}: ${allocatingPayment.supplier_name || '-'}`}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {allocateError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{allocateError}</Alert>}

          {openDocuments.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              {allocatingPayment?.type === 'incoming'
                ? t('payments.noOpenInvoices')
                : t('payments.noOpenBills')}
            </Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.reference')}</TableCell>
                      <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.date')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('common.total')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('payments.balanceDue')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, minWidth: 140 }}>{t('payments.allocateAmount')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {openDocuments.map((doc, i) => (
                      <TableRow key={doc.id} hover>
                        <TableCell>{doc.reference}</TableCell>
                        <TableCell>{doc.date}</TableCell>
                        <TableCell align="right">{formatAmount(doc.total)}</TableCell>
                        <TableCell align="right">{formatAmount(doc.balance_due)}</TableCell>
                        <TableCell align="right" sx={{ p: 0.5 }}>
                          <TextField
                            type="number"
                            size="small"
                            value={doc.allocate_amount}
                            onChange={e => handleAllocateAmountChange(i, e.target.value)}
                            inputProps={{ min: 0, max: parseFloat(doc.balance_due), step: '0.01' }}
                            sx={{ width: 130 }}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Total allocated row */}
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell colSpan={4} align="right" sx={{ fontWeight: 600 }}>
                        {t('payments.totalAllocated')}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        <Typography
                          component="span"
                          sx={{
                            fontWeight: 600,
                            color: allocatingPayment && totalAllocated > parseFloat(allocatingPayment.amount) + 0.01
                              ? 'error.main'
                              : 'text.primary',
                          }}
                        >
                          {formatAmount(totalAllocated.toFixed(2))}
                        </Typography>
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                          / {allocatingPayment ? formatAmount(allocatingPayment.amount) : '0,00'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAllocateOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleAllocateConfirm}
            disabled={openDocuments.length === 0 || totalAllocated === 0}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {t('payments.confirmAllocation')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Payments;
