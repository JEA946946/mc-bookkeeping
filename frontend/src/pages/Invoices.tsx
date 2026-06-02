import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { formatDate } from '../utils/dateFormat';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Tooltip, TablePagination,
  Autocomplete, Divider, Alert, CircularProgress, InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  RemoveRedEye as ViewIcon, Send as SendIcon, CheckCircle as PostIcon,
  AddCircleOutline as AddLineIcon, RemoveCircleOutline as RemoveLineIcon,
  Search as SearchIcon, Download as DownloadIcon,
  CloudDownload as CmrIcon, CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { downloadBlob } from '../utils/csvExport';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Customer {
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

interface InvoiceLine {
  id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  tax_code_id: string | null;
  tax_code_name?: string;
  tax_code_rate?: string;
  amount?: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_code?: string;
  customer_name?: string;
  date: string;
  due_date: string;
  notes: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  subtotal: string;
  tax_amount: string;
  total: string;
  amount_paid: string;
  exchange_rate: string;
  vat_quarter?: number;
  vat_year?: number;
  lines?: InvoiceLine[];
}

interface CMRInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  customer_name: string;
  customer_id: string;
  opportunity_title: string;
  trip_reference: string;
  total: string;
  currency: string;
  status: string;
  line_items: { category?: string; description?: string; amount?: number }[];
  already_imported: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_LINE: InvoiceLine = {
  description: '',
  quantity: '1',
  unit_price: '0',
  account_id: '',
  tax_code_id: null,
};

const STATUS_CHIP_COLOR: Record<string, 'default' | 'primary' | 'success' | 'error'> = {
  draft: 'default',
  sent: 'primary',
  paid: 'success',
  overdue: 'error',
  cancelled: 'default',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// fmt is defined inside the component to access i18n.language

const computeLineAmount = (line: InvoiceLine): number => {
  const qty = parseFloat(line.quantity || '0');
  const price = parseFloat(line.unit_price || '0');
  return qty * price;
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const Invoices: React.FC = () => {
  const { t, i18n } = useTranslation();

  const fmt = (v: string | number) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (isNaN(n)) return '0,00';
    return n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ---------- translated lookups (depend on t) ---------- */
  const STATUS_OPTIONS = [
    { value: '', label: t('common.all') },
    { value: 'draft', label: t('invoices.draft') },
    { value: 'sent', label: t('invoices.sent') },
    { value: 'paid', label: t('invoices.paidStatus') },
    { value: 'overdue', label: t('invoices.overdue') },
    { value: 'cancelled', label: t('invoices.cancelled') },
  ];

  const STATUS_LABELS: Record<string, string> = {
    draft: t('invoices.draft'),
    sent: t('invoices.sent'),
    paid: t('invoices.paidStatus'),
    overdue: t('invoices.overdue'),
    cancelled: t('invoices.cancelled'),
  };

  /* ---------- list state ---------- */
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  /* ---------- lookup data ---------- */
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);

  /* ---------- filter state ---------- */
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterVatQuarter, setFilterVatQuarter] = useState('');
  const [filterVatYear, setFilterVatYear] = useState('');

  /* ---------- dialog state ---------- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [error, setError] = useState('');

  /* ---------- CMR picker state ---------- */
  const [cmrOpen, setCmrOpen] = useState(false);
  const [cmrInvoices, setCmrInvoices] = useState<CMRInvoice[]>([]);
  const [cmrLoading, setCmrLoading] = useState(false);
  const [cmrError, setCmrError] = useState('');
  const [cmrSearch, setCmrSearch] = useState('');
  const [debouncedCmrSearch, setDebouncedCmrSearch] = useState('');
  const cmrDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [cmrImporting, setCmrImporting] = useState<string | null>(null);

  /* ---------- form state ---------- */
  const [formCustomer, setFormCustomer] = useState<Customer | null>(null);
  const [formDate, setFormDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formExchangeRate, setFormExchangeRate] = useState('1');
  const [formVatQuarter, setFormVatQuarter] = useState('1');
  const [formVatYear, setFormVatYear] = useState(String(new Date().getFullYear()));
  const [lines, setLines] = useState<InvoiceLine[]>([{ ...EMPTY_LINE }]);

  /* ================================================================ */
  /*  Data fetching                                                    */
  /* ================================================================ */

  const fetchInvoices = useCallback((p?: number) => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterCustomerId) params.set('customer_id', filterCustomerId);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);
    if (filterVatQuarter) params.set('vat_quarter', filterVatQuarter);
    if (filterVatYear) params.set('vat_year', filterVatYear);
    const currentPage = p !== undefined ? p : page;
    params.set('page', String(currentPage + 1));
    params.set('page_size', String(rowsPerPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/invoices${qs}`).then(res => {
      if (res.data.success) {
        setInvoices(res.data.invoices ?? res.data.data?.invoices ?? []);
        setTotalCount(res.data.total_count ?? res.data.data?.total_count ?? res.data.invoices?.length ?? 0);
      }
    });
  }, [filterStatus, filterCustomerId, filterDateFrom, filterDateTo, filterSearch, filterVatQuarter, filterVatYear, page, rowsPerPage]);

  const fetchLookups = () => {
    api.get('/customers').then(res => {
      if (res.data.success) setCustomers(res.data.customers ?? res.data.data?.customers ?? []);
    });
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) setAccounts(res.data.accounts ?? res.data.data?.accounts ?? []);
    });
    api.get('/tax-codes').then(res => {
      if (res.data.success) setTaxCodes(res.data.tax_codes ?? res.data.data?.tax_codes ?? []);
    });
  };

  useEffect(() => {
    fetchInvoices();
    fetchLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ================================================================ */
  /*  Filter / pagination handlers                                     */
  /* ================================================================ */

  const handleApplyFilters = () => {
    setPage(0);
    fetchInvoices(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    fetchInvoices(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    setTimeout(() => fetchInvoices(0), 0);
  };

  const handleExportInvoices = async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterCustomerId) params.set('customer_id', filterCustomerId);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterVatQuarter) params.set('vat_quarter', filterVatQuarter);
    if (filterVatYear) params.set('vat_year', filterVatYear);
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      const res = await api.get(`/invoices/export${qs}`, { responseType: 'blob' });
      downloadBlob(new Blob([res.data]), 'invoices.csv');
    } catch { /* ignore */ }
  };

  /* ================================================================ */
  /*  CMR Picker                                                       */
  /* ================================================================ */

  const handleCmrSearchChange = (val: string) => {
    setCmrSearch(val);
    if (cmrDebounceRef.current) clearTimeout(cmrDebounceRef.current);
    cmrDebounceRef.current = setTimeout(() => setDebouncedCmrSearch(val), 150);
  };

  const filteredCmrInvoices = useMemo(() => {
    if (!debouncedCmrSearch) return cmrInvoices;
    const q = debouncedCmrSearch.toLowerCase();
    return cmrInvoices.filter(
      inv =>
        (inv.invoice_number || '').toLowerCase().includes(q) ||
        (inv.customer_name || '').toLowerCase().includes(q) ||
        (inv.opportunity_title || '').toLowerCase().includes(q) ||
        (inv.trip_reference || '').toLowerCase().includes(q)
    );
  }, [cmrInvoices, debouncedCmrSearch]);

  const displayedCmrInvoices = useMemo(() => filteredCmrInvoices.slice(0, 50), [filteredCmrInvoices]);

  const openCmrPicker = async () => {
    setCmrOpen(true);
    setCmrLoading(true);
    setCmrError('');
    setCmrSearch('');
    setDebouncedCmrSearch('');
    try {
      const res = await api.get('/cmr/invoices');
      if (res.data.success) {
        setCmrInvoices(res.data.data?.invoices ?? []);
      } else {
        setCmrError(res.data.message || t('invoices.cmrFetchError'));
      }
    } catch {
      setCmrError(t('invoices.cmrFetchError'));
    } finally {
      setCmrLoading(false);
    }
  };

  const handleCmrImport = async (inv: CMRInvoice) => {
    setCmrImporting(inv.id);
    try {
      const res = await api.post('/cmr/invoices/import', { cmr_invoice_id: inv.id });
      if (res.data.success) {
        setCmrInvoices(prev =>
          prev.map(i => i.id === inv.id ? { ...i, already_imported: true } : i)
        );
        fetchInvoices();
      } else {
        alert(res.data.message || t('invoices.importError'));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || t('invoices.importError'));
    } finally {
      setCmrImporting(null);
    }
  };

  /* ================================================================ */
  /*  Create / Edit dialog                                             */
  /* ================================================================ */

  const handleOpen = async (invoice?: Invoice) => {
    setError('');
    if (invoice) {
      try {
        const res = await api.get(`/invoices/${invoice.id}`);
        if (res.data.success) {
          const full: Invoice = res.data.invoice ?? res.data.data?.invoice;
          setEditing(full);
          setFormCustomer(customers.find(c => c.id === full.customer_id) || null);
          setFormDate(full.date);
          setFormDueDate(full.due_date);
          setFormNotes(full.notes || '');
          setFormExchangeRate(full.exchange_rate || '1');
          setFormVatQuarter(String(full.vat_quarter ?? 1));
          setFormVatYear(String(full.vat_year ?? new Date().getFullYear()));
          setLines(
            (full.lines || []).map((l: InvoiceLine) => ({
              description: l.description,
              quantity: l.quantity,
              unit_price: l.unit_price,
              account_id: l.account_id,
              tax_code_id: l.tax_code_id ?? null,
            }))
          );
        }
      } catch (err: any) {
        alert(err.response?.data?.message || t('invoices.errorFetching'));
        return;
      }
    } else {
      setEditing(null);
      setFormCustomer(null);
      const today = new Date();
      const autoQuarter = Math.floor(today.getMonth() / 3) + 1;
      setFormDate(today.toISOString().split('T')[0]);
      setFormDueDate('');
      setFormNotes('');
      setFormExchangeRate('1');
      setFormVatQuarter(String(autoQuarter));
      setFormVatYear(String(today.getFullYear()));
      setLines([{ ...EMPTY_LINE }]);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setError('');
    if (!formCustomer) {
      setError(t('invoices.selectCustomer'));
      return;
    }
    if (!formDate) {
      setError(t('invoices.selectDate'));
      return;
    }
    if (!formDueDate) {
      setError(t('invoices.selectDueDate'));
      return;
    }
    const validLines = lines.filter(l => l.description && l.account_id);
    if (validLines.length === 0) {
      setError(t('invoices.addAtLeastOneLine'));
      return;
    }

    const payload = {
      customer_id: formCustomer.id,
      date: formDate,
      due_date: formDueDate,
      notes: formNotes,
      exchange_rate: formExchangeRate,
      vat_quarter: parseInt(formVatQuarter, 10),
      vat_year: parseInt(formVatYear, 10),
      lines: validLines.map(l => ({
        description: l.description,
        quantity: parseFloat(l.quantity || '0'),
        unit_price: parseFloat(l.unit_price || '0'),
        account_id: l.account_id,
        tax_code_id: l.tax_code_id || null,
      })),
    };

    try {
      if (editing) {
        await api.put(`/invoices/${editing.id}`, payload);
      } else {
        await api.post('/invoices', payload);
      }
      setDialogOpen(false);
      fetchInvoices();
    } catch (err: any) {
      setError(err.response?.data?.message || t('invoices.errorSaving'));
    }
  };

  /* ================================================================ */
  /*  View dialog                                                      */
  /* ================================================================ */

  const handleView = async (invoice: Invoice) => {
    try {
      const res = await api.get(`/invoices/${invoice.id}`);
      if (res.data.success) {
        setViewing(res.data.invoice ?? res.data.data?.invoice);
        setViewDialogOpen(true);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || t('invoices.errorFetching'));
    }
  };

  /* ================================================================ */
  /*  Actions                                                          */
  /* ================================================================ */

  const handleDelete = async (id: string) => {
    if (!confirm(t('invoices.deleteConfirm'))) return;
    try {
      await api.delete(`/invoices/${id}`);
      fetchInvoices();
    } catch (err: any) {
      alert(err.response?.data?.message || t('invoices.errorDeleting'));
    }
  };

  const handlePost = async (id: string) => {
    try {
      await api.post(`/invoices/${id}/post`);
      fetchInvoices();
    } catch (err: any) {
      alert(err.response?.data?.message || t('invoices.errorPosting'));
    }
  };

  const handleSend = async (id: string) => {
    try {
      await api.post(`/invoices/${id}/send`);
      fetchInvoices();
    } catch (err: any) {
      alert(err.response?.data?.message || t('invoices.errorSending'));
    }
  };

  /* ================================================================ */
  /*  Line helpers                                                     */
  /* ================================================================ */

  const updateLine = (index: number, field: keyof InvoiceLine, value: string | null) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);

  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  /* ---------- totals ---------- */
  const subtotal = lines.reduce((sum, l) => sum + computeLineAmount(l), 0);

  const taxTotal = lines.reduce((sum, l) => {
    if (!l.tax_code_id) return sum;
    const tc = taxCodes.find(t => t.id === l.tax_code_id);
    if (!tc) return sum;
    const rate = parseFloat(tc.rate || '0') / 100;
    return sum + computeLineAmount(l) * rate;
  }, 0);

  const grandTotal = subtotal + taxTotal;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <Box>
      {/* ============================================================ */}
      {/* Header                                                        */}
      {/* ============================================================ */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('invoices.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportInvoices} size="small">
            {t('importExport.export')}
          </Button>
          <Button variant="outlined" startIcon={<CmrIcon />} onClick={openCmrPicker} size="small" color="success">
            {t('invoices.fetchFromCmr')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
            {t('invoices.newInvoice')}
          </Button>
        </Box>
      </Box>

      {/* ============================================================ */}
      {/* Filter bar                                                    */}
      {/* ============================================================ */}
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
          select label={t('invoices.customer')} value={filterCustomerId} size="small"
          onChange={e => setFilterCustomerId(e.target.value)}
          sx={{ width: 200 }}
        >
          <MenuItem value="">{t('invoices.allCustomers')}</MenuItem>
          {customers.map(c => (
            <MenuItem key={c.id} value={c.id}>{c.code} &mdash; {c.name}</MenuItem>
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
          sx={{ width: 180 }}
          InputProps={{ endAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /> }}
        />
        <TextField
          select label={t('invoices.vatQuarter')} value={filterVatQuarter} size="small"
          onChange={e => setFilterVatQuarter(e.target.value)}
          sx={{ width: 100 }}
        >
          <MenuItem value="">{t('common.all')}</MenuItem>
          <MenuItem value="1">Q1</MenuItem>
          <MenuItem value="2">Q2</MenuItem>
          <MenuItem value="3">Q3</MenuItem>
          <MenuItem value="4">Q4</MenuItem>
        </TextField>
        <TextField
          label={t('invoices.vatYear')} type="number" value={filterVatYear} size="small"
          onChange={e => setFilterVatYear(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
          sx={{ width: 90 }}
        />
        <Button variant="outlined" size="small" onClick={handleApplyFilters}>
          {t('common.apply')}
        </Button>
      </Paper>

      {/* ============================================================ */}
      {/* Invoice table                                                 */}
      {/* ============================================================ */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('invoices.invoiceNumber')}</TableCell>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('invoices.customer')}</TableCell>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.date')}</TableCell>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('invoices.dueDate')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.subtotal')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.tax')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.total')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('invoices.paid')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('invoices.exchangeRate')}</TableCell>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.status')}</TableCell>
              <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('invoices.vatQuarter')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invoices.map(inv => (
              <TableRow key={inv.id} hover sx={{ '& td': { whiteSpace: 'nowrap' } }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                    {inv.invoice_number}
                  </Typography>
                </TableCell>
                <TableCell>
                  {inv.customer_code && (
                    <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 0.5 }}>
                      {inv.customer_code}
                    </Typography>
                  )}
                  {inv.customer_name}
                </TableCell>
                <TableCell>{formatDate(inv.date)}</TableCell>
                <TableCell>{formatDate(inv.due_date)}</TableCell>
                <TableCell align="right">{fmt(inv.subtotal)}</TableCell>
                <TableCell align="right">{fmt(inv.tax_amount)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(inv.total)}</TableCell>
                <TableCell align="right">{fmt(inv.amount_paid)}</TableCell>
                <TableCell align="right">{inv.exchange_rate && inv.exchange_rate !== '1.0000' ? inv.exchange_rate : ''}</TableCell>
                <TableCell>
                  <Chip
                    label={STATUS_LABELS[inv.status] || inv.status}
                    size="small"
                    color={STATUS_CHIP_COLOR[inv.status] || 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                    Q{inv.vat_quarter} {inv.vat_year}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('common.view')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleView(inv)}>
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {inv.status === 'draft' && (
                    <Tooltip title={t('common.edit')}>
                      <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleOpen(inv)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title={t('invoices.post')}>
                    <IconButton size="small" sx={{ p: 0.3 }} color="success" onClick={() => handlePost(inv.id)}>
                      <PostIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('invoices.send')}>
                    <IconButton size="small" sx={{ p: 0.3 }} color="primary" onClick={() => handleSend(inv.id)}>
                      <SendIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {inv.status === 'draft' && (
                    <Tooltip title={t('common.delete')}>
                      <IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(inv.id)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {invoices.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('invoices.noInvoices')}</Typography>
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

      {/* ============================================================ */}
      {/* Create / Edit Dialog                                          */}
      {/* ============================================================ */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          {editing ? t('invoices.editInvoice', { number: editing.invoice_number }) : t('invoices.newInvoice')}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}

          {/* ---------- header fields ---------- */}
          <Box sx={{ display: 'flex', gap: 2, mt: 1, mb: 3, flexWrap: 'wrap' }}>
            <Autocomplete
              options={customers}
              value={formCustomer}
              onChange={(_, v) => setFormCustomer(v)}
              getOptionLabel={(o) => `${o.code} \u2014 ${o.name}`}
              isOptionEqualToValue={(opt, val) => opt.id === val.id}
              renderInput={(params) => <TextField {...params} label={t('invoices.customer')} size="small" required />}
              sx={{ width: 300 }}
            />
            <TextField
              label={t('common.date')} type="date" value={formDate} size="small" required
              onChange={e => {
                const val = e.target.value;
                setFormDate(val);
                const d = new Date(val);
                if (!isNaN(d.getTime())) {
                  setFormVatQuarter(String(Math.floor(d.getMonth() / 3) + 1));
                  setFormVatYear(String(d.getFullYear()));
                }
              }}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            />
            <TextField
              label={t('invoices.dueDate')} type="date" value={formDueDate} size="small" required
              onChange={e => setFormDueDate(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            />
            <TextField
              label={t('invoices.exchangeRate')} value={formExchangeRate} size="small" type="number"
              onChange={e => setFormExchangeRate(e.target.value)}
              inputProps={{ min: 0, step: '0.0001' }}
              sx={{ width: 130 }}
            />
            <TextField
              select label={t('invoices.vatQuarter')} value={formVatQuarter} size="small"
              onChange={e => setFormVatQuarter(e.target.value)}
              sx={{ width: 100 }}
            >
              <MenuItem value="1">Q1</MenuItem>
              <MenuItem value="2">Q2</MenuItem>
              <MenuItem value="3">Q3</MenuItem>
              <MenuItem value="4">Q4</MenuItem>
            </TextField>
            <TextField
              label={t('invoices.vatYear')} value={formVatYear} size="small" type="number"
              onChange={e => setFormVatYear(e.target.value)}
              sx={{ width: 90 }}
            />
            <TextField
              label={t('invoices.remarks')} value={formNotes} size="small" multiline maxRows={3}
              onChange={e => setFormNotes(e.target.value)}
              sx={{ flexGrow: 1, minWidth: 200 }}
            />
          </Box>

          {/* ---------- lines table ---------- */}
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>{t('invoices.invoiceLines')}</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600, minWidth: 200 }}>{t('common.description')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 90 }}>{t('invoices.quantity')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 120 }}>{t('invoices.unitPrice')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: 220 }}>{t('common.account')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, minWidth: 180 }}>{t('invoices.taxCode')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, width: 120 }}>{t('common.amount')}</TableCell>
                  <TableCell sx={{ width: 40 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines.map((line, i) => {
                  const lineAmount = computeLineAmount(line);
                  return (
                    <TableRow key={i}>
                      <TableCell sx={{ p: 0.5 }}>
                        <TextField
                          value={line.description} size="small" fullWidth placeholder={t('common.description')}
                          onChange={e => updateLine(i, 'description', e.target.value)}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <TextField
                          value={line.quantity} size="small" type="number" fullWidth
                          onChange={e => updateLine(i, 'quantity', e.target.value)}
                          inputProps={{ min: 0, step: '0.01' }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <TextField
                          value={line.unit_price} size="small" type="number" fullWidth
                          onChange={e => updateLine(i, 'unit_price', e.target.value)}
                          inputProps={{ min: 0, step: '0.01' }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <Autocomplete
                          options={accounts}
                          value={accounts.find(a => a.id === line.account_id) || null}
                          onChange={(_, v) => updateLine(i, 'account_id', v?.id || '')}
                          getOptionLabel={(o) => `${o.code} \u2014 ${o.name}`}
                          isOptionEqualToValue={(opt, val) => opt.id === val.id}
                          renderInput={(params) => <TextField {...params} size="small" placeholder={t('common.account')} />}
                          size="small"
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <Autocomplete
                          options={taxCodes}
                          value={taxCodes.find(t => t.id === line.tax_code_id) || null}
                          onChange={(_, v) => updateLine(i, 'tax_code_id', v?.id || null)}
                          getOptionLabel={(o) => `${o.code} \u2014 ${o.name} (${o.rate}%)`}
                          isOptionEqualToValue={(opt, val) => opt.id === val.id}
                          renderInput={(params) => <TextField {...params} size="small" placeholder={t('invoices.taxCode')} />}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ p: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500, pr: 1 }}>
                          {fmt(lineAmount)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                          <RemoveLineIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Button startIcon={<AddLineIcon />} onClick={addLine} size="small" sx={{ mt: 1 }}>
            {t('invoices.addLine')}
          </Button>

          {/* ---------- totals ---------- */}
          <Divider sx={{ my: 2 }} />
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Box sx={{ minWidth: 250 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{t('common.subtotal') + ':'}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{fmt(subtotal)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{t('common.tax') + ':'}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>{fmt(taxTotal)}</Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>{t('common.total') + ':'}</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>{fmt(grandTotal)}</Typography>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#2e7d32' }}>
            {editing ? t('common.update') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/* View Dialog                                                   */}
      {/* ============================================================ */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <span>{viewing ? t('invoices.viewInvoice', { number: viewing.invoice_number }) : ''}</span>
          {viewing && (
            <Chip
              label={STATUS_LABELS[viewing.status] || viewing.status}
              size="small"
              color={STATUS_CHIP_COLOR[viewing.status] || 'default'}
            />
          )}
        </DialogTitle>
        <DialogContent>
          {viewing && (
            <>
              {/* ---------- header info ---------- */}
              <Box sx={{ display: 'flex', gap: 4, mb: 3, mt: 1, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('invoices.customer')}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {viewing.customer_code && `${viewing.customer_code} \u2014 `}{viewing.customer_name}
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.date')}</Typography>
                  <Typography variant="body2">{formatDate(viewing.date)}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('invoices.dueDate')}</Typography>
                  <Typography variant="body2">{formatDate(viewing.due_date)}</Typography>
                </Box>
                {viewing.exchange_rate && viewing.exchange_rate !== '1' && viewing.exchange_rate !== '1.0000' && (
                  <Box>
                    <Typography variant="caption" color="text.secondary">{t('invoices.exchangeRate')}</Typography>
                    <Typography variant="body2">{viewing.exchange_rate}</Typography>
                  </Box>
                )}
              </Box>
              {viewing.notes && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" color="text.secondary">{t('invoices.remarks')}</Typography>
                  <Typography variant="body2">{viewing.notes}</Typography>
                </Box>
              )}

              {/* ---------- lines ---------- */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('invoices.quantity')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('invoices.unitPrice')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('invoices.taxCode')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.amount')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {viewing.lines?.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell align="right">{fmt(line.quantity)}</TableCell>
                        <TableCell align="right">{fmt(line.unit_price)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {line.account_code} &mdash; {line.account_name}
                          </Typography>
                        </TableCell>
                        <TableCell>{line.tax_code_name || '\u2014'}</TableCell>
                        <TableCell align="right">{fmt(line.amount || '0')}</TableCell>
                      </TableRow>
                    ))}
                    {(!viewing.lines || viewing.lines.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">{t('invoices.noLines')}</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* ---------- totals ---------- */}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                <Box sx={{ minWidth: 250 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2">{t('common.subtotal') + ':'}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{fmt(viewing.subtotal)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body2">{t('common.tax') + ':'}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{fmt(viewing.tax_amount)}</Typography>
                  </Box>
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>{t('common.total') + ':'}</Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700 }}>{fmt(viewing.total)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">{t('invoices.paid') + ':'}</Typography>
                    <Typography variant="body2" color="text.secondary">{fmt(viewing.amount_paid)}</Typography>
                  </Box>
                </Box>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* ============================================================ */}
      {/* CMR Invoice Picker Dialog                                     */}
      {/* ============================================================ */}
      <Dialog open={cmrOpen} onClose={() => setCmrOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>{t('invoices.cmrPickerTitle')}</DialogTitle>
        <DialogContent>
          {cmrError && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{cmrError}</Alert>}

          <TextField
            placeholder={t('common.search')}
            value={cmrSearch}
            onChange={e => handleCmrSearchChange(e.target.value)}
            size="small"
            fullWidth
            sx={{ mb: 2, mt: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
          />

          {cmrLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                {t('common.showing')} {displayedCmrInvoices.length} {t('common.of')} {filteredCmrInvoices.length} {t('common.results')}
              </Typography>

              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>{t('invoices.invoiceNumber')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('invoices.customer')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.total')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.status')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {displayedCmrInvoices.map(inv => (
                      <TableRow key={inv.id} hover>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                              {inv.invoice_number}
                            </Typography>
                            {inv.already_imported && (
                              <Chip
                                icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                label={t('invoices.alreadyImported')}
                                size="small"
                                color="success"
                                variant="outlined"
                                sx={{ height: 22, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
                              />
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{inv.customer_name}</Typography>
                          {inv.opportunity_title && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {inv.opportunity_title}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{inv.invoice_date}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {fmt(inv.total)} {inv.currency}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip label={inv.status} size="small" />
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            color="success"
                            disabled={inv.already_imported || cmrImporting === inv.id}
                            onClick={() => handleCmrImport(inv)}
                          >
                            {cmrImporting === inv.id ? t('invoices.importing') : t('invoices.importInvoice')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {displayedCmrInvoices.length === 0 && !cmrLoading && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <Typography variant="body2" color="text.secondary">{t('invoices.noCmrInvoices')}</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCmrOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Invoices;
