import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Tooltip, TablePagination,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  RemoveRedEye as ViewIcon, CheckCircle as ApproveIcon,
  AddCircleOutline as AddLineIcon, RemoveCircleOutline as RemoveLineIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { downloadBlob } from '../utils/csvExport';

interface Supplier {
  id: string;
  code: string;
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

interface BillLine {
  id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  account_id: string;
  tax_code_id: string;
  amount: string;
}

interface Bill {
  id: string;
  bill_number: string;
  supplier_id: string;
  supplier_name: string;
  date: string;
  due_date: string;
  reference: string;
  notes: string;
  status: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  amount_paid: string;
  lines?: BillLine[];
}

const STATUS_COLORS: Record<string, 'default' | 'primary' | 'success' | 'error'> = {
  draft: 'default',
  approved: 'primary',
  paid: 'success',
  overdue: 'error',
};

const EMPTY_LINE: BillLine = {
  description: '',
  quantity: '1',
  unit_price: '0',
  account_id: '',
  tax_code_id: '',
  amount: '0',
};

const Bills: React.FC = () => {
  const { t, i18n } = useTranslation();

  const STATUS_LABELS: Record<string, string> = {
    draft: t('bills.draft'),
    approved: t('bills.approved'),
    paid: t('bills.paid'),
    overdue: t('bills.overdue'),
  };

  const [bills, setBills] = useState<Bill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [viewing, setViewing] = useState<Bill | null>(null);

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Form state
  const [form, setForm] = useState({
    supplier_id: '',
    date: '',
    due_date: '',
    reference: '',
    notes: '',
  });
  const [lines, setLines] = useState<BillLine[]>([{ ...EMPTY_LINE }]);

  const fetchBills = (p?: number) => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterSupplier) params.set('supplier_id', filterSupplier);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    const currentPage = p !== undefined ? p : page;
    params.set('page', String(currentPage + 1));
    params.set('page_size', String(rowsPerPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/bills${qs}`).then(res => {
      if (res.data.success) {
        setBills(res.data.data.bills);
        setTotalCount(res.data.data.total_count ?? res.data.data.count ?? 0);
      }
    });
  };

  const fetchDropdowns = () => {
    api.get('/suppliers').then(res => {
      if (res.data.success) setSuppliers(res.data.data.suppliers);
    });
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) setAccounts(res.data.data.accounts);
    });
    api.get('/tax-codes').then(res => {
      if (res.data.success) setTaxCodes(res.data.data.tax_codes);
    });
  };

  useEffect(() => {
    fetchBills();
    fetchDropdowns();
  }, []);

  const handleApplyFilters = () => {
    setPage(0);
    fetchBills(0);
  };

  const handleExportBills = async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterSupplier) params.set('supplier_id', filterSupplier);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      const res = await api.get(`/bills/export${qs}`, { responseType: 'blob' });
      downloadBlob(new Blob([res.data]), 'bills.csv');
    } catch { /* ignore */ }
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    fetchBills(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    setTimeout(() => fetchBills(0), 0);
  };

  const recalcLineAmount = (line: BillLine): string => {
    const qty = parseFloat(line.quantity || '0');
    const price = parseFloat(line.unit_price || '0');
    return (qty * price).toFixed(2);
  };

  const handleOpen = async (bill?: Bill) => {
    if (bill) {
      const res = await api.get(`/bills/${bill.id}`);
      if (res.data.success) {
        const full = res.data.data.bill;
        setEditing(full);
        setForm({
          supplier_id: full.supplier_id,
          date: full.date,
          due_date: full.due_date,
          reference: full.reference || '',
          notes: full.notes || '',
        });
        setLines(
          full.lines && full.lines.length > 0
            ? full.lines.map((l: BillLine) => ({
                description: l.description,
                quantity: l.quantity,
                unit_price: l.unit_price,
                account_id: l.account_id,
                tax_code_id: l.tax_code_id || '',
                amount: l.amount,
              }))
            : [{ ...EMPTY_LINE }]
        );
      }
    } else {
      setEditing(null);
      setForm({
        supplier_id: '',
        date: new Date().toISOString().split('T')[0],
        due_date: '',
        reference: '',
        notes: '',
      });
      setLines([{ ...EMPTY_LINE }]);
    }
    setDialogOpen(true);
  };

  const handleView = async (bill: Bill) => {
    const res = await api.get(`/bills/${bill.id}`);
    if (res.data.success) {
      setViewing(res.data.data.bill);
      setViewDialogOpen(true);
    }
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      lines: lines.filter(l => l.description || l.account_id),
    };
    try {
      if (editing) {
        await api.put(`/bills/${editing.id}`, payload);
      } else {
        await api.post('/bills', payload);
      }
      setDialogOpen(false);
      fetchBills();
    } catch (err: any) {
      alert(err.response?.data?.message || t('bills.errorSaving'));
    }
  };

  const handleDelete = async (id: string) => {
    const bill = bills.find(b => b.id === id);
    if (!confirm(t('bills.deleteConfirm', { number: bill?.bill_number || id }))) return;
    try {
      await api.delete(`/bills/${id}`);
      fetchBills();
    } catch (err: any) {
      alert(err.response?.data?.message || t('bills.errorDeleting'));
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/bills/${id}/approve`);
      fetchBills();
    } catch (err: any) {
      alert(err.response?.data?.message || t('bills.errorApproving'));
    }
  };

  const updateLine = (index: number, field: keyof BillLine, value: string) => {
    setLines(prev =>
      prev.map((l, i) => {
        if (i !== index) return l;
        const updated = { ...l, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updated.amount = recalcLineAmount(updated);
        }
        return updated;
      })
    );
  };

  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const subtotal = lines.reduce((sum, l) => sum + parseFloat(l.amount || '0'), 0);
  const taxAmount = lines.reduce((sum, l) => {
    const amt = parseFloat(l.amount || '0');
    if (l.tax_code_id) {
      const tc = taxCodes.find(t => t.id === l.tax_code_id);
      if (tc) return sum + amt * (parseFloat(tc.rate) / 100);
    }
    return sum;
  }, 0);
  const total = subtotal + taxAmount;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('bills.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportBills} size="small">
            {t('importExport.export')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
            {t('bills.newBill')}
          </Button>
        </Box>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select label={t('common.status')} value={filterStatus} size="small"
          onChange={e => setFilterStatus(e.target.value)}
          sx={{ width: 140 }}
        >
          <MenuItem value="">{t('common.all')}</MenuItem>
          <MenuItem value="draft">{t('bills.draft')}</MenuItem>
          <MenuItem value="approved">{t('bills.approved')}</MenuItem>
          <MenuItem value="paid">{t('bills.paid')}</MenuItem>
          <MenuItem value="overdue">{t('bills.overdue')}</MenuItem>
        </TextField>
        <TextField
          select label={t('bills.supplier')} value={filterSupplier} size="small"
          onChange={e => setFilterSupplier(e.target.value)}
          sx={{ width: 200 }}
        >
          <MenuItem value="">{t('bills.allSuppliers')}</MenuItem>
          {suppliers.map(s => (
            <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('common.from')} type="date" value={filterDateFrom} size="small"
          onChange={e => setFilterDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 140 }}
        />
        <TextField
          label={t('common.to')} type="date" value={filterDateTo} size="small"
          onChange={e => setFilterDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 140 }}
        />
        <Button variant="outlined" size="small" onClick={handleApplyFilters}>
          {t('common.apply')}
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('bills.billNumber')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('bills.supplier')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('bills.dueDate')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.subtotal')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.tax')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.total')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('bills.amountPaid')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.status')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {bills.map(bill => (
              <TableRow key={bill.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                    {bill.bill_number}
                  </Typography>
                </TableCell>
                <TableCell>{bill.supplier_name}</TableCell>
                <TableCell>{bill.date}</TableCell>
                <TableCell>{bill.due_date}</TableCell>
                <TableCell align="right">
                  {parseFloat(bill.subtotal).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell align="right">
                  {parseFloat(bill.tax_amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {parseFloat(bill.total).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell align="right">
                  {parseFloat(bill.amount_paid).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </TableCell>
                <TableCell>
                  <Chip
                    label={STATUS_LABELS[bill.status] || bill.status}
                    size="small"
                    color={STATUS_COLORS[bill.status] || 'default'}
                    sx={{ height: 20, fontSize: '11px' }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('common.view')}>
                    <IconButton size="small" onClick={() => handleView(bill)}>
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {bill.status === 'draft' && (
                    <Tooltip title={t('common.edit')}>
                      <IconButton size="small" onClick={() => handleOpen(bill)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {(bill.status === 'draft' || bill.status === 'approved') && (
                    <Tooltip title={t('common.approve')}>
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleApprove(bill.id)}
                          disabled={bill.status !== 'draft'}
                        >
                          <ApproveIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  )}
                  {bill.status === 'draft' && (
                    <Tooltip title={t('common.delete')}>
                      <IconButton size="small" color="error" onClick={() => handleDelete(bill.id)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {bills.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('bills.noBills')}</Typography>
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
        />
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editing ? t('bills.editBill', { number: editing.bill_number }) : t('bills.newBill')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 2, mt: 1, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              select label={t('bills.supplier')} value={form.supplier_id} size="small"
              onChange={e => setForm({ ...form, supplier_id: e.target.value })}
              sx={{ width: 250 }}
            >
              {suppliers.map(s => (
                <MenuItem key={s.id} value={s.id}>{s.code} — {s.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={t('common.date')} type="date" value={form.date} size="small"
              onChange={e => setForm({ ...form, date: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            />
            <TextField
              label={t('bills.dueDate')} type="date" value={form.due_date} size="small"
              onChange={e => setForm({ ...form, due_date: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            />
            <TextField
              label={t('common.reference')} value={form.reference} size="small" sx={{ width: 180 }}
              onChange={e => setForm({ ...form, reference: e.target.value })}
            />
          </Box>
          <TextField
            label={t('bills.remarks')} value={form.notes} size="small" fullWidth multiline rows={2} sx={{ mb: 2 }}
            onChange={e => setForm({ ...form, notes: e.target.value })}
          />

          {/* Lines */}
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>{t('bills.billLines')}</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600, width: '25%' }}>{t('common.description')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 80 }}>{t('bills.quantity')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 110 }}>{t('bills.unitPrice')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '20%' }}>{t('common.account')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: '15%' }}>{t('bills.taxCode')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 110 }}>{t('common.amount')}</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        value={line.description} size="small" fullWidth
                        onChange={e => updateLine(i, 'description', e.target.value)}
                        placeholder={t('common.description')}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        value={line.quantity} size="small" type="number" sx={{ width: 80 }}
                        onChange={e => updateLine(i, 'quantity', e.target.value)}
                        inputProps={{ min: 0, step: '1' }}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        value={line.unit_price} size="small" type="number" sx={{ width: 110 }}
                        onChange={e => updateLine(i, 'unit_price', e.target.value)}
                        inputProps={{ min: 0, step: '0.01' }}
                      />
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        select value={line.account_id} size="small" fullWidth
                        onChange={e => updateLine(i, 'account_id', e.target.value)}
                      >
                        <MenuItem value="">—</MenuItem>
                        {accounts.map(a => (
                          <MenuItem key={a.id} value={a.id}>
                            <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{a.code}</Typography>
                            {a.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <TextField
                        select value={line.tax_code_id} size="small" fullWidth
                        onChange={e => updateLine(i, 'tax_code_id', e.target.value)}
                      >
                        <MenuItem value="">{t('common.none')}</MenuItem>
                        {taxCodes.map(tc => (
                          <MenuItem key={tc.id} value={tc.id}>
                            {tc.code} ({tc.rate}%)
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }} align="right">
                      <Typography variant="body2" sx={{ lineHeight: '40px', fontWeight: 500 }}>
                        {parseFloat(line.amount || '0').toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ p: 0.5 }}>
                      <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                        <RemoveLineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Totals */}
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{t('common.subtotal')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {subtotal.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{t('common.tax')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {taxAmount.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>{t('common.total')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {total.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Button startIcon={<AddLineIcon />} onClick={addLine} size="small" sx={{ mt: 1 }}>
            {t('bills.addLine')}
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#2e7d32' }}>
            {editing ? t('common.update') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {viewing?.bill_number} — {viewing?.supplier_name}
          <Chip
            label={STATUS_LABELS[viewing?.status || ''] || viewing?.status}
            size="small"
            color={STATUS_COLORS[viewing?.status || ''] || 'default'}
            sx={{ ml: 2 }}
          />
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 3, mb: 2, mt: 1 }}>
            <Typography variant="body2"><strong>{t('common.date')}:</strong> {viewing?.date}</Typography>
            <Typography variant="body2"><strong>{t('bills.dueDate')}:</strong> {viewing?.due_date}</Typography>
            {viewing?.reference && (
              <Typography variant="body2"><strong>{t('common.reference')}:</strong> {viewing.reference}</Typography>
            )}
          </Box>
          {viewing?.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {viewing.notes}
            </Typography>
          )}
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('bills.quantity')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('bills.unitPrice')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('bills.taxCode')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.amount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {viewing?.lines?.map((line, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{line.description}</TableCell>
                    <TableCell align="right">{line.quantity}</TableCell>
                    <TableCell align="right">
                      {parseFloat(line.unit_price).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const acct = accounts.find(a => a.id === line.account_id);
                        return acct ? `${acct.code} — ${acct.name}` : line.account_id;
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const tc = taxCodes.find(t => t.id === line.tax_code_id);
                        return tc ? `${tc.code} (${tc.rate}%)` : '—';
                      })()}
                    </TableCell>
                    <TableCell align="right">
                      {parseFloat(line.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{t('common.subtotal')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {viewing ? parseFloat(viewing.subtotal).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{t('common.tax')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {viewing ? parseFloat(viewing.tax_amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 700 }}>{t('common.total')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {viewing ? parseFloat(viewing.total).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} align="right" sx={{ fontWeight: 600 }}>{t('bills.amountPaid')}:</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {viewing ? parseFloat(viewing.amount_paid).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Bills;
