import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, TextField, MenuItem, Paper, Alert, CircularProgress,
} from '@mui/material';
import { Save as SaveIcon, CloudUpload as UploadIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface CompanySettings {
  company_name: string;
  address: string;
  city: string;
  country: string;
  tax_id: string;
  phone: string;
  email: string;
  currency: string;
  fiscal_year_start_month: number;
  date_format: string;
  logo1: string;
  logo2: string;
  logo3: string;
}

const EMPTY_SETTINGS: CompanySettings = {
  company_name: '',
  address: '',
  city: '',
  country: '',
  tax_id: '',
  phone: '',
  email: '',
  currency: 'MAD',
  fiscal_year_start_month: 1,
  date_format: 'DD-MM-YYYY',
  logo1: '',
  logo2: '',
  logo3: '',
};

const DATE_FORMAT_OPTIONS = [
  { value: 'DD-MM-YYYY', label: '31-12-2025' },
  { value: 'DD/MM/YYYY', label: '31/12/2025' },
  { value: 'DD.MM.YYYY', label: '31.12.2025' },
  { value: 'MM/DD/YYYY', label: '12/31/2025' },
  { value: 'YYYY-MM-DD', label: '2025-12-31' },
];

const Settings: React.FC = () => {
  const { t } = useTranslation();

  const MONTH_OPTIONS = [
    { value: 1, label: t('settings.months.1') },
    { value: 2, label: t('settings.months.2') },
    { value: 3, label: t('settings.months.3') },
    { value: 4, label: t('settings.months.4') },
    { value: 5, label: t('settings.months.5') },
    { value: 6, label: t('settings.months.6') },
    { value: 7, label: t('settings.months.7') },
    { value: 8, label: t('settings.months.8') },
    { value: 9, label: t('settings.months.9') },
    { value: 10, label: t('settings.months.10') },
    { value: 11, label: t('settings.months.11') },
    { value: 12, label: t('settings.months.12') },
  ];

  const [form, setForm] = useState<CompanySettings>({ ...EMPTY_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings');
      if (res.data.success) {
        const data = res.data.data?.settings ?? res.data.settings ?? res.data.data ?? {};
        setForm({
          company_name: data.company_name || '',
          address: data.address || '',
          city: data.city || '',
          country: data.country || '',
          tax_id: data.tax_id || '',
          phone: data.phone || '',
          email: data.email || '',
          currency: data.currency || 'MAD',
          fiscal_year_start_month: data.fiscal_year_start_month || 1,
          date_format: data.date_format || 'DD-MM-YYYY',
          logo1: data.logo1 || '',
          logo2: data.logo2 || '',
          logo3: data.logo3 || '',
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('settings.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleLogoChange = (slot: 'logo1' | 'logo2' | 'logo3') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError(t('settings.logoTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, [slot]: ev.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      const payload = {
        ...form,
        fiscal_year_start_month: Number(form.fiscal_year_start_month),
      };
      await api.put('/settings', payload);
      localStorage.setItem('bk_date_format', form.date_format);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || t('settings.errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('settings.title')}</Typography>

      {/* Alerts */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
          {t('settings.settingsSaved')}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Form */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, maxWidth: 700 }}>
          {/* Company Name */}
          <TextField
            label={t('settings.companyName')}
            value={form.company_name}
            size="small"
            fullWidth
            onChange={e => setForm({ ...form, company_name: e.target.value })}
          />

          {/* Address */}
          <TextField
            label={t('common.address')}
            value={form.address}
            size="small"
            fullWidth
            multiline
            rows={2}
            onChange={e => setForm({ ...form, address: e.target.value })}
          />

          {/* City + Country */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('settings.city')}
              value={form.city}
              size="small"
              fullWidth
              onChange={e => setForm({ ...form, city: e.target.value })}
            />
            <TextField
              label={t('settings.country')}
              value={form.country}
              size="small"
              fullWidth
              onChange={e => setForm({ ...form, country: e.target.value })}
            />
          </Box>

          {/* Tax ID + Phone */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('settings.taxId')}
              value={form.tax_id}
              size="small"
              fullWidth
              onChange={e => setForm({ ...form, tax_id: e.target.value })}
            />
            <TextField
              label={t('common.phone')}
              value={form.phone}
              size="small"
              fullWidth
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </Box>

          {/* Email */}
          <TextField
            label={t('common.email')}
            value={form.email}
            size="small"
            fullWidth
            type="email"
            onChange={e => setForm({ ...form, email: e.target.value })}
          />

          {/* Currency + Fiscal Year */}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('common.currency')}
              value={form.currency}
              size="small"
              sx={{ width: 140 }}
              onChange={e => setForm({ ...form, currency: e.target.value })}
            />
            <TextField
              label={t('settings.fiscalYearStart')}
              value={form.fiscal_year_start_month}
              size="small"
              select
              fullWidth
              onChange={e => setForm({ ...form, fiscal_year_start_month: Number(e.target.value) })}
            >
              {MONTH_OPTIONS.map(m => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
          </Box>

          {/* Date Format */}
          <TextField
            label={t('settings.dateFormat')}
            value={form.date_format}
            size="small"
            select
            sx={{ width: 240 }}
            onChange={e => setForm({ ...form, date_format: e.target.value })}
          >
            {DATE_FORMAT_OPTIONS.map(opt => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
              </MenuItem>
            ))}
          </TextField>

          {/* Logos */}
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{t('settings.logos')}</Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {([
                { key: 'logo1' as const, label: t('settings.logo1') },
                { key: 'logo2' as const, label: t('settings.logo2') },
                { key: 'logo3' as const, label: t('settings.logo3') },
              ]).map(slot => (
                <Box key={slot.key} sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: 180 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>{slot.label}</Typography>
                  <Box sx={{ height: 80, border: '1px dashed #c0c0c0', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#fafafa' }}>
                    {form[slot.key] ? (
                      <Box component="img" src={form[slot.key]} alt={slot.label}
                        sx={{ maxWidth: 160, maxHeight: 72, objectFit: 'contain', p: 0.5 }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">—</Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" component="label" startIcon={<UploadIcon />} size="small">
                      {t('settings.selectLogo')}
                      <input type="file" accept="image/*" hidden onChange={handleLogoChange(slot.key)} />
                    </Button>
                    {form[slot.key] && (
                      <Button size="small" color="error" onClick={() => setForm(prev => ({ ...prev, [slot.key]: '' }))}>
                        {t('common.delete')}
                      </Button>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Save Button */}
          <Box sx={{ mt: 1 }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{ bgcolor: '#2e7d32' }}
            >
              {saving ? t('common.saving') : t('settings.saveSettings')}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
