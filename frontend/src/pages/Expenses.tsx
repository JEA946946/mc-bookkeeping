import React, { useEffect, useState, useRef } from 'react';
import { formatDate } from '../utils/dateFormat';
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
  AddCircleOutline as AddLineIcon, RemoveCircleOutline as RemoveLineIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Supplier {
  id: string;
  name: string;
  default_account_id?: string | null;
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

interface ExpenseLine {
  id?: string;
  description: string;
  account_id: string;
  amount: string;
  tax_code_id: string;
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
  lines?: ExpenseLine[];
  is_split?: boolean;
}

const EMPTY_LINE: ExpenseLine = { description: '', account_id: '', amount: '', tax_code_id: '' };

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  description: '',
  supplier_id: '',
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

  // Form state — header + split lines
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [lines, setLines] = useState<ExpenseLine[]>([{ ...EMPTY_LINE }]);

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
        const full: Expense = res.data.data.expense;
        setEditing(full);
        let supplierId = full.supplier_id || '';
        if (!supplierId && full.account_id) {
          const matched = suppliers.find(s => s.default_account_id === full.account_id);
          if (matched) supplierId = matched.id;
        }
        setForm({
          date: full.date,
          description: full.description,
          supplier_id: supplierId,
          payment_method: full.payment_method || 'bank_transfer',
          reference: full.reference || '',
        });
        const fullLines = full.lines && full.lines.length > 0
          ? full.lines.map(l => ({
              description: l.description || '',
              account_id: l.account_id || '',
              amount: l.amount,
              tax_code_id: l.tax_code_id || '',
            }))
          : [{
              description: '',
              account_id: full.account_id || '',
              amount: full.amount,
              tax_code_id: full.tax_code_id || '',
            }];
        setLines(fullLines);
      }
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setLines([{ ...EMPTY_LINE }]);
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

  const updateLine = (index: number, field: keyof ExpenseLine, value: string) => {
    setLines(prev => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
    if (field === 'account_id' && value && !form.supplier_id) {
      const matched = suppliers.find(s => s.default_account_id === value);
      if (matched) setForm(prev => ({ ...prev, supplier_id: matched.id }));
    }
  };
  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index: number) => setLines(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));

  const total = lines.reduce((sum, l) => sum + (parseFloat(l.amount || '0') || 0), 0);

  const handleSave = async () => {
    setError('');
    const validLines = lines.filter(l => l.account_id && l.amount);
    if (validLines.length === 0) {
      setError(t('expenses.lineRequired'));
      return;
    }
    try {
      const formData = new FormData();
      formData.append('date', form.date);
      formData.append('description', form.description);
      formData.append('payment_method', form.payment_method);
      if (form.supplier_id) formData.append('supplier_id', form.supplier_id);
      if (form.reference) formData.append('reference', form.reference);
      formData.append('lines', JSON.stringify(validLines.map(l => ({
        description: l.description,
        account_id: l.account_id,
        amount: l.amount,
        tax_code_id: l.tax_code_id || '',
      }))));
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
  const acctLabel = (a: Account) => `${a.code} — ${a.name}`;
  const fmtNum = (v: number) => v.toLocaleString(i18n.language, { minimumFractionDigits: 2 });

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
                <TableCell>{formatDate(exp.date)}</TableCell>
                <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {exp.description}
                </TableCell>
                <TableCell>{exp.supplier_name || '—'}</TableCell>
                <TableCell align="right">
                  {parseFloat(exp.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  {exp.is_split ? (
                    <Chip label={t('expenses.split', { count: exp.lines?.length || 0 })} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: '11px' }} />
                  ) : (
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {exp.account_code} {exp.account_name}
                    </Typography>
                  )}
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
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? t('expenses.editExpense') : t('expenses.newExpense')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', gap: 2, mt: 1, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              label={`${t('common.date')} *`} type="date" value={form.date} size="small"
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
            />
            <Autocomplete
              size="small"
              sx={{ minWidth: 220, flex: 1 }}
              options={suppliers}
              value={selectedSupplier}
              onChange={(_, val) => {
                setForm(prev => ({ ...prev, supplier_id: val?.id || '' }));
                if (val?.default_account_id) {
                  setLines(prev => prev.map(l => (l.account_id ? l : { ...l, account_id: val.default_account_id! })));
                }
              }}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={t('expenses.supplierOptional')} />}
            />
            <TextField
              select label={`${t('expenses.paymentMethod')} *`} value={form.payment_method} size="small"
              onChange={e => setForm(prev => ({ ...prev, payment_method: e.target.value }))}
              sx={{ width: 160 }}
            >
              {PAYMENT_METHODS.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
          </Box>
          <TextField
            label={`${t('common.description')} *`} value={form.description} size="small" fullWidth sx={{ mb: 2 }}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
          />

          {/* Split lines */}
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>{t('expenses.splitLines')}</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600, width: '28%' }}>{t('common.description')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '32%' }}>{t('common.account')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '18%' }}>{t('expenses.taxCode')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 120 }}>{t('common.amount')}</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        value={line.description} size="small" fullWidth placeholder={t('common.description')}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <Autocomplete
                        size="small" fullWidth options={accounts}
                        value={accounts.find(a => a.id === line.account_id) || null}
                        onChange={(_e, val) => updateLine(i, 'account_id', val?.id || '')}
                        getOptionLabel={acctLabel}
                        filterOptions={(opts, st) => {
                          const q = st.inputValue.toLowerCase();
                          return (q ? opts.filter(a => a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) : opts).slice(0, 50);
                        }}
                        renderOption={(props, a) => (
                          <li {...props} key={a.id}>
                            <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{a.code}</Typography>
                            {a.name}
                          </li>
                        )}
                        renderInput={(params) => <TextField {...params} placeholder="—" />}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        select value={line.tax_code_id} size="small" fullWidth
                        onChange={e => updateLine(i, 'tax_code_id', e.target.value)}
                      >
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {taxCodes.map(tc => (
                          <MenuItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        value={line.amount} size="small" type="number" sx={{ width: 110 }}
                        onChange={e => updateLine(i, 'amount', e.target.value)}
                        inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                        <RemoveLineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 700 }}>{t('common.total')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtNum(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Button startIcon={<AddLineIcon />} onClick={addLine} size="small" sx={{ mt: 1 }}>
            {t('expenses.addLine')}
          </Button>

          <TextField
            label={t('common.reference')} value={form.reference} size="small" fullWidth sx={{ mt: 2 }}
            onChange={e => setForm(prev => ({ ...prev, reference: e.target.value }))}
          />
          <Box sx={{ mt: 2 }}>
            <Button variant="outlined" component="label" startIcon={<UploadIcon />} size="small">
              {receiptFile?.name || (editing?.receipt_filename ? `${t('expenses.currentReceipt')} ${editing.receipt_filename}` : t('expenses.uploadReceipt'))}
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden
                onChange={e => setReceiptFile(e.target.files?.[0] || null)} />
            </Button>
            {receiptFile && (
              <Button size="small" sx={{ ml: 1 }} onClick={() => { setReceiptFile(null); if (fileRef.current) fileRef.current.value = ''; }}>
                {t('expenses.removeReceipt')}
              </Button>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.date || !form.description || total <= 0}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {editing ? t('common.update') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
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
                  <Typography variant="body2">{formatDate(viewing.date)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('expenses.paymentMethod')}</Typography>
                  <Typography variant="body2">{PAYMENT_METHOD_LABELS[viewing.payment_method] || viewing.payment_method}</Typography>
                </Box>
                {viewing.supplier_name && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{t('expenses.supplier')}</Typography>
                    <Typography variant="body2">{viewing.supplier_name}</Typography>
                  </Box>
                )}
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('common.description')}</Typography>
                <Typography variant="body2">{viewing.description}</Typography>
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('expenses.taxCode')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.amount')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(viewing.lines && viewing.lines.length > 0
                      ? viewing.lines
                      : [{ description: '', account_id: viewing.account_id, amount: viewing.amount, tax_code_id: viewing.tax_code_id || '' }]
                    ).map((l, i) => {
                      const acct = accounts.find(a => a.id === l.account_id);
                      const tc = taxCodes.find(c => c.id === l.tax_code_id);
                      return (
                        <TableRow key={i}>
                          <TableCell>{l.description || '—'}</TableCell>
                          <TableCell>{acct ? `${acct.code} — ${acct.name}` : (viewing.account_code ? `${viewing.account_code} — ${viewing.account_name}` : '—')}</TableCell>
                          <TableCell>{tc ? `${tc.code} (${tc.rate}%)` : '—'}</TableCell>
                          <TableCell align="right">{parseFloat(l.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                      <TableCell colSpan={3} align="right" sx={{ fontWeight: 700 }}>{t('common.total')}:</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {parseFloat(viewing.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
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
