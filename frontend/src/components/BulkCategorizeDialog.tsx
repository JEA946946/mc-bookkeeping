import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Autocomplete, Alert, CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Txn { id: string; description: string; debit: string; credit: string; currency?: string; }
interface Account { id: string; code: string; name: string; }

interface Props {
  open: boolean;
  txns: Txn[];
  onClose: () => void;
  onDone: (succeededIds: string[]) => void;
}

const acctLabel = (a: Account) => `${a.code} — ${a.name}`;
const amountOf = (t: Txn) => (parseFloat(t.credit || '0') || parseFloat(t.debit || '0')) || 0;

/**
 * Book several outgoing bank transactions to a single expense/tax account at
 * once. Each transaction is categorized for its own amount via the existing
 * /transactions/:id/categorize endpoint (DR account / CR 240000).
 */
const BulkCategorizeDialog: React.FC<Props> = ({ open, txns, onClose, onDone }) => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [account, setAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setAccount(null);
    api.get('/accounts?is_active=true').then(r => {
      if (r.data.success) {
        setAccounts([...r.data.data.accounts].sort((a: Account, b: Account) => a.code.localeCompare(b.code)));
      }
    }).catch(() => {});
  }, [open]);

  const total = txns.reduce((sum, t) => sum + amountOf(t), 0);
  const currency = txns[0]?.currency || '';

  const handleSave = async () => {
    if (!account) { setError(t('bankTransactions.accountRequired')); return; }
    setSaving(true);
    setError('');
    const succeeded: string[] = [];
    let failed = 0;
    for (const txn of txns) {
      try {
        const res = await api.post(`/transactions/${txn.id}/categorize`, {
          description: txn.description || '',
          lines: [{ description: txn.description || '', account_id: account.id, amount: String(amountOf(txn)), tax_code_id: '' }],
        });
        if (res.data.success) succeeded.push(txn.id);
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setSaving(false);
    if (failed > 0) setError(t('billMatching.bulkPartial', { ok: succeeded.length, failed }));
    onDone(succeeded);
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('billMatching.bulkBookTitle', { count: txns.length })}</DialogTitle>
      <DialogContent>
        <Box sx={{ mb: 2, mt: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('billMatching.bulkSummary', { count: txns.length })} ·{' '}
            <b>{total.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}</b>
          </Typography>
        </Box>

        {error && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

        <Autocomplete
          options={accounts}
          value={account}
          onChange={(_e, v) => setAccount(v)}
          getOptionLabel={acctLabel}
          filterOptions={(opts, st) => {
            const q = st.inputValue.toLowerCase();
            return q ? opts.filter((a) => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)) : opts;
          }}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          ListboxProps={{ style: { maxHeight: 320 } }}
          renderInput={(p) => <TextField {...p} size="small" label={t('common.account')} autoFocus />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !account}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
          sx={{ bgcolor: '#2e7d32' }}
        >
          {t('billMatching.bookToAccount')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkCategorizeDialog;
