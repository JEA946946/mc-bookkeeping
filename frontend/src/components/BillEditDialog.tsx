import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Autocomplete, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Alert, CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Supplier { id: string; code: string; name: string; }
interface Account { id: string; code: string; name: string; }
interface Line {
  id?: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string | null;
  account_id: string | null;
  amount: string;
}

interface Props {
  open: boolean;
  billId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const acctLabel = (a: Account) => `${a.code} — ${a.name}`;
const supLabel = (s: Supplier) => `${s.code} — ${s.name}`;

/**
 * Quick-edit a bill's supplier and per-line account from the reconciliation
 * suggestions panel (many imported bills had the wrong supplier/account).
 * Saves via PUT /bills/:id (which already supports supplier_id + lines).
 */
const BillEditDialog: React.FC<Props> = ({ open, billId, onClose, onSaved }) => {
  const { t, i18n } = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [supplierId, setSupplierId] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([]);
  const [billNumber, setBillNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.get('/suppliers').then(r => { if (r.data.success) setSuppliers(r.data.data.suppliers); }).catch(() => {});
    api.get('/accounts?is_active=true').then(r => {
      if (r.data.success) setAccounts([...r.data.data.accounts].sort((a: Account, b: Account) => a.code.localeCompare(b.code)));
    }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !billId) return;
    setError('');
    setLoading(true);
    api.get(`/bills/${billId}`).then(r => {
      if (r.data.success) {
        const b = r.data.data.bill;
        setSupplierId(b.supplier_id || '');
        setBillNumber(b.bill_number || '');
        setLines((b.lines || []).map((l: any) => ({
          id: l.id, description: l.description, quantity: l.quantity, unit_price: l.unit_price,
          tax_code_id: l.tax_code_id, account_id: l.account_id, amount: l.amount,
        })));
      }
    }).catch(() => setError(t('common.error'))).finally(() => setLoading(false));
  }, [open, billId, t]);

  const setLineAccount = (i: number, accId: string) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, account_id: accId } : l)));

  const handleSave = async () => {
    if (!billId) return;
    if (lines.some(l => !l.account_id)) { setError(t('bankTransactions.accountRequired')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/bills/${billId}`, {
        supplier_id: supplierId || '',
        lines: lines.map(l => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_code_id: l.tax_code_id || '',
          account_id: l.account_id,
        })),
      });
      if (res.data.success) onSaved();
      else setError(res.data.message || t('common.error'));
    } catch (err: any) {
      setError(err.response?.data?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('bills.editBill', { number: billNumber })}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
        ) : (
          <>
            <Autocomplete
              sx={{ mt: 1, mb: 2 }}
              options={suppliers}
              value={suppliers.find(s => s.id === supplierId) || null}
              onChange={(_e, v) => setSupplierId(v?.id || '')}
              getOptionLabel={supLabel}
              filterOptions={(opts, st) => {
                const q = st.inputValue.toLowerCase();
                return (q ? opts.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)) : opts).slice(0, 50);
              }}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(p) => <TextField {...p} size="small" label={t('bills.supplier')} />}
            />

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 600, width: '30%' }}>{t('common.description')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, width: 120 }}>{t('common.amount')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={line.id || i}>
                      <TableCell>{line.description || '—'}</TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        <Autocomplete
                          size="small" fullWidth options={accounts}
                          value={accounts.find(a => a.id === line.account_id) || null}
                          onChange={(_e, v) => setLineAccount(i, v?.id || '')}
                          getOptionLabel={acctLabel}
                          filterOptions={(opts, st) => {
                            const q = st.inputValue.toLowerCase();
                            return q ? opts.filter(a => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) : opts;
                          }}
                          isOptionEqualToValue={(o, v) => o.id === v.id}
                          ListboxProps={{ style: { maxHeight: 320 } }}
                          renderInput={(p) => <TextField {...p} placeholder="—" />}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {parseFloat(line.amount || '0').toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {t('bills.editPostedNote')}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || loading}
          startIcon={saving ? <CircularProgress size={16} /> : undefined} sx={{ bgcolor: '#2e7d32' }}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BillEditDialog;
