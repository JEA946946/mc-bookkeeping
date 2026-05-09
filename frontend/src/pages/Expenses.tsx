import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, Tooltip, TablePagination, MenuItem,
  Autocomplete, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  RemoveRedEye as ViewIcon, CheckCircle as ApproveIcon,
  Search as SearchIcon, CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Supplier {
  id: string;
  name: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
}

interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: string;
}

interface Expense {
  id: string;
  date: string;
  description: string;
  supplier_id: string | null;
  supplier_name: string | null;
  amount: string;
  account_id: string;
  account_code: string;
  account_name: string;
  tax_code_id: string | null;
  tax_code_name: string | null;
  payment_method: string;
  reference: string;
  receipt_filename: string | null;
  status: 'pending' | 'approved' | 'paid';
}

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  description: '',
  supplier_id: '',
  amount: '',
  account_id: '',
  tax_code_id: '',
  payment_method: 'bank_transfer',
  reference: '',
};

const Expenses: React.FC = () => {
  const { t, i18n } = useTranslation();

  const STATUS_OPTIONS = [
    { value: '', label: t('common.all') },
    { value: 'pending', label: t('expenses.pending') },
    { value: 'approved', label: t('expenses.approved') },
    { value: 'paid', label: t('expenses.paid') },
  ];

  const PAYMENT_METHODS = [
    { value: 'bank_transfer', label: t('expenses.bankTransfer') },
    { value: 'cash', label: t('expenses.cash') },
    { value: 'card', label: t('expenses.card') },
    { value: 'check', label: t('expenses.check') },
  ];

  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    bank_transfer: t('expenses.bankTransfer'),
    cash: t('expenses.cash'),
    card: t('expenses.card'),
    check: t('expenses.check'),
  };

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [error, setError] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Form state
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchExpenses = (p?: number) => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);
    const currentPage = p !== undefined ? p : page;
    params.set('page', String(currentPage + 1));
    params.set('page_size', String(rowsPerPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/expenses${qs}`).then(res => {
      if (res.data.success) {
        setExpenses(res.data.data.expenses);
        setTotalCount(res.data.data.total_count ?? res.data.data.count ?? 0);
      }
    });
  };

  useEffect(() => {
    fetchExpenses();
    api.get('/suppliers').then(res => {
      if (res.data.success) setSuppliers(res.data.data.suppliers);
    });
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) setAccounts(res.data.data.accounts);
    });
    api.get('/tax-codes').then(res => {
      if (res.data.success) setTaxCodes(res.data.data.tax_codes);
    });
  }, []);

  const handleApplyFilters = () => {
    setPage(0);
    fetchExpenses(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    fetchExpenses(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    setTimeout(() => fetchExpenses(0), 0);
  };

  const handleOpen = async (expense?: Expense) => {
    setError('');
    setReceiptFile(null);
    if (expense) {
      const res = await api.get(`/expenses/${expense.id}`);
      if (res.data.success) {
        const full = res.data.data.expense;
        setEditing(full);
        setForm({
          date: full.date,
          description: full.description,
          supplier_id: full.supplier_id || '',
          amount: full.amount,
          account_id: full.account_id,
          tax_code_id: full.tax_code_id || '',
          payment_method: full.payment_method || 'bank_transfer',
          reference: full.reference || '',
        });
      }
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM });
    }
    setDialogOpen(true);
  };

  const handleView = async (expense: Expense) => {
    const res = await api.get(`/expenses/${expense.id}`);
    if (res.data.success) {
      setViewing(res.data.data.expense);
      setViewDialogOpen(true);
    }
  };

  const handleSave = async () => {
    setError('');
    try {
      const formData = new FormData();
      formData.append('date', form.date);
      formData.append('description', form.description);
      formData.append('amount', form.amount);
      formData.append('account_id', form.account_id);
      formData.append('payment_method', form.payment_method);
      if (form.supplier_id) formData.append('supplier_id', form.supplier_id);
      if (form.tax_code_id) formData.append('tax_code_id', form.tax_code_id);
      if (form.reference) formData.append('reference', form.reference);
      if (receiptFile) formData.append('receipt', receiptFile);

      if (editing) {
        await api.put(`/expenses/${editing.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/expenses', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setDialogOpen(false);
      fetchExpenses();
    } catch (err: any) {
      setError(err.response?.data?.message || t('expenses.errorSaving'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('expenses.deleteConfirm'))) return;
    try {
      await api.delete(`/expenses/${id}`);
      fetchExpenses();
    } catch (err: any) {
      alert(err.response?.data?.message || t('expenses.errorDeleting'));
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm(t('expenses.approveConfirm'))) return;
    try {
      await api.post(`/expenses/${id}/approve`);
      fetchExpenses();
    } catch (err: any) {
      alert(err.response?.data?.message || t('expenses.errorApproving'));
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'pending':
        return <Chip label={t('expenses.pending')} size="small" color="warning" />;
      case 'approved':
        return <Chip label={t('expenses.approved')} size="small" color="primary" />;
      case 'paid':
        return <Chip label={t('expenses.paid')} size="small" color="success" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const selectedSupplier = suppliers.find(s => s.id === form.supplier_id) || null;
  const selectedAccount = accounts.find(a => a.id === form.account_id) || null;
  const selectedTaxCode = taxCodes.find(t => t.id === form.tax_code_id) || null;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('expenses.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
          {t('expenses.newExpense')}
        </Button>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select label={t('common.status')} value={filterStatus} size="small"
          onChange={e => setFilterStatus(e.target.value)}
          sx={{ width: 140 }}
        >
          {STATUS_OPTIONS.map(o => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('common.from')} type="date" value={filterDateFrom} size="small"
          onChange={e => setFilterDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
        />
        <TextField
          label={t('common.to')} type="date" value={filterDateTo} size="small"
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

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.date')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.description')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('expenses.supplier')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.amount')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.account')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('expenses.paymentMethod')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.status')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses.map(exp => (
              <TableRow key={exp.id} hover sx={{ '& td': { py: 0.3, whiteSpace: 'nowrap' } }}>
                <TableCell>{exp.date}</TableCell>
                <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {exp.description}
                </TableCell>
                <TableCell>{exp.supplier_name || '—'}</TableCell>
                <TableCell align="right">
                  {parseFloat(exp.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {exp.account_code} {exp.account_name}
                  </Typography>
                </TableCell>
                <TableCell>{PAYMENT_METHOD_LABELS[exp.payment_method] || exp.payment_method}</TableCell>
                <TableCell>{getStatusChip(exp.status)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('common.view')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleView(exp)}>
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleOpen(exp)}>
                      <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {exp.status === 'pending' && (
                    <Tooltip title={t('common.approve')}>
                      <IconButton size="small" sx={{ p: 0.3 }} color="primary" onClick={() => handleApprove(exp.id)}>
                        <ApproveIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={t('common.delete')}>
                    <IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(exp.id)}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('expenses.noExpenses')}</Typography>
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
          labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count: count !== -1 ? count : `>${to}` })}
        />
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('expenses.editExpense') : t('expenses.newExpense')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={`${t('common.date')} *`} type="date" value={form.date} size="small"
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <Autocomplete
              size="small"
              options={suppliers}
              value={selectedSupplier}
              onChange={(_, val) => setForm(prev => ({ ...prev, supplier_id: val?.id || '' }))}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={t('expenses.supplierOptional')} />}
            />
            <TextField
              label={`${t('common.description')} *`} value={form.description} size="small" fullWidth
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
            <TextField
              label={`${t('common.amount')} *`} type="number" value={form.amount} size="small" fullWidth
              onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
              inputProps={{ min: 0, step: '0.01' }}
            />
            <Autocomplete
              size="small"
              options={accounts}
              value={selectedAccount}
              onChange={(_, val) => setForm(prev => ({ ...prev, account_id: val?.id || '' }))}
              getOptionLabel={(o) => `${o.code} — ${o.name}`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={`${t('common.account')} *`} />}
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
            />
            <Autocomplete
              size="small"
              options={taxCodes}
              value={selectedTaxCode}
              onChange={(_, val) => setForm(prev => ({ ...prev, tax_code_id: val?.id || '' }))}
              getOptionLabel={(o) => `${o.code} — ${o.name} (${o.rate}%)`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={t('expenses.taxCodeOptional')} />}
            />
            <TextField
              select label={`${t('expenses.paymentMethod')} *`} value={form.payment_method} size="small"
              onChange={e => setForm(prev => ({ ...prev, payment_method: e.target.value }))}
            >
              {PAYMENT_METHODS.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={t('common.reference')} value={form.reference} size="small" fullWidth
              onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))}
            />
            <Box>
              <Button
                variant="outlined"
                component="label"
                startIcon={<UploadIcon />}
                size="small"
              >
                {receiptFile?.name || (editing?.receipt_filename ? `${t('expenses.currentReceipt')} ${editing.receipt_filename}` : t('expenses.uploadReceipt'))}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  hidden
                  onChange={e => setReceiptFile(e.target.files?.[0] || null)}
                />
              </Button>
              {receiptFile && (
                <Button size="small" sx={{ ml: 1 }} onClick={() => { setReceiptFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                  {t('expenses.removeReceipt')}
                </Button>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.date || !form.description || !form.amount || !form.account_id}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {editing ? t('common.update') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('expenses.expense')}
          {viewing && (
            <Box component="span" sx={{ ml: 2 }}>
              {getStatusChip(viewing.status)}
            </Box>
          )}
        </DialogTitle>
        <DialogContent>
          {viewing && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
              <Box sx={{ display: 'flex', gap: 4 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.date')}</Typography>
                  <Typography variant="body2">{viewing.date}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('expenses.paymentMethod')}</Typography>
                  <Typography variant="body2">{PAYMENT_METHOD_LABELS[viewing.payment_method] || viewing.payment_method}</Typography>
                </Box>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('common.description')}</Typography>
                <Typography variant="body2">{viewing.description}</Typography>
              </Box>
              {viewing.supplier_name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('expenses.supplier')}</Typography>
                  <Typography variant="body2">{viewing.supplier_name}</Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 4 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.amount')}</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600 }}>
                    {parseFloat(viewing.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.account')}</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {viewing.account_code} — {viewing.account_name}
                  </Typography>
                </Box>
              </Box>
              {viewing.tax_code_name && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('expenses.taxCode')}</Typography>
                  <Typography variant="body2">{viewing.tax_code_name}</Typography>
                </Box>
              )}
              {viewing.reference && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.reference')}</Typography>
                  <Typography variant="body2">{viewing.reference}</Typography>
                </Box>
              )}
              {viewing.receipt_filename && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('expenses.receipt')}</Typography>
                  <Typography variant="body2">{viewing.receipt_filename}</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Expenses;
