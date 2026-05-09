import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, Alert, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, CircularProgress,
  Autocomplete, Chip,
} from '@mui/material';
import {
  Sync as SyncIcon, Add as AddIcon, Delete as DeleteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface SupplierMapping {
  id: string;
  cmr_supplier_id: string;
  cmr_supplier_name: string;
  account_id: string;
  account_code: string;
  account_name: string;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  label: string;
}

interface SyncResult {
  invoices_created: number;
  payments_created: number;
  skipped: number;
  details: string[];
}

interface ContactSyncResult {
  clients_created: number;
  clients_updated: number;
  suppliers_created: number;
  suppliers_updated: number;
  skipped: number;
  details: string[];
}

const CMRSync: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);

  // Sync tab state
  const [sinceDays, setSinceDays] = useState('7');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState('');

  // Mappings tab state
  const [mappings, setMappings] = useState<SupplierMapping[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newAccountId, setNewAccountId] = useState('');
  const [mappingError, setMappingError] = useState('');
  const [savingMapping, setSavingMapping] = useState(false);

  // Contacts tab state
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [contactResult, setContactResult] = useState<ContactSyncResult | null>(null);
  const [contactError, setContactError] = useState('');

  const fetchMappings = () => {
    api.get('/supplier-mappings').then(res => {
      if (res.data.success) setMappings(res.data.data.mappings);
    });
  };

  useEffect(() => {
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) {
        setAccounts(res.data.data.accounts.map((a: any) => ({
          ...a,
          label: `${a.code} — ${a.name}`,
        })));
      }
    });
    fetchMappings();
  }, []);

  const handleSync = async () => {
    setSyncError('');
    setSyncResult(null);
    setSyncing(true);
    try {
      const days = parseInt(sinceDays) || 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const res = await api.post('/cmr/sync', { since });
      if (res.data.success) {
        setSyncResult(res.data.data);
      }
    } catch (err: any) {
      setSyncError(err.response?.data?.message || t('cmr.errorSync'));
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncContacts = async () => {
    setContactError('');
    setContactResult(null);
    setSyncingContacts(true);
    try {
      const res = await api.post('/cmr/sync-contacts');
      if (res.data.success) {
        setContactResult(res.data.data);
      }
    } catch (err: any) {
      setContactError(err.response?.data?.message || t('cmr.errorSync'));
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleSaveMapping = async () => {
    if (!newSupplierId || !newSupplierName || !newAccountId) {
      setMappingError(t('cmr.allFieldsRequired'));
      return;
    }
    setMappingError('');
    setSavingMapping(true);
    try {
      await api.post('/supplier-mappings', {
        cmr_supplier_id: newSupplierId,
        cmr_supplier_name: newSupplierName,
        account_id: newAccountId,
      });
      setDialogOpen(false);
      fetchMappings();
    } catch (err: any) {
      setMappingError(err.response?.data?.message || t('cmr.errorSavingMapping'));
    } finally {
      setSavingMapping(false);
    }
  };

  const handleDeleteMapping = async (id: string) => {
    if (!confirm(t('cmr.deleteMapping'))) return;
    try {
      await api.delete(`/supplier-mappings/${id}`);
      fetchMappings();
    } catch (err: any) {
      alert(err.response?.data?.message || t('cmr.errorDeletingMapping'));
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('cmr.title')}</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={t('cmr.syncTab')} />
        <Tab label={t('cmr.supplierMappings')} />
        <Tab label={t('cmr.contacts')} />
      </Tabs>

      {/* Sync Tab */}
      {tab === 0 && (
        <Box>
          {syncError && <Alert severity="error" sx={{ mb: 2 }}>{syncError}</Alert>}

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                {t('cmr.syncFromCmr')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('cmr.syncDescription')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  label={t('cmr.daysBack')} type="number" value={sinceDays} size="small"
                  onChange={e => setSinceDays(e.target.value)}
                  inputProps={{ min: 1, max: 365 }}
                  sx={{ width: 120 }}
                />
                <Button
                  variant="contained"
                  onClick={handleSync}
                  disabled={syncing}
                  startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                  sx={{ bgcolor: '#2e7d32' }}
                >
                  {syncing ? t('cmr.syncing') : t('cmr.syncNow')}
                </Button>
              </Box>
            </CardContent>
          </Card>

          {syncResult && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  {t('cmr.syncResults')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                      {syncResult.invoices_created}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.invoicesCreated')}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#1976d2' }}>
                      {syncResult.payments_created}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.paymentsCreated')}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#ed6c02' }}>
                      {syncResult.skipped}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.skipped')}</Typography>
                  </Box>
                </Box>
                {syncResult.details.length > 0 && (
                  <Box sx={{ maxHeight: 200, overflowY: 'auto', bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}>
                    {syncResult.details.map((d, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                        {d}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      {/* Supplier Mappings Tab */}
      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setNewSupplierId('');
                setNewSupplierName('');
                setNewAccountId('');
                setMappingError('');
                setDialogOpen(true);
              }}
              sx={{ bgcolor: '#2e7d32' }}
            >
              {t('cmr.addMapping')}
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('cmr.cmrSupplierId')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('cmr.supplierName')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.map(m => (
                  <TableRow key={m.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{m.cmr_supplier_id}</Typography>
                    </TableCell>
                    <TableCell>{m.cmr_supplier_name}</TableCell>
                    <TableCell>
                      <Chip
                        label={`${m.account_code} — ${m.account_name}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 22, fontSize: '12px' }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="error" onClick={() => handleDeleteMapping(m.id)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {mappings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">{t('cmr.noMappings')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Add Mapping Dialog */}
          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{t('cmr.addSupplierMapping')}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                {mappingError && <Alert severity="error">{mappingError}</Alert>}
                <TextField
                  label={t('cmr.cmrSupplierId')} value={newSupplierId} size="small" fullWidth
                  onChange={e => setNewSupplierId(e.target.value)}
                />
                <TextField
                  label={t('cmr.supplierName')} value={newSupplierName} size="small" fullWidth
                  onChange={e => setNewSupplierName(e.target.value)}
                />
                <Autocomplete
                  size="small"
                  options={accounts}
                  value={accounts.find(a => a.id === newAccountId) || null}
                  onChange={(_, val) => setNewAccountId(val?.id || '')}
                  getOptionLabel={(o) => o.label}
                  isOptionEqualToValue={(o, v) => o.id === v.id}
                  renderInput={(params) => <TextField {...params} label={t('cmr.expenseAccount')} />}
                  filterOptions={(options, { inputValue }) => {
                    if (!inputValue) return options.slice(0, 50);
                    const q = inputValue.toLowerCase();
                    return options.filter(o =>
                      o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
                    ).slice(0, 50);
                  }}
                  ListboxProps={{ style: { maxHeight: 200 } }}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button
                variant="contained"
                onClick={handleSaveMapping}
                disabled={savingMapping || !newSupplierId || !newSupplierName || !newAccountId}
                sx={{ bgcolor: '#2e7d32' }}
              >
                {savingMapping ? t('common.saving') : t('common.create')}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}

      {/* Contacts Tab */}
      {tab === 2 && (
        <Box>
          {contactError && <Alert severity="error" sx={{ mb: 2 }}>{contactError}</Alert>}

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                {t('cmr.syncContacts')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('cmr.syncContactsDescription')}
              </Typography>
              <Button
                variant="contained"
                onClick={handleSyncContacts}
                disabled={syncingContacts}
                startIcon={syncingContacts ? <CircularProgress size={16} /> : <SyncIcon />}
                sx={{ bgcolor: '#2e7d32' }}
              >
                {syncingContacts ? t('cmr.syncingContacts') : t('cmr.syncContacts')}
              </Button>
            </CardContent>
          </Card>

          {contactResult && (
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  {t('cmr.contactSyncResults')}
                </Typography>
                <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                      {contactResult.clients_created}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.clientsCreated')}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#1976d2' }}>
                      {contactResult.clients_updated}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.clientsUpdated')}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                      {contactResult.suppliers_created}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.suppliersCreated')}</Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#1976d2' }}>
                      {contactResult.suppliers_updated}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{t('cmr.suppliersUpdated')}</Typography>
                  </Box>
                </Box>
                {contactResult.details.length > 0 && (
                  <Box sx={{ maxHeight: 300, overflowY: 'auto', bgcolor: '#f5f5f5', p: 1, borderRadius: 1 }}>
                    {contactResult.details.map((d, i) => (
                      <Typography key={i} variant="caption" sx={{ display: 'block', fontFamily: 'monospace' }}>
                        {d}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          )}
        </Box>
      )}
    </Box>
  );
};

export default CMRSync;
