import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Checkbox, FormControlLabel,
  Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface TaxCode {
  id: string;
  code: string;
  name: string;
  rate: string;
  type: 'sales' | 'purchase' | 'both';
  account_id: string | null;
  account_code?: string;
  account_name?: string;
  is_active: boolean;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
}

const TYPE_COLORS: Record<string, 'success' | 'primary' | 'secondary'> = {
  sales: 'success',
  purchase: 'primary',
  both: 'secondary',
};

const EMPTY_FORM = {
  code: '',
  name: '',
  rate: '',
  type: 'sales' as 'sales' | 'purchase' | 'both',
  account_id: null as string | null,
  is_active: true,
};

const TaxCodes: React.FC = () => {
  const { t } = useTranslation();

  /* ---------- constants (inside component for t()) ---------- */

  const TYPE_LABELS: Record<string, string> = {
    sales: t('taxCodes.sales'),
    purchase: t('taxCodes.purchase'),
    both: t('taxCodes.both'),
  };

  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null);

  const fetchTaxCodes = () => {
    api.get('/tax-codes').then(res => {
      if (res.data.success) setTaxCodes(res.data.data?.tax_codes || res.data.tax_codes || []);
    });
  };

  const fetchAccounts = () => {
    api.get('/accounts').then(res => {
      if (res.data.success) {
        const accts = res.data.data?.accounts || res.data.accounts || [];
        setAccounts(accts.map((a: any) => ({ id: a.id, code: a.code, name: a.name })));
      }
    });
  };

  useEffect(() => {
    fetchTaxCodes();
    fetchAccounts();
  }, []);

  const handleOpen = (taxCode?: TaxCode) => {
    if (taxCode) {
      setEditing(taxCode);
      setForm({
        code: taxCode.code,
        name: taxCode.name,
        rate: taxCode.rate,
        type: taxCode.type,
        account_id: taxCode.account_id,
        is_active: taxCode.is_active,
      });
      if (taxCode.account_id) {
        const acct = accounts.find(a => a.id === taxCode.account_id);
        setSelectedAccount(acct || null);
      } else {
        setSelectedAccount(null);
      }
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setSelectedAccount(null);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      rate: parseFloat(form.rate) || 0,
      account_id: selectedAccount?.id || null,
    };
    try {
      if (editing) {
        await api.put(`/tax-codes/${editing.id}`, payload);
      } else {
        await api.post('/tax-codes', payload);
      }
      setDialogOpen(false);
      fetchTaxCodes();
    } catch (err: any) {
      alert(err.response?.data?.message || t('taxCodes.errorSave'));
    }
  };

  const handleDelete = async (taxCode: TaxCode) => {
    if (!confirm(t('taxCodes.deleteConfirm', { code: taxCode.code, name: taxCode.name }))) return;
    try {
      await api.delete(`/tax-codes/${taxCode.id}`);
      fetchTaxCodes();
    } catch (err: any) {
      alert(err.response?.data?.message || t('taxCodes.errorDelete'));
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('taxCodes.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
          {t('taxCodes.addTaxCode')}
        </Button>
      </Box>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.code')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('taxCodes.rate')} (%)</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.type')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.active')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {taxCodes.map(tc => (
              <TableRow key={tc.id} hover sx={{ opacity: tc.is_active ? 1 : 0.5 }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                    {tc.code}
                  </Typography>
                </TableCell>
                <TableCell>{tc.name}</TableCell>
                <TableCell>{parseFloat(tc.rate).toFixed(2)}%</TableCell>
                <TableCell>
                  <Chip
                    label={TYPE_LABELS[tc.type] || tc.type}
                    size="small"
                    color={TYPE_COLORS[tc.type] || 'default'}
                    sx={{ height: 20, fontSize: '11px' }}
                  />
                </TableCell>
                <TableCell>
                  {tc.account_code ? (
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {tc.account_code} — {tc.account_name}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">—</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Chip
                    label={tc.is_active ? t('common.yes') : t('common.no')}
                    size="small"
                    sx={{
                      bgcolor: tc.is_active ? '#2e7d32' : '#9e9e9e',
                      color: '#fff',
                      height: 20,
                      fontSize: '11px',
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" onClick={() => handleOpen(tc)} title={t('common.edit')}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleDelete(tc)} color="error" title={t('common.delete')}>
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {taxCodes.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('taxCodes.noTaxCodes')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('taxCodes.editTaxCode') : t('taxCodes.addTaxCode')}</DialogTitle>
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
                label={`${t('taxCodes.rate')} (%)`} value={form.rate} size="small" type="number" sx={{ width: 140 }}
                onChange={e => setForm({ ...form, rate: e.target.value })}
                inputProps={{ min: 0, step: '0.01' }}
              />
              <TextField
                label={t('common.type')} value={form.type} size="small" select fullWidth
                onChange={e => setForm({ ...form, type: e.target.value as 'sales' | 'purchase' | 'both' })}
              >
                <MenuItem value="sales">{t('taxCodes.sales')}</MenuItem>
                <MenuItem value="purchase">{t('taxCodes.purchase')}</MenuItem>
                <MenuItem value="both">{t('taxCodes.both')}</MenuItem>
              </TextField>
            </Box>
            <Autocomplete
              options={accounts}
              value={selectedAccount}
              onChange={(_, value) => setSelectedAccount(value)}
              getOptionLabel={(option) => `${option.code} — ${option.name}`}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField {...params} label={t('common.account')} size="small" />
              )}
              size="small"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                  size="small"
                />
              }
              label={t('common.active')}
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
    </Box>
  );
};

export default TaxCodes;
