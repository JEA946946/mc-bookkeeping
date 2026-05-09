import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, Tooltip, TablePagination, MenuItem,
  Autocomplete, Alert,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  RemoveRedEye as ViewIcon, CheckCircle as ApplyIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Customer {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name?: string;
  total: string;
}

interface CreditNote {
  id: string;
  credit_note_number: string;
  customer_id: string;
  customer_name: string;
  invoice_id: string | null;
  invoice_number: string | null;
  date: string;
  subtotal: string;
  tax_amount: string;
  total: string;
  status: 'draft' | 'applied';
  notes: string;
}

const EMPTY_FORM = {
  customer_id: '',
  invoice_id: '',
  date: new Date().toISOString().split('T')[0],
  subtotal: '',
  tax_amount: '',
  total: '',
  notes: '',
};

const CreditNotes: React.FC = () => {
  const { t, i18n } = useTranslation();

  const STATUS_OPTIONS = [
    { value: '', label: t('common.all') },
    { value: 'draft', label: t('creditNotes.draft') },
    { value: 'applied', label: t('creditNotes.applied') },
  ];

  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CreditNote | null>(null);
  const [viewing, setViewing] = useState<CreditNote | null>(null);
  const [error, setError] = useState('');

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Form state
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchCreditNotes = (p?: number) => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterCustomer) params.set('customer_id', filterCustomer);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    const currentPage = p !== undefined ? p : page;
    params.set('page', String(currentPage + 1));
    params.set('page_size', String(rowsPerPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/credit-notes${qs}`).then(res => {
      if (res.data.success) {
        setCreditNotes(res.data.data.credit_notes);
        setTotalCount(res.data.data.total_count ?? res.data.data.count ?? 0);
      }
    });
  };

  useEffect(() => {
    fetchCreditNotes();
    api.get('/customers').then(res => {
      if (res.data.success) setCustomers(res.data.data.customers);
    });
    api.get('/invoices').then(res => {
      if (res.data.success) setInvoices(res.data.data.invoices);
    });
  }, []);

  const handleApplyFilters = () => {
    setPage(0);
    fetchCreditNotes(0);
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    fetchCreditNotes(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    setTimeout(() => fetchCreditNotes(0), 0);
  };

  const handleOpen = async (creditNote?: CreditNote) => {
    setError('');
    if (creditNote) {
      const res = await api.get(`/credit-notes/${creditNote.id}`);
      if (res.data.success) {
        const full = res.data.data.credit_note;
        setEditing(full);
        setForm({
          customer_id: full.customer_id,
          invoice_id: full.invoice_id || '',
          date: full.date,
          subtotal: full.subtotal,
          tax_amount: full.tax_amount,
          total: full.total,
          notes: full.notes || '',
        });
      }
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM });
    }
    setDialogOpen(true);
  };

  const handleView = async (creditNote: CreditNote) => {
    const res = await api.get(`/credit-notes/${creditNote.id}`);
    if (res.data.success) {
      setViewing(res.data.data.credit_note);
      setViewDialogOpen(true);
    }
  };

  const handleSave = async () => {
    setError('');
    const payload = {
      ...form,
      invoice_id: form.invoice_id || null,
      subtotal: parseFloat(form.subtotal) || 0,
      tax_amount: parseFloat(form.tax_amount) || 0,
      total: parseFloat(form.total) || 0,
    };
    try {
      if (editing) {
        await api.put(`/credit-notes/${editing.id}`, payload);
      } else {
        await api.post('/credit-notes', payload);
      }
      setDialogOpen(false);
      fetchCreditNotes();
    } catch (err: any) {
      setError(err.response?.data?.message || t('creditNotes.errorSaving'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('creditNotes.deleteConfirm'))) return;
    try {
      await api.delete(`/credit-notes/${id}`);
      fetchCreditNotes();
    } catch (err: any) {
      alert(err.response?.data?.message || t('creditNotes.errorDeleting'));
    }
  };

  const handleApply = async (id: string) => {
    if (!confirm(t('creditNotes.applyConfirm'))) return;
    try {
      await api.post(`/credit-notes/${id}/apply`);
      fetchCreditNotes();
    } catch (err: any) {
      alert(err.response?.data?.message || t('creditNotes.errorApplying'));
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'draft':
        return <Chip label={t('creditNotes.draft')} size="small" color="default" />;
      case 'applied':
        return <Chip label={t('creditNotes.applied')} size="small" color="success" />;
      default:
        return <Chip label={status} size="small" />;
    }
  };

  const selectedCustomer = customers.find(c => c.id === form.customer_id) || null;
  const selectedInvoice = invoices.find(i => i.id === form.invoice_id) || null;

  // Filter invoices by selected customer
  const filteredInvoices = form.customer_id
    ? invoices.filter(i => i.customer_id === form.customer_id)
    : invoices;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('creditNotes.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
          {t('creditNotes.newCreditNote')}
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
          select label={t('invoices.customer')} value={filterCustomer} size="small"
          onChange={e => setFilterCustomer(e.target.value)}
          sx={{ width: 200 }}
        >
          <MenuItem value="">{t('common.allCustomers')}</MenuItem>
          {customers.map(c => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
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
        <Button variant="outlined" size="small" onClick={handleApplyFilters}>
          {t('common.filter')}
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('creditNotes.creditNoteNumber')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('invoices.customer')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('creditNotes.relatedInvoice')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.date')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.subtotal')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.tax')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.total')}</TableCell>
              <TableCell sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.status')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {creditNotes.map(cn => (
              <TableRow key={cn.id} hover sx={{ '& td': { py: 0.3, whiteSpace: 'nowrap' } }}>
                <TableCell>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8rem' }}>
                    {cn.credit_note_number}
                  </Typography>
                </TableCell>
                <TableCell>{cn.customer_name}</TableCell>
                <TableCell>{cn.invoice_number || '—'}</TableCell>
                <TableCell>{cn.date}</TableCell>
                <TableCell align="right">{parseFloat(cn.subtotal).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}</TableCell>
                <TableCell align="right">{parseFloat(cn.tax_amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}</TableCell>
                <TableCell align="right">{parseFloat(cn.total).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}</TableCell>
                <TableCell>{getStatusChip(cn.status)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('common.view')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleView(cn)}>
                      <ViewIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {cn.status === 'draft' && (
                    <>
                      <Tooltip title={t('common.edit')}>
                        <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleOpen(cn)}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.apply')}>
                        <IconButton size="small" sx={{ p: 0.3 }} color="success" onClick={() => handleApply(cn.id)}>
                          <ApplyIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('common.delete')}>
                        <IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(cn.id)}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {creditNotes.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('creditNotes.noCreditNotes')}</Typography>
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
          labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
        />
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? `${t('common.edit')} ${editing.credit_note_number}` : t('creditNotes.newCreditNote')}</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Autocomplete
              size="small"
              options={customers}
              value={selectedCustomer}
              onChange={(_, val) => {
                setForm(prev => ({
                  ...prev,
                  customer_id: val?.id || '',
                  invoice_id: '',
                }));
              }}
              getOptionLabel={(o) => o.name}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={`${t('invoices.customer')} *`} />}
            />
            <Autocomplete
              size="small"
              options={filteredInvoices}
              value={selectedInvoice}
              onChange={(_, val) => setForm(prev => ({ ...prev, invoice_id: val?.id || '' }))}
              getOptionLabel={(o) => `${o.invoice_number}${o.customer_name ? ` — ${o.customer_name}` : ''} (${parseFloat(o.total).toLocaleString(i18n.language, { minimumFractionDigits: 2 })})`}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => <TextField {...params} label={t('creditNotes.invoiceOptional')} />}
            />
            <TextField
              label={`${t('common.date')} *`} type="date" value={form.date} size="small"
              onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={`${t('common.subtotal')} *`} type="number" value={form.subtotal} size="small" fullWidth
                onChange={e => {
                  const subtotal = parseFloat(e.target.value) || 0;
                  const taxAmount = parseFloat(form.tax_amount) || 0;
                  setForm(prev => ({
                    ...prev,
                    subtotal: e.target.value,
                    total: (subtotal + taxAmount).toFixed(2),
                  }));
                }}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <TextField
                label={t('common.tax')} type="number" value={form.tax_amount} size="small" fullWidth
                onChange={e => {
                  const taxAmount = parseFloat(e.target.value) || 0;
                  const subtotal = parseFloat(form.subtotal) || 0;
                  setForm(prev => ({
                    ...prev,
                    tax_amount: e.target.value,
                    total: (subtotal + taxAmount).toFixed(2),
                  }));
                }}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <TextField
                label={t('common.total')} type="number" value={form.total} size="small" fullWidth
                onChange={e => setForm(prev => ({ ...prev, total: e.target.value }))}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Box>
            <TextField
              label={t('invoices.remarks')} value={form.notes} size="small" fullWidth multiline rows={3}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!form.customer_id || !form.date || !form.subtotal}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {editing ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {viewing?.credit_note_number}
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
                  <Typography variant="caption" color="text.secondary">{t('invoices.customer')}</Typography>
                  <Typography variant="body2">{viewing.customer_name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('common.date')}</Typography>
                  <Typography variant="body2">{viewing.date}</Typography>
                </Box>
              </Box>
              {viewing.invoice_number && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('creditNotes.relatedInvoiceLabel')}</Typography>
                  <Typography variant="body2">{viewing.invoice_number}</Typography>
                </Box>
              )}
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.subtotal')}</TableCell>
                    <TableCell align="right">
                      {parseFloat(viewing.subtotal).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.tax')}</TableCell>
                    <TableCell align="right">
                      {parseFloat(viewing.tax_amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.total')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {parseFloat(viewing.total).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              {viewing.notes && (
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('invoices.remarks')}</Typography>
                  <Typography variant="body2">{viewing.notes}</Typography>
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

export default CreditNotes;
