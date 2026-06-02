import React, { useEffect, useState } from 'react';
import { formatDate } from '../utils/dateFormat';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, FormControlLabel, Switch, InputAdornment,
  CircularProgress, Alert, MenuItem,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Search as SearchIcon, Receipt as StatementIcon,
  Upload as UploadIcon, Download as DownloadIcon,
  CloudDownload as CmrIcon, CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { exportToCSV } from '../utils/csvExport';
import ImportDialog from '../components/ImportDialog';

interface Customer {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  currency: string;
  payment_terms: number;
  credit_limit: string;
  notes: string;
  is_active: boolean;
}

interface StatementLine {
  id: string;
  date: string;
  type: string;
  reference: string;
  amount: string;
  balance: string;
}

interface CMRClient {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  currency: string;
  already_imported: boolean;
}

const CURRENCY_OPTIONS = ['EUR', 'USD', 'MAD', 'GBP', 'DKK'];

const EMPTY_FORM = {
  code: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  tax_id: '',
  currency: 'EUR',
  payment_terms: '30',
  credit_limit: '0',
  notes: '',
};

const Customers: React.FC = () => {
  const { t, i18n } = useTranslation();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  // Statement dialog
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementLines, setStatementLines] = useState<StatementLine[]>([]);

  const fetchCustomers = () => {
    const params = new URLSearchParams();
    if (!showInactive) params.set('is_active', 'true');
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/customers${qs}`).then(res => {
      if (res.data.success) setCustomers(res.data.customers);
    });
  };

  useEffect(() => { fetchCustomers(); }, [showInactive]);

  const handleSearch = () => {
    fetchCustomers();
  };

  const handleOpen = (customer?: Customer) => {
    if (customer) {
      setEditing(customer);
      setForm({
        code: customer.code,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        tax_id: customer.tax_id || '',
        currency: customer.currency || 'EUR',
        payment_terms: String(customer.payment_terms ?? 30),
        credit_limit: customer.credit_limit || '0',
        notes: customer.notes || '',
      });
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      payment_terms: parseInt(form.payment_terms) || 30,
      credit_limit: parseFloat(form.credit_limit) || 0,
    };
    try {
      if (editing) {
        await api.put(`/customers/${editing.id}`, payload);
      } else {
        await api.post('/customers', payload);
      }
      setDialogOpen(false);
      fetchCustomers();
    } catch (err: any) {
      alert(err.response?.data?.message || t('customers.errorSaving'));
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(t('customers.deactivateConfirm', { name: customer.name }))) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      fetchCustomers();
    } catch (err: any) {
      alert(err.response?.data?.message || t('customers.errorDeleting'));
    }
  };

  const openStatement = (customer: Customer) => {
    setStatementCustomer(customer);
    setStatementOpen(true);
    api.get(`/customers/${customer.id}/statement`).then(res => {
      if (res.data.success) {
        setStatementLines(res.data.statement || []);
      }
    }).catch(() => {
      setStatementLines([]);
    });
  };

  const closeStatement = () => {
    setStatementOpen(false);
    setStatementCustomer(null);
    setStatementLines([]);
  };

  // CMR Picker
  const [cmrOpen, setCmrOpen] = useState(false);
  const [cmrClients, setCmrClients] = useState<CMRClient[]>([]);
  const [cmrLoading, setCmrLoading] = useState(false);
  const [cmrError, setCmrError] = useState('');
  const [cmrSearch, setCmrSearch] = useState('');

  const openCmrPicker = () => {
    setCmrOpen(true);
    setCmrError('');
    setCmrSearch('');
    setCmrLoading(true);
    api.get('/cmr/clients').then(res => {
      if (res.data.success) setCmrClients(res.data.data.clients);
    }).catch((err: any) => {
      setCmrError(err.response?.data?.message || t('customers.cmrFetchError'));
    }).finally(() => setCmrLoading(false));
  };

  const handleCmrSelect = (cli: CMRClient) => {
    setCmrOpen(false);
    setEditing(null);
    setForm({
      code: '',
      name: cli.name,
      email: cli.email || '',
      phone: cli.phone || '',
      address: cli.address || '',
      tax_id: cli.tax_id || '',
      currency: cli.currency || 'EUR',
      payment_terms: '30',
      credit_limit: '0',
      notes: '',
    });
    setDialogOpen(true);
  };

  const filteredCmrClients = cmrSearch.trim()
    ? cmrClients.filter(c =>
        c.name.toLowerCase().includes(cmrSearch.toLowerCase()) ||
        (c.email && c.email.toLowerCase().includes(cmrSearch.toLowerCase()))
      )
    : cmrClients;

  // Import/Export
  const [importOpen, setImportOpen] = useState(false);

  const handleExportCustomers = () => {
    const headers = ['code', 'name', 'email', 'phone', 'address', 'tax_id', 'currency', 'payment_terms', 'credit_limit', 'notes'];
    const rows = customers.map(c => [
      c.code, c.name, c.email, c.phone, c.address, c.tax_id,
      c.currency, String(c.payment_terms), c.credit_limit, c.notes,
    ]);
    exportToCSV('customers.csv', headers, rows);
  };

  const filteredCustomers = search.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : customers;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('customers.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportCustomers} size="small">
            {t('importExport.export')}
          </Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)} size="small">
            {t('importExport.import')}
          </Button>
          <Button variant="outlined" startIcon={<CmrIcon />} onClick={openCmrPicker} size="small" color="success">
            {t('customers.pickFromCmr')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
            {t('customers.addCustomer')}
          </Button>
        </Box>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={t('common.search')}
          value={search}
          size="small"
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          sx={{ width: 260 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleSearch} sx={{ p: 0.3 }}>
                  <SearchIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              size="small"
            />
          }
          label={<Typography variant="body2">{t('common.showInactive')}</Typography>}
        />
      </Paper>

      {/* Customer Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.code')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.email')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.phone')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.currency')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('customers.paymentTerms')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.status')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredCustomers.map(customer => (
              <TableRow key={customer.id} hover sx={{ opacity: customer.is_active ? 1 : 0.5 }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                    {customer.code}
                  </Typography>
                </TableCell>
                <TableCell>{customer.name}</TableCell>
                <TableCell>{customer.email}</TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell>{customer.currency}</TableCell>
                <TableCell>{customer.payment_terms} {t('common.days')}</TableCell>
                <TableCell>
                  <Chip
                    label={customer.is_active ? t('common.active') : t('common.inactive')}
                    size="small"
                    sx={{
                      bgcolor: customer.is_active ? '#2e7d32' : '#9e9e9e',
                      color: '#fff',
                      height: 20,
                      fontSize: '11px',
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" onClick={() => handleOpen(customer)} title={t('common.edit')}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => openStatement(customer)} title={t('customers.statement')}>
                    <StatementIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(customer)} color="error" title={t('common.delete')}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {filteredCustomers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('customers.noCustomers')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('customers.editCustomer') : t('customers.addCustomer')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('common.code')} value={form.code} size="small" sx={{ width: 140 }}
                onChange={e => setForm({ ...form, code: e.target.value })}
              />
              <TextField
                label={t('common.name')} value={form.name} size="small" fullWidth
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('common.email')} value={form.email} size="small" fullWidth type="email"
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
              <TextField
                label={t('common.phone')} value={form.phone} size="small" sx={{ width: 180 }}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </Box>
            <TextField
              label={t('common.address')} value={form.address} size="small" fullWidth multiline rows={2}
              onChange={e => setForm({ ...form, address: e.target.value })}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('customers.taxId')} value={form.tax_id} size="small" fullWidth
                onChange={e => setForm({ ...form, tax_id: e.target.value })}
              />
              <TextField
                label={t('common.currency')} value={form.currency} size="small" sx={{ width: 120 }}
                onChange={e => setForm({ ...form, currency: e.target.value })}
                select
              >
                {CURRENCY_OPTIONS.map(c => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('customers.paymentTermsDays')} value={form.payment_terms} size="small"
                type="number" sx={{ width: 220 }}
                onChange={e => setForm({ ...form, payment_terms: e.target.value })}
                inputProps={{ min: 0 }}
              />
              <TextField
                label={t('customers.creditLimit')} value={form.credit_limit} size="small" fullWidth
                type="number"
                onChange={e => setForm({ ...form, credit_limit: e.target.value })}
                inputProps={{ min: 0, step: '0.01' }}
              />
            </Box>
            <TextField
              label={t('common.notes')} value={form.notes} size="small" fullWidth multiline rows={2}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#2e7d32' }}>
            {editing ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Statement Dialog */}
      <Dialog open={statementOpen} onClose={closeStatement} maxWidth="md" fullWidth>
        <DialogTitle>
          {t('customers.statement')} — {statementCustomer?.code} {statementCustomer?.name}
        </DialogTitle>
        <DialogContent>
          <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.type')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.reference')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.amount')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.balance')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statementLines.map((line) => (
                  <TableRow key={line.id} hover>
                    <TableCell>{formatDate(line.date)}</TableCell>
                    <TableCell>
                      <Chip
                        label={line.type === 'invoice' ? t('common.invoice') : line.type === 'payment' ? t('common.payment') : line.type}
                        size="small"
                        sx={{
                          bgcolor: line.type === 'invoice' ? '#1976d2' : '#2e7d32',
                          color: '#fff',
                          height: 20,
                          fontSize: '11px',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {line.reference}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {parseFloat(line.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 500 }}>
                      {parseFloat(line.balance).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                ))}
                {statementLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">{t('customers.noTransactions')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeStatement}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={fetchCustomers}
        previewEndpoint="/customers/import/preview"
        confirmEndpoint="/customers/import/confirm"
        templateColumns={['code', 'name', 'email', 'phone', 'address', 'tax_id', 'currency', 'payment_terms', 'credit_limit', 'notes']}
        entityName={t('customers.title')}
      />

      {/* CMR Client Picker Dialog */}
      <Dialog open={cmrOpen} onClose={() => setCmrOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{t('customers.cmrPickerTitle')}</DialogTitle>
        <DialogContent>
          {cmrError && <Alert severity="error" sx={{ mb: 2 }}>{cmrError}</Alert>}
          <TextField
            label={t('common.search')}
            value={cmrSearch}
            size="small"
            fullWidth
            sx={{ mb: 2, mt: 1 }}
            onChange={e => setCmrSearch(e.target.value)}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
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
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.email')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.phone')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCmrClients.map(cli => (
                    <TableRow key={cli.id} hover>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {cli.name}
                          {cli.already_imported && (
                            <Chip
                              icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                              label={t('customers.alreadyImported')}
                              size="small"
                              color="success"
                              variant="outlined"
                              sx={{ height: 20, fontSize: '11px' }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{cli.email}</TableCell>
                      <TableCell>{cli.phone}</TableCell>
                      <TableCell align="right">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => handleCmrSelect(cli)}
                          sx={{ minWidth: 'auto', fontSize: '12px' }}
                        >
                          {t('customers.selectClient')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredCmrClients.length === 0 && !cmrLoading && (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t('customers.noCmrClients')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCmrOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
