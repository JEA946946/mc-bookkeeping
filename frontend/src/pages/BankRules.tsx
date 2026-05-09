import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Alert, CircularProgress,
  Checkbox, FormControlLabel, Autocomplete, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Science as TestIcon, CheckCircle as MatchedIcon, Cancel as NoMatchIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Account {
  id: string;
  code: string;
  name: string;
  label: string;
}

interface BankRule {
  id: string;
  pattern: string;
  match_type: 'contains' | 'regex';
  match_field: 'description' | 'reference';
  account_id: string;
  account_code: string;
  account_name: string;
  description_template: string;
  priority: number;
  is_active: boolean;
  created_at: string;
}

interface TestResult {
  matched: boolean;
  rule_id?: string;
  pattern?: string;
  account_code?: string;
  account_name?: string;
  generated_description?: string;
}

const BankRules: React.FC = () => {
  const { t } = useTranslation();

  const MATCH_TYPE_OPTIONS = [
    { value: 'contains', label: t('bankRules.contains') },
    { value: 'regex', label: t('bankRules.regex') },
  ];

  const MATCH_FIELD_OPTIONS = [
    { value: 'description', label: t('bankRules.descriptionField') },
    { value: 'reference', label: t('bankRules.referenceField') },
  ];

  const [rules, setRules] = useState<BankRule[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BankRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    pattern: '',
    match_type: 'contains' as 'contains' | 'regex',
    match_field: 'description' as 'description' | 'reference',
    account_id: '',
    description_template: '',
    priority: 0,
    is_active: true,
  });
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  // Test dialog
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testText, setTestText] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [testRuleId, setTestRuleId] = useState<string | null>(null);

  const fetchRules = useCallback(() => {
    api.get('/bank-rules').then(res => {
      if (res.data.success) {
        setRules(res.data.data.rules || res.data.data.bank_rules || []);
      }
    }).catch(() => {});
  }, []);

  const fetchAccounts = useCallback(() => {
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) {
        const accts: Account[] = res.data.data.accounts.map((a: any) => ({
          ...a,
          label: `${a.code} — ${a.name}`,
        }));
        setAccounts(accts);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchRules();
    fetchAccounts();
  }, [fetchRules, fetchAccounts]);

  const handleOpenDialog = (rule?: BankRule) => {
    if (rule) {
      setEditing(rule);
      setForm({
        pattern: rule.pattern,
        match_type: rule.match_type,
        match_field: rule.match_field,
        account_id: rule.account_id,
        description_template: rule.description_template,
        priority: rule.priority,
        is_active: rule.is_active,
      });
      const acct = accounts.find(a => a.id === rule.account_id) || null;
      setSelectedAccount(acct);
    } else {
      setEditing(null);
      setForm({
        pattern: '',
        match_type: 'contains',
        match_field: 'description',
        account_id: '',
        description_template: '',
        priority: 0,
        is_active: true,
      });
      setSelectedAccount(null);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.pattern || !form.account_id) return;
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/bank-rules/${editing.id}`, form);
      } else {
        await api.post('/bank-rules', form);
      }
      setDialogOpen(false);
      setSuccess(editing ? t('bankRules.ruleUpdated') : t('bankRules.ruleCreated'));
      fetchRules();
    } catch (err: any) {
      setError(err.response?.data?.message || t('bankRules.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('bankRules.deleteConfirm'))) return;
    setError('');
    try {
      await api.delete(`/bank-rules/${id}`);
      setSuccess(t('bankRules.ruleDeleted'));
      fetchRules();
    } catch (err: any) {
      setError(err.response?.data?.message || t('bankRules.deleteError'));
    }
  };

  const handleOpenTest = (ruleId?: string) => {
    setTestRuleId(ruleId || null);
    setTestText('');
    setTestResult(null);
    setTestDialogOpen(true);
  };

  const handleTest = async () => {
    if (!testText) return;
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const payload: any = { text: testText };
      if (testRuleId) {
        payload.rule_id = testRuleId;
      }
      const res = await api.post('/bank-rules/test', payload);
      if (res.data.success) {
        setTestResult(res.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('bankRules.testError'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('bankRules.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<TestIcon />}
            onClick={() => handleOpenTest()}
          >
            {t('bankRules.testRules')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {t('bankRules.addRule')}
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('bankRules.pattern')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('bankRules.matchType')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('bankRules.matchField')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('bankRules.descriptionTemplate')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>{t('bankRules.priority')}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>{t('common.active')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map(rule => (
              <TableRow key={rule.id} hover sx={{ opacity: rule.is_active ? 1 : 0.5 }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {rule.pattern}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={rule.match_type === 'contains' ? t('bankRules.contains') : t('bankRules.regex')}
                    size="small"
                    sx={{
                      bgcolor: rule.match_type === 'contains' ? '#1976d2' : '#7b1fa2',
                      color: '#fff',
                      height: 22,
                      fontSize: '11px',
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={rule.match_field === 'description' ? t('bankRules.descriptionField') : t('bankRules.referenceField')}
                    size="small"
                    variant="outlined"
                    sx={{ height: 22, fontSize: '11px' }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {rule.account_code}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {rule.account_name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rule.description_template || '—'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {rule.priority}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={rule.is_active ? t('common.yes') : t('common.no')}
                    size="small"
                    sx={{
                      bgcolor: rule.is_active ? '#2e7d32' : '#9e9e9e',
                      color: '#fff',
                      height: 20,
                      fontSize: '11px',
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('bankRules.test')}>
                    <IconButton size="small" onClick={() => handleOpenTest(rule.id)}>
                      <TestIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.edit')}>
                    <IconButton size="small" onClick={() => handleOpenDialog(rule)}>
                      <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('bankRules.noRules')}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('bankRules.editRule') : t('bankRules.addRule')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('bankRules.pattern')}
              value={form.pattern}
              onChange={e => setForm({ ...form, pattern: e.target.value })}
              size="small"
              fullWidth
              autoFocus
              helperText={form.match_type === 'regex' ? t('bankRules.regexHelp') : t('bankRules.containsHelp')}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label={t('bankRules.matchType')}
                value={form.match_type}
                onChange={e => setForm({ ...form, match_type: e.target.value as 'contains' | 'regex' })}
                size="small"
                fullWidth
              >
                {MATCH_TYPE_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('bankRules.matchField')}
                value={form.match_field}
                onChange={e => setForm({ ...form, match_field: e.target.value as 'description' | 'reference' })}
                size="small"
                fullWidth
              >
                {MATCH_FIELD_OPTIONS.map(o => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
            </Box>
            <Autocomplete
              size="small"
              options={accounts}
              value={selectedAccount}
              onChange={(_, val) => {
                setSelectedAccount(val);
                setForm(prev => ({ ...prev, account_id: val?.id || '' }));
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => (
                <TextField {...params} label={t('common.account')} variant="outlined" />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>
                    {option.code}
                  </Typography>
                  {option.name}
                </li>
              )}
              filterOptions={(options, { inputValue }) => {
                if (!inputValue) return options.slice(0, 50);
                const q = inputValue.toLowerCase();
                return options.filter(o =>
                  o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
                ).slice(0, 50);
              }}
              ListboxProps={{ style: { maxHeight: 200 } }}
            />
            <TextField
              label={t('bankRules.descriptionTemplate')}
              value={form.description_template}
              onChange={e => setForm({ ...form, description_template: e.target.value })}
              size="small"
              fullWidth
              helperText={t('bankRules.descriptionTemplateHelp')}
            />
            <TextField
              label={t('bankRules.priority')}
              type="number"
              value={form.priority}
              onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
              size="small"
              fullWidth
              helperText={t('bankRules.priorityHelp')}
              inputProps={{ min: 0 }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.is_active}
                  onChange={e => setForm({ ...form, is_active: e.target.checked })}
                />
              }
              label={t('common.active')}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.pattern || !form.account_id}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {saving ? t('common.saving') : (editing ? t('common.save') : t('common.create'))}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test Dialog */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('bankRules.test')} {testRuleId ? t('bankRules.rule') : t('bankRules.allRules')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('bankRules.testText')}
              value={testText}
              onChange={e => setTestText(e.target.value)}
              size="small"
              fullWidth
              autoFocus
              multiline
              rows={2}
              helperText={t('bankRules.testHelp')}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleTest();
                }
              }}
            />
            <Button
              variant="contained"
              onClick={handleTest}
              disabled={testing || !testText}
              startIcon={testing ? <CircularProgress size={16} /> : <TestIcon />}
              sx={{ alignSelf: 'flex-start' }}
            >
              {testing ? t('bankRules.testing') : t('bankRules.test')}
            </Button>

            {testResult && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: testResult.matched ? '#e8f5e9' : '#fff3e0',
                  borderColor: testResult.matched ? '#2e7d32' : '#ed6c02',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {testResult.matched ? (
                    <MatchedIcon sx={{ color: '#2e7d32' }} />
                  ) : (
                    <NoMatchIcon sx={{ color: '#ed6c02' }} />
                  )}
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {testResult.matched ? t('bankRules.matchFound') : t('bankRules.noMatch')}
                  </Typography>
                </Box>
                {testResult.matched && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, ml: 4 }}>
                    <Typography variant="body2">
                      <strong>{t('bankRules.pattern')}:</strong> {testResult.pattern}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('common.account')}:</strong>{' '}
                      <Typography component="span" variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {testResult.account_code}
                      </Typography>
                      {' — '}{testResult.account_name}
                    </Typography>
                    {testResult.generated_description && (
                      <Typography variant="body2">
                        <strong>{t('bankRules.generatedDescription')}:</strong> {testResult.generated_description}
                      </Typography>
                    )}
                  </Box>
                )}
              </Paper>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BankRules;
