import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, Autocomplete, IconButton, Alert,
} from '@mui/material';
import { Add as AddIcon, RemoveCircleOutline as RemoveLineIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/dateFormat';
import api from '../services/api';

interface Txn {
  id: string;
  date: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  bank_account_code?: string;
  currency?: string;
}

interface Account { id: string; code: string; name: string; }
interface TaxCode { id: string; code: string; rate: number; account_id?: string; }
interface Line { description: string; account_id: string; amount: string; tax_code_id: string; }

interface Props {
  open: boolean;
  txn: Txn | null;
  onClose: () => void;
  onDone: () => void;
}

const acctLabel = (a: Account) => `${a.code} — ${a.name}`;

const txnAmount = (txn: Txn) =>
  (parseFloat(txn.credit || '0') || parseFloat(txn.debit || '0')) || 0;

/**
 * Reconcile an outgoing bank transaction by booking it directly to one or more
 * expense/tax accounts (no supplier). Posts to /transactions/:id/categorize,
 * which reclassifies the amount out of Client Funds Liability (240000).
 */
const CategorizeTransactionDialog: React.FC<Props> = ({ open, txn, onClose, onDone }) => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [lines, setLines] = useState<Line[]>([{ description: '', account_id: '', amount: '', tax_code_id: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    api.get('/accounts?is_active=true').then(r => {
      if (r.data.success) {
        const list: Account[] = [...r.data.data.accounts].sort((a, b) => a.code.localeCompare(b.code));
        setAccounts(list);
      }
    }).catch(() => {});
    api.get('/tax-codes').then(r => { if (r.data.success) setTaxCodes(r.data.data.tax_codes); }).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open && txn) {
      setError('');
      setLines([{ description: txn.description || '', account_id: '', amount: String(txnAmount(txn) || ''), tax_code_id: '' }]);
    }
  }, [open, txn]);

  const updateLine = (i: number, field: keyof Line, value: string) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));
  const addLine = () => setLines(prev => [...prev, { description: '', account_id: '', amount: '', tax_code_id: '' }]);
  const removeLine = (i: number) => setLines(prev => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  // Total including VAT (mirrors backend: base + base*rate/100), so it matches
  // the transaction amount the backend validates against.
  const total = lines.reduce((sum, l) => {
    const base = parseFloat(l.amount || '0') || 0;
    const tc = taxCodes.find(c => c.id === l.tax_code_id);
    const rate = tc ? Number(tc.rate) : 0;
    return sum + base + base * rate / 100;
  }, 0);

  if (!txn) return null;
  const amount = txnAmount(txn);
  const mismatch = total.toFixed(2) !== amount.toFixed(2);

  const handleSave = async () => {
    const validLines = lines.filter(l => l.account_id && l.amount);
    if (validLines.length === 0) { setError(t('bankTransactions.accountRequired')); return; }
    if (mismatch) { setError(t('billMatching.amountMismatch')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post(`/transactions/${txn.id}/categorize`, {
        date: txn.date,
        description: txn.description || '',
        reference: txn.reference || '',
        lines: validLines.map(l => ({
          description: l.description, account_id: l.account_id, amount: l.amount, tax_code_id: l.tax_code_id || '',
        })),
      });
      if (res.data.success) {
        onDone();
      } else {
        setError(res.data.message || t('common.error'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('billMatching.bookToAccount')}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {formatDate(txn.date)} · {txn.description || '—'} · {txn.bank_account_code}
          </Typography>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

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
              {lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField value={line.description} size="small" fullWidth placeholder={t('common.description')}
                      onChange={(e) => updateLine(i, 'description', e.target.value)} />
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <Autocomplete
                      size="small" fullWidth options={accounts}
                      value={accounts.find((a) => a.id === line.account_id) || null}
                      onChange={(_e, v) => updateLine(i, 'account_id', v?.id || '')}
                      getOptionLabel={acctLabel}
                      filterOptions={(opts, st) => {
                        const q = st.inputValue.toLowerCase();
                        return q ? opts.filter((a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) : opts;
                      }}
                      ListboxProps={{ style: { maxHeight: 320 } }}
                      isOptionEqualToValue={(o, v) => o.id === v.id}
                      renderInput={(p) => <TextField {...p} placeholder="—" />}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField select value={line.tax_code_id} size="small" fullWidth
                      onChange={(e) => updateLine(i, 'tax_code_id', e.target.value)}>
                      <MenuItem value="">{t('common.none')}</MenuItem>
                      {taxCodes.map((tc) => (
                        <MenuItem key={tc.id} value={tc.id}>{tc.code} ({tc.rate}%)</MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField value={line.amount} size="small" type="number" sx={{ width: 110 }}
                      onChange={(e) => updateLine(i, 'amount', e.target.value)}
                      inputProps={{ min: 0, step: '0.01', style: { textAlign: 'right' } }} />
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
                <TableCell align="right" sx={{ fontWeight: 700, color: mismatch ? 'warning.main' : undefined }}>
                  {total.toLocaleString(undefined, { minimumFractionDigits: 2 })} {txn.currency}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          <Button startIcon={<AddIcon sx={{ fontSize: 18 }} />} onClick={addLine} size="small">
            {t('expenses.addLine')}
          </Button>
          <Typography variant="caption" color={mismatch ? 'warning.main' : 'text.secondary'}>
            {t('bankTransactions.txnAmount')}: {amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {txn.currency}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ bgcolor: '#2e7d32' }}>
          {t('billMatching.bookToAccount')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CategorizeTransactionDialog;
