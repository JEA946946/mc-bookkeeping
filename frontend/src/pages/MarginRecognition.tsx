import React, { useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, TextField, Alert,
  CircularProgress,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface PreviewData {
  client_funds_received: string;
  supplier_costs_paid: string;
  margin: string;
  tva: string;
  already_exists: boolean;
  existing_margin_entries: number;
  existing_tva_entries: number;
}

const MarginRecognition: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handlePreview = async () => {
    if (!dateFrom || !dateTo) {
      setError(t('margin.selectBothDates'));
      return;
    }
    setError('');
    setSuccess('');
    setPreview(null);
    setLoading(true);
    try {
      const res = await api.post('/margin-recognition/preview', { date_from: dateFrom, date_to: dateTo });
      if (res.data.success) {
        setPreview(res.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('margin.errorPreview'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!dateFrom || !dateTo || !entryDate) {
      setError(t('margin.fillAllDates'));
      return;
    }
    setError('');
    setSuccess('');
    setCreating(true);
    try {
      const res = await api.post('/margin-recognition/create', {
        date_from: dateFrom,
        date_to: dateTo,
        entry_date: entryDate,
      });
      if (res.data.success) {
        setSuccess(res.data.message);
        setPreview(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('margin.errorCreating'));
    } finally {
      setCreating(false);
    }
  };

  const fmt = (val: string) => parseFloat(val || '0').toLocaleString(i18n.language, { minimumFractionDigits: 2 });

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>{t('margin.title')}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            {t('margin.selectPeriod')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label={t('common.from')} type="date" value={dateFrom} size="small"
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
            />
            <TextField
              label={t('common.to')} type="date" value={dateTo} size="small"
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
            />
            <Button
              variant="contained"
              onClick={handlePreview}
              disabled={loading || !dateFrom || !dateTo}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
              sx={{ bgcolor: '#2e7d32' }}
            >
              {loading ? t('margin.calculating') : t('margin.preview')}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card sx={{ mb: 3, border: '1px solid #e0e0e0' }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                {t('margin.calculationPreview')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mb: 2 }}>
                <Box sx={{ textAlign: 'center', flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">{t('margin.clientFundsReceived')}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#2e7d32' }}>
                    {fmt(preview.client_funds_received)} MAD
                  </Typography>
                </Box>
                <Typography variant="h5" color="text.secondary">-</Typography>
                <Box sx={{ textAlign: 'center', flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">{t('margin.supplierCostsPaid')}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#e65100' }}>
                    {fmt(preview.supplier_costs_paid)} MAD
                  </Typography>
                </Box>
                <Typography variant="h5" color="text.secondary">=</Typography>
                <Box sx={{ textAlign: 'center', flex: 1 }}>
                  <Typography variant="caption" color="text.secondary">{t('margin.marginLabel')}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#1565c0' }}>
                    {fmt(preview.margin)} MAD
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 3 }}>
                <Card sx={{ flex: 1, bgcolor: '#e3f2fd' }}>
                  <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{t('margin.tvaOnMargin')}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1565c0' }}>
                      {fmt(preview.tva)} MAD
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            </CardContent>
          </Card>

          {preview.already_exists && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              {t('margin.alreadyExists', { margin: preview.existing_margin_entries, tva: preview.existing_tva_entries })}
            </Alert>
          )}

          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                {t('margin.createJournalEntries')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('margin.willCreateEntries', { margin: fmt(preview.margin), tva: fmt(preview.tva) })}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TextField
                  label={t('margin.entryDate')} type="date" value={entryDate} size="small"
                  onChange={e => setEntryDate(e.target.value)}
                  InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
                />
                <Button
                  variant="contained"
                  onClick={handleCreate}
                  disabled={creating || parseFloat(preview.margin) <= 0}
                  startIcon={creating ? <CircularProgress size={16} /> : undefined}
                  sx={{ bgcolor: '#2e7d32' }}
                >
                  {creating ? t('margin.creatingEntries') : t('margin.createEntries')}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
};

export default MarginRecognition;
