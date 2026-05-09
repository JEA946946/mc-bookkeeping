import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  ExpandMore, ExpandLess, RemoveRedEye as ViewIcon,
  Upload as UploadIcon, Download as DownloadIcon,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { exportToCSV } from '../utils/csvExport';
import ImportDialog from '../components/ImportDialog';

interface AccountType {
  id: number;
  name: string;
  normal_balance: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  account_type_id: number;
  account_type_name: string;
  normal_balance: string;
  parent_id: string | null;
  currency: string;
  description: string;
  is_active: boolean;
}

interface LedgerLine {
  id: string;
  date: string;
  entry_number: string;
  description: string;
  debit: string;
  credit: string;
  running_balance: string;
}

const TYPE_COLORS: Record<string, string> = {
  Asset: '#1976d2',
  Liability: '#e65100',
  Equity: '#7b1fa2',
  Revenue: '#2e7d32',
  Expense: '#d32f2f',
};

const ChartOfAccounts: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Ledger dialog state
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerAccount, setLedgerAccount] = useState<Account | null>(null);
  const [ledgerLines, setLedgerLines] = useState<LedgerLine[]>([]);
  const [ledgerTotalDebit, setLedgerTotalDebit] = useState('0');
  const [ledgerTotalCredit, setLedgerTotalCredit] = useState('0');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');

  // Form state
  const [form, setForm] = useState({ code: '', name: '', account_type_id: '', parent_id: '', currency: 'MAD', description: '' });

  const fetchData = () => {
    api.get('/accounts').then(res => {
      if (res.data.success) setAccounts(res.data.data.accounts);
    });
    api.get('/accounts/types').then(res => {
      if (res.data.success) setAccountTypes(res.data.data.account_types);
    });
  };

  useEffect(() => { fetchData(); }, []);

  // Handle URL param for drill-down
  useEffect(() => {
    const ledgerId = searchParams.get('ledger');
    if (ledgerId && accounts.length > 0) {
      const acct = accounts.find(a => a.id === ledgerId);
      if (acct) {
        openLedger(acct);
      }
    }
  }, [searchParams, accounts]);

  const openLedger = (account: Account) => {
    setLedgerAccount(account);
    setLedgerDateFrom('');
    setLedgerDateTo('');
    setLedgerOpen(true);
    fetchLedger(account.id, '', '');
  };

  const fetchLedger = (accountId: string, dateFrom: string, dateTo: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/accounts/${accountId}/ledger${qs}`).then(res => {
      if (res.data.success) {
        setLedgerLines(res.data.data.lines);
        setLedgerTotalDebit(res.data.data.total_debit);
        setLedgerTotalCredit(res.data.data.total_credit);
      }
    });
  };

  const handleLedgerFilter = () => {
    if (ledgerAccount) {
      fetchLedger(ledgerAccount.id, ledgerDateFrom, ledgerDateTo);
    }
  };

  const closeLedger = () => {
    setLedgerOpen(false);
    setLedgerAccount(null);
    setLedgerLines([]);
    // Clear URL param
    if (searchParams.has('ledger')) {
      searchParams.delete('ledger');
      setSearchParams(searchParams, { replace: true });
    }
  };

  const handleOpen = (account?: Account) => {
    if (account) {
      setEditing(account);
      setForm({
        code: account.code,
        name: account.name,
        account_type_id: String(account.account_type_id),
        parent_id: account.parent_id || '',
        currency: account.currency,
        description: account.description,
      });
    } else {
      setEditing(null);
      setForm({ code: '', name: '', account_type_id: '', parent_id: '', currency: 'MAD', description: '' });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      account_type_id: parseInt(form.account_type_id),
      parent_id: form.parent_id || null,
    };
    try {
      if (editing) {
        await api.put(`/accounts/${editing.id}`, payload);
      } else {
        await api.post('/accounts', payload);
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || t('accounts.errorSaving'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('accounts.deactivateConfirm'))) return;
    await api.delete(`/accounts/${id}`);
    fetchData();
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Import/Export
  const [importOpen, setImportOpen] = useState(false);

  const handleExportAccounts = () => {
    const headers = ['code', 'name', 'account_type', 'parent_code', 'currency', 'description'];
    const codeToAccount = Object.fromEntries(accounts.map(a => [a.id, a]));
    const rows = accounts.map(a => {
      const parent = a.parent_id ? codeToAccount[a.parent_id] : null;
      return [
        a.code, a.name, a.account_type_name, parent ? parent.code : '',
        a.currency, a.description,
      ];
    });
    exportToCSV('chart_of_accounts.csv', headers, rows);
  };

  // Build tree structure
  const topLevel = accounts.filter(a => !a.parent_id);
  const childrenOf = (parentId: string) => accounts.filter(a => a.parent_id === parentId);

  const renderRow = (account: Account, depth: number = 0) => {
    const children = childrenOf(account.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded[account.id] !== false; // default expanded

    return (
      <React.Fragment key={account.id}>
        <TableRow hover sx={{ opacity: account.is_active ? 1 : 0.5 }}>
          <TableCell sx={{ pl: 2 + depth * 3, whiteSpace: 'nowrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {hasChildren && (
                <IconButton size="small" onClick={() => toggleExpand(account.id)} sx={{ p: 0 }}>
                  {isExpanded ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                </IconButton>
              )}
              <Typography variant="body2" sx={{ fontWeight: hasChildren ? 600 : 400, fontFamily: 'monospace' }}>
                {account.code}
              </Typography>
            </Box>
          </TableCell>
          <TableCell>
            <Typography variant="body2" sx={{ fontWeight: hasChildren ? 600 : 400 }}>
              {account.name}
            </Typography>
          </TableCell>
          <TableCell>
            <Chip
              label={account.account_type_name}
              size="small"
              sx={{ bgcolor: TYPE_COLORS[account.account_type_name] || '#666', color: '#fff', height: 20, fontSize: '11px' }}
            />
          </TableCell>
          <TableCell>
            <Typography variant="caption">{account.normal_balance}</Typography>
          </TableCell>
          <TableCell>{account.currency}</TableCell>
          <TableCell align="right">
            <IconButton size="small" onClick={() => openLedger(account)}><ViewIcon sx={{ fontSize: 16 }} /></IconButton>
            <IconButton size="small" onClick={() => handleOpen(account)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
            <IconButton size="small" onClick={() => handleDelete(account.id)} color="error"><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
          </TableCell>
        </TableRow>
        {hasChildren && isExpanded && children.map(child => renderRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('accounts.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportAccounts} size="small">
            {t('importExport.export')}
          </Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)} size="small">
            {t('importExport.import')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
            {t('accounts.addAccount')}
          </Button>
        </Box>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.code')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.type')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('accounts.normalBalance')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.currency')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {topLevel.map(a => renderRow(a))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('accounts.editAccount') : t('accounts.addAccount')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('common.code')} value={form.code} size="small" sx={{ width: 120 }}
                onChange={e => setForm({ ...form, code: e.target.value })}
              />
              <TextField
                label={t('common.name')} value={form.name} size="small" fullWidth
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('accounts.accountType')} value={form.account_type_id} size="small" select fullWidth
                onChange={e => setForm({ ...form, account_type_id: e.target.value })}
              >
                {accountTypes.map(at => (
                  <MenuItem key={at.id} value={String(at.id)}>{at.name} ({at.normal_balance})</MenuItem>
                ))}
              </TextField>
              <TextField
                label={t('common.currency')} value={form.currency} size="small" sx={{ width: 100 }}
                onChange={e => setForm({ ...form, currency: e.target.value })}
              />
            </Box>
            <TextField
              label={t('accounts.parentAccount')} value={form.parent_id} size="small" select fullWidth
              onChange={e => setForm({ ...form, parent_id: e.target.value })}
            >
              <MenuItem value="">{t('accounts.noParent')}</MenuItem>
              {accounts.filter(a => a.id !== editing?.id).map(a => (
                <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={t('common.description')} value={form.description} size="small" multiline rows={2}
              onChange={e => setForm({ ...form, description: e.target.value })}
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

      {/* Ledger Dialog */}
      <Dialog open={ledgerOpen} onClose={closeLedger} maxWidth="lg" fullWidth>
        <DialogTitle>
          {t('accounts.accountLedger')} — {ledgerAccount?.code} {ledgerAccount?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2, mt: 1 }}>
            <TextField
              label={t('common.from')} type="date" value={ledgerDateFrom} size="small"
              onChange={e => setLedgerDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
            />
            <TextField
              label={t('common.to')} type="date" value={ledgerDateTo} size="small"
              onChange={e => setLedgerDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
            />
            <Button variant="outlined" size="small" onClick={handleLedgerFilter}>
              {t('common.apply')}
            </Button>
          </Box>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('accounts.entryNumber')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('accounts.runningBalance')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerLines.map((line) => (
                  <TableRow key={line.id} hover>
                    <TableCell>{line.date}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{line.entry_number}</Typography>
                    </TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell align="right">
                      {parseFloat(line.debit) > 0 ? parseFloat(line.debit).toLocaleString(i18n.language) : ''}
                    </TableCell>
                    <TableCell align="right">
                      {parseFloat(line.credit) > 0 ? parseFloat(line.credit).toLocaleString(i18n.language) : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 500 }}>
                      {parseFloat(line.running_balance).toLocaleString(i18n.language)}
                    </TableCell>
                  </TableRow>
                ))}
                {ledgerLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                      <Typography variant="body2" color="text.secondary">{t('accounts.noTransactions')}</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {ledgerLines.length > 0 && (
                  <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                    <TableCell colSpan={3} sx={{ fontWeight: 700 }}>{t('common.totals')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {parseFloat(ledgerTotalDebit).toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {parseFloat(ledgerTotalCredit).toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeLedger}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={fetchData}
        previewEndpoint="/accounts/import/preview"
        confirmEndpoint="/accounts/import/confirm"
        templateColumns={['code', 'name', 'account_type', 'parent_code', 'currency', 'description']}
        entityName={t('accounts.title')}
      />
    </Box>
  );
};

export default ChartOfAccounts;
