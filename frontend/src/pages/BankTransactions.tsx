import React, { useEffect, useState, useCallback } from 'react';
import { formatDate } from '../utils/dateFormat';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, MenuItem, TablePagination,
  Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete,
  ToggleButtonGroup, ToggleButton, Snackbar, Alert, Tooltip, Chip, IconButton,
} from '@mui/material';
import {
  Download as DownloadIcon, Search as SearchIcon,
  ArrowUpward as ArrowUpIcon, ArrowDownward as ArrowDownIcon,
  AddCircleOutline as AddIcon, RemoveCircleOutline as RemoveLineIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { downloadBlob } from '../utils/csvExport';

interface BankAccount {
  id: string;
  code: string;
  name: string;
}

interface BankTransaction {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  currency: string;
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
}

interface Summary {
  total_debit: string;
  total_credit: string;
  net: string;
}

interface Supplier { id: string; code: string; name: string; default_account_id?: string | null; }
interface Account { id: string; code: string; name: string; }
interface TaxCode { id: string; code: string; name: string; rate: string; }

const BankTransactions: React.FC = () => {
  const { t } = useTranslation();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_debit: '0', total_credit: '0', net: '0' });
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Sort state
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filter state
  const [filterBankAccount, setFilterBankAccount] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Dropdowns for the create dialog
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);

  // Transaction IDs already matched to a bill
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const fetchLinkedIds = useCallback(() => {
    api.get('/bills/linked-transaction-ids')
      .then((r) => { if (r.data.success) setLinkedIds(new Set(r.data.data.linked_ids)); })
      .catch(() => {});
  }, []);

  // Create-from-transaction dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'expense' | 'bill'>('expense');
  const [sourceTxn, setSourceTxn] = useState<BankTransaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [snack, setSnack] = useState<string>('');
  const [form, setForm] = useState({
    date: '', due_date: '', description: '', reference: '', supplier_id: '',
  });
  const [txnLines, setTxnLines] = useState<{ description: string; account_id: string; amount: string; tax_code_id: string }[]>([
    { description: '', account_id: '', amount: '', tax_code_id: '' },
  ]);

  const fetchTransactions = useCallback(async (p: number) => {
    const params = new URLSearchParams();
    params.set('page', String(p + 1));
    params.set('page_size', String(rowsPerPage));
    if (filterBankAccount) params.set('bank_account_id', filterBankAccount);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);
    if (sortField) params.set('sort', sortField);
    if (sortDir) params.set('sort_dir', sortDir);

    try {
      const res = await api.get(`/bank-transactions?${params.toString()}`);
      const data = res.data.data;
      setTransactions(data.transactions);
      setTotalCount(data.total_count);
      setSummary(data.summary);
      if (data.bank_accounts) {
        setBankAccounts(data.bank_accounts);
      }
    } catch { /* ignore */ }
  }, [rowsPerPage, filterBankAccount, filterDateFrom, filterDateTo, filterSearch, sortField, sortDir]);

  useEffect(() => {
    fetchTransactions(page);
  }, [page, fetchTransactions]);

  useEffect(() => {
    api.get('/suppliers').then(r => { if (r.data.success) setSuppliers(r.data.data.suppliers); }).catch(() => {});
    api.get('/accounts?is_active=true').then(r => { if (r.data.success) setAccounts(r.data.data.accounts); }).catch(() => {});
    api.get('/tax-codes').then(r => { if (r.data.success) setTaxCodes(r.data.data.tax_codes); }).catch(() => {});
    fetchLinkedIds();
  }, [fetchLinkedIds]);

  const handleApplyFilters = () => {
    setPage(0);
    fetchTransactions(0);
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filterBankAccount) params.set('bank_account_id', filterBankAccount);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      const res = await api.get(`/bank-transactions/export${qs}`, { responseType: 'blob' });
      downloadBlob(new Blob([res.data]), 'bank_transactions.csv');
    } catch { /* ignore */ }
  };

  const handleSort = (field: string) => {
    const newDir = sortField === field && sortDir === 'desc' ? 'asc' : 'desc';
    setSortField(field);
    setSortDir(newDir);
    setPage(0);
  };

  const openCreate = (txn: BankTransaction) => {
    // A bank "credit" is money out (a payment/expense); fall back to debit.
    const out = parseFloat(txn.credit || '0');
    const amount = (out > 0 ? out : parseFloat(txn.debit || '0')) || 0;
    setSourceTxn(txn);
    setCreateMode('expense');
    setForm({
      date: txn.date,
      due_date: txn.date,
      description: txn.description || '',
      reference: txn.reference || '',
      supplier_id: '',
    });
    setTxnLines([{ description: txn.description || '', account_id: '', amount: amount ? String(amount) : '', tax_code_id: '' }]);
    setCreateOpen(true);
  };

  const handleSupplierChange = (s: Supplier | null) => {
    setForm(prev => ({ ...prev, supplier_id: s?.id || '' }));
    if (s?.default_account_id) {
      setTxnLines(prev => prev.map((l, i) => (i === 0 && !l.account_id ? { ...l, account_id: s.default_account_id! } : l)));
    }
  };

  const updateTxnLine = (index: number, field: string, value: string) => {
    setTxnLines(prev => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };
  const addTxnLine = () => setTxnLines(prev => [...prev, { description: '', account_id: '', amount: '', tax_code_id: '' }]);
  const removeTxnLine = (index: number) => setTxnLines(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  const txnTotal = txnLines.reduce((sum, l) => sum + (parseFloat(l.amount || '0') || 0), 0);

  const handleCreate = async () => {
    const validLines = txnLines.filter(l => l.account_id && l.amount);
    if (validLines.length === 0) { setSnack(t('bankTransactions.accountRequired')); return; }
    if (createMode === 'bill' && !form.supplier_id) { setSnack(t('bankTransactions.supplierRequired')); return; }
    const linesPayload = validLines.map(l => ({
      description: l.description, account_id: l.account_id, amount: l.amount, tax_code_id: l.tax_code_id || '',
    }));
    setSaving(true);
    try {
      if (createMode === 'expense') {
        const fd = new FormData();
        fd.append('date', form.date);
        fd.append('description', form.description || t('bankTransactions.title'));
        fd.append('payment_method', 'bank_transfer');
        if (form.supplier_id) fd.append('supplier_id', form.supplier_id);
        if (form.reference) fd.append('reference', form.reference);
        fd.append('lines', JSON.stringify(linesPayload));
        await api.post('/expenses', fd);
        setSnack(t('bankTransactions.expenseCreated'));
      } else {
        await api.post('/bills/from-transaction', {
          journal_entry_line_id: sourceTxn?.id,
          supplier_id: form.supplier_id,
          date: form.date,
          due_date: form.due_date || form.date,
          description: form.description || t('bankTransactions.title'),
          reference: form.reference,
          lines: linesPayload,
        });
        setSnack(t('bankTransactions.billMatched'));
        fetchLinkedIds();
      }
      setCreateOpen(false);
    } catch (err: any) {
      setSnack(err.response?.data?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const SortHeader = ({ field, label, align }: { field: string; label: string; align?: 'right' }) => (
    <TableCell
      align={align}
      sx={{ fontWeight: 600, cursor: 'pointer', userSelect: 'none', '&:hover': { bgcolor: '#e0e0e0' } }}
      onClick={() => handleSort(field)}
    >
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        {label}
        {sortField === field ? (
          sortDir === 'desc' ? <ArrowDownIcon sx={{ fontSize: 14 }} /> : <ArrowUpIcon sx={{ fontSize: 14 }} />
        ) : null}
      </Box>
    </TableCell>
  );

  const fmt = (val: string) => {
    const n = parseFloat(val);
    if (!n) return '';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtSummary = (val: string) => {
    const n = parseFloat(val);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const acctLabel = (a: Account) => `${a.code} ${a.name}`;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">{t('bankTransactions.title')}</Typography>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} size="small">
          {t('common.exportCsv')}
        </Button>
      </Box>

      {/* Filter bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label={t('bankTransactions.bankAccount')}
          value={filterBankAccount}
          onChange={(e) => setFilterBankAccount(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t('bankTransactions.allAccounts')}</MenuItem>
          {bankAccounts.map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label={t('common.fromDate')}
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          type="date"
          label={t('common.toDate')}
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          label={t('common.search')}
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
          sx={{ width: 180 }}
        />
        <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={handleApplyFilters}>
          {t('common.apply')}
        </Button>
      </Paper>

      {/* Summary bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 3, alignItems: 'center' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">{t('bankTransactions.totalDebits')}</Typography>
          <Typography variant="body2" fontWeight={600}>{fmtSummary(summary.total_debit)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">{t('bankTransactions.totalCredits')}</Typography>
          <Typography variant="body2" fontWeight={600}>{fmtSummary(summary.total_credit)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">{t('bankTransactions.net')}</Typography>
          <Typography variant="body2" fontWeight={600}>{fmtSummary(summary.net)}</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">{t('bankTransactions.clickHint')}</Typography>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <SortHeader field="date" label={t('common.date')} />
              <SortHeader field="entry_number" label={t('accounts.entryNumber')} />
              <SortHeader field="description" label={t('common.description')} />
              <SortHeader field="reference" label={t('common.reference')} />
              <SortHeader field="bank_account" label={t('bankTransactions.bankAccount')} />
              <SortHeader field="debit" label={t('common.debit')} align="right" />
              <SortHeader field="credit" label={t('common.credit')} align="right" />
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {t('bankTransactions.noTransactions')}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => {
                const matched = linkedIds.has(txn.id);
                return (
                <TableRow
                  key={txn.id}
                  hover
                  onClick={() => { if (!matched) openCreate(txn); }}
                  sx={{ cursor: matched ? 'default' : 'pointer', ...(matched ? { bgcolor: '#f1f8e9' } : {}) }}
                >
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(txn.date)}</TableCell>
                  <TableCell>{txn.entry_number}</TableCell>
                  <TableCell>{txn.description}</TableCell>
                  <TableCell>{txn.reference}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.bank_account_code} - {txn.bank_account_name}</TableCell>
                  <TableCell align="right">{fmt(txn.debit)}</TableCell>
                  <TableCell align="right">{fmt(txn.credit)}</TableCell>
                  <TableCell align="right">
                    {matched ? (
                      <Chip size="small" color="success" variant="outlined" label={t('bankTransactions.matched')} sx={{ height: 22 }} />
                    ) : (
                      <Tooltip title={t('bankTransactions.createFromTxn')}>
                        <Button
                          size="small"
                          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                          onClick={(e) => { e.stopPropagation(); openCreate(txn); }}
                        >
                          {t('bankTransactions.create')}
                        </Button>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage={t('common.rowsPerPage')}
          labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
        />
      </TableContainer>

      {/* Create-from-transaction dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('bankTransactions.createFromTxn')}</DialogTitle>
        <DialogContent>
          {sourceTxn && (
            <Box sx={{ mb: 2, mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {formatDate(sourceTxn.date)} · {sourceTxn.description || '—'} · {sourceTxn.bank_account_code}
              </Typography>
            </Box>
          )}

          <ToggleButtonGroup
            color="primary"
            exclusive
            size="small"
            value={createMode}
            onChange={(_, v) => v && setCreateMode(v)}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="expense">{t('bankTransactions.expense')}</ToggleButton>
            <ToggleButton value="bill">{t('bankTransactions.bill')}</ToggleButton>
          </ToggleButtonGroup>

          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              label={t('common.date')} type="date" size="small" value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            />
            {createMode === 'bill' && (
              <TextField
                label={t('bills.dueDate')} type="date" size="small" value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
              />
            )}
            <Autocomplete
              options={suppliers}
              getOptionLabel={(s) => `${s.code} — ${s.name}`}
              value={suppliers.find((s) => s.id === form.supplier_id) || null}
              onChange={(_, v) => handleSupplierChange(v)}
              filterOptions={(opts, st) => {
                const q = st.inputValue.toLowerCase();
                return (q ? opts.filter((s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) : opts).slice(0, 50);
              }}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              sx={{ minWidth: 240, flex: 1 }}
              renderInput={(p) => (
                <TextField {...p} size="small"
                  label={t('bills.supplier') + (createMode === 'bill' ? ' *' : ` (${t('common.optional')})`)}
                />
              )}
            />
          </Box>

          <TextField
            label={t('common.description')} size="small" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth sx={{ mb: 2 }}
          />

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600, width: '28%' }}>{t('common.description')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '32%' }}>{t('common.account')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '18%' }}>{t('bills.taxCode')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 120 }}>{t('common.amount')}</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {txnLines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField value={line.description} size="small" fullWidth placeholder={t('common.description')}
                        onChange={(e) => updateTxnLine(i, 'description', e.target.value)} />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <Autocomplete
                        size="small" fullWidth options={accounts}
                        value={accounts.find((a) => a.id === line.account_id) || null}
                        onChange={(_e, v) => updateTxnLine(i, 'account_id', v?.id || '')}
                        getOptionLabel={acctLabel}
                        filterOptions={(opts, st) => {
                          const q = st.inputValue.toLowerCase();
                          return (q ? opts.filter((a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) : opts).slice(0, 50);
                        }}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        renderInput={(p) => <TextField {...p} placeholder="—" />}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField select value={line.tax_code_id} size="small" fullWidth
                        onChange={(e) => updateTxnLine(i, 'tax_code_id', e.target.value)}>
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {taxCodes.map((tc) => (
                          <MenuItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField value={line.amount} size="small" type="number" sx={{ width: 110 }}
                        onChange={(e) => updateTxnLine(i, 'amount', e.target.value)}
                        inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <IconButton size="small" onClick={() => removeTxnLine(i)} disabled={txnLines.length <= 1}>
                        <RemoveLineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 700 }}>{t('common.total')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {txnTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })} {sourceTxn?.currency}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
            <Button startIcon={<AddIcon sx={{ fontSize: 18 }} />} onClick={addTxnLine} size="small">
              {t('expenses.addLine')}
            </Button>
            {sourceTxn && (
              <Typography variant="caption" color={txnTotal.toFixed(2) === (parseFloat(sourceTxn.credit || '0') || parseFloat(sourceTxn.debit || '0')).toFixed(2) ? 'text.secondary' : 'warning.main'}>
                {t('bankTransactions.txnAmount')}: {(parseFloat(sourceTxn.credit || '0') || parseFloat(sourceTxn.debit || '0')).toLocaleString(undefined, { minimumFractionDigits: 2 })} {sourceTxn.currency}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving} sx={{ bgcolor: '#2e7d32' }}>
            {createMode === 'expense' ? t('bankTransactions.createExpense') : t('bankTransactions.createBill')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snack}
        autoHideDuration={4000}
        onClose={() => setSnack('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setSnack('')} sx={{ width: '100%' }}>{snack}</Alert>
      </Snackbar>
    </Box>
  );
};

export default BankTransactions;
