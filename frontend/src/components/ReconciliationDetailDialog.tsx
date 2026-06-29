import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Alert, CircularProgress,
} from '@mui/material';
import { Edit as EditIcon, LinkOff as UnlinkIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../utils/dateFormat';
import api from '../services/api';

interface Txn { id: string; description: string; }

interface JeLine { account_code: string; account_name: string; debit: string; credit: string; }
interface Detail {
  type: 'categorization' | 'bill' | null;
  amount?: string;
  categorized_by?: string;
  created_at?: string;
  journal_entry?: { id: string; entry_number: string; date: string; lines: JeLine[] };
  bill?: { id: string; bill_number: string; supplier_name: string | null; total: string; status: string };
}

interface Props {
  open: boolean;
  txn: Txn | null;
  onClose: () => void;
  onRemoved: (txnId: string) => void;
  onEdit: (txn: Txn) => void;
}

const ReconciliationDetailDialog: React.FC<Props> = ({ open, txn, onClose, onRemoved, onEdit }) => {
  const { t, i18n } = useTranslation();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !txn) return;
    setDetail(null);
    setError('');
    setLoading(true);
    api.get(`/transactions/${txn.id}/reconciliation`)
      .then(r => { if (r.data.success) setDetail(r.data.data); })
      .catch(() => setError(t('common.error')))
      .finally(() => setLoading(false));
  }, [open, txn, t]);

  const doDelete = async (): Promise<boolean> => {
    if (!txn) return false;
    setBusy(true);
    setError('');
    try {
      const res = await api.delete(`/transactions/${txn.id}/reconciliation`);
      return !!res.data.success;
    } catch (err: any) {
      setError(err.response?.data?.message || t('common.error'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (await doDelete() && txn) onRemoved(txn.id);
  };
  const handleEdit = async () => {
    if (await doDelete() && txn) onEdit(txn);
  };

  const fmt = (v: string) => parseFloat(v || '0').toLocaleString(i18n.language, { minimumFractionDigits: 2 });

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('billMatching.reconciledWith')}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
        ) : detail?.type === 'categorization' && detail.journal_entry ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('billMatching.bookedToAccount')} · {detail.journal_entry.entry_number} · {formatDate(detail.journal_entry.date)}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.journal_entry.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.account_code} — {l.account_name}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{parseFloat(l.debit) ? fmt(l.debit) : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{parseFloat(l.credit) ? fmt(l.credit) : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        ) : detail?.type === 'bill' && detail.bill ? (
          <Box sx={{ p: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{t('billMatching.matchedToBill')}</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>{detail.bill.bill_number} — {detail.bill.supplier_name || '—'}</Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {t('common.total')}: {fmt(detail.bill.total)}{' '}
              <Chip size="small" label={detail.bill.status} sx={{ ml: 1, height: 20 }} />
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            {t('billMatching.notReconciled')}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('common.close')}</Button>
        {detail?.type === 'categorization' && (
          <Button onClick={handleEdit} disabled={busy} startIcon={<EditIcon sx={{ fontSize: 16 }} />}>
            {t('common.edit')}
          </Button>
        )}
        {(detail?.type === 'categorization' || detail?.type === 'bill') && (
          <Button onClick={handleRemove} disabled={busy} color="error" variant="outlined"
            startIcon={busy ? <CircularProgress size={14} /> : <UnlinkIcon sx={{ fontSize: 16 }} />}>
            {t('billMatching.removeReconciliation')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ReconciliationDetailDialog;
