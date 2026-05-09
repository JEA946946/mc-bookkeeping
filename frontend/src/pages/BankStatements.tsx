import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, MenuItem, Alert, Stepper, Step,
  StepLabel, CircularProgress, Link, Autocomplete, Dialog, DialogTitle,
  DialogContent, DialogActions,
} from '@mui/material';
import { CloudUpload as UploadIcon, CheckCircle as ConfirmIcon, AutoFixHigh as AutoMapIcon, Add as AddIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Account {
  id: string;
  code: string;
  name: string;
  label: string; // "code — name" for display
}

interface ParsedTransaction {
  date: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  account_id: string | null;
  account_code?: string;
  account_name?: string;
}

const ADD_ACCOUNT_SENTINEL: Account = { id: '__add__', code: '', name: '', label: '+ Add Account' };

// Memoized row to prevent re-rendering all rows when one account changes
const TxnRow = memo(({
  txn, index, accounts, accountMap, onAccountChange, onAddAccount,
}: {
  txn: ParsedTransaction;
  index: number;
  accounts: Account[];
  accountMap: Map<string, Account>;
  onAccountChange: (index: number, account: Account | null) => void;
  onAddAccount: (index: number, searchText: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const selected = txn.account_id ? accountMap.get(txn.account_id) || null : null;

  return (
    <TableRow hover sx={{ '& td': { py: 0.3 } }}>
      <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.date}</TableCell>
      <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {txn.description}
      </TableCell>
      <TableCell>{txn.reference}</TableCell>
      <TableCell align="right">
        {parseFloat(txn.debit) > 0 ? parseFloat(txn.debit).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
      </TableCell>
      <TableCell align="right">
        {parseFloat(txn.credit) > 0 ? parseFloat(txn.credit).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
      </TableCell>
      <TableCell sx={{ p: 0.5 }}>
        <Autocomplete
          size="small"
          options={accounts}
          value={selected}
          onChange={(_, val) => {
            if (val && val.id === '__add__') {
              onAddAccount(index, '');
              return;
            }
            onAccountChange(index, val);
          }}
          getOptionLabel={(o) => o.id === '__add__' ? o.label : o.label}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="outlined"
              sx={{
                minWidth: 250,
                '& .MuiOutlinedInput-root': {
                  bgcolor: txn.account_id ? 'inherit' : '#fff3e0',
                },
              }}
            />
          )}
          renderOption={(props, option) => (
            option.id === '__add__' ? (
              <li {...props} key="__add__" style={{ borderTop: '1px solid #eee' }}>
                <AddIcon sx={{ fontSize: 18, mr: 0.5, color: '#1976d2' }} />
                <Typography variant="body2" sx={{ color: '#1976d2', fontWeight: 600 }}>
                  {t('bankStatements.addAccount')}
                </Typography>
              </li>
            ) : (
              <li {...props} key={option.id}>
                <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>
                  {option.code}
                </Typography>
                {option.name}
              </li>
            )
          )}
          filterOptions={(options, { inputValue: iv }) => {
            let filtered: Account[];
            if (!iv) {
              filtered = options.filter(o => o.id !== '__add__').slice(0, 50);
            } else {
              const q = iv.toLowerCase();
              filtered = options.filter(o =>
                o.id !== '__add__' && (o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q))
              ).slice(0, 50);
            }
            filtered.push(ADD_ACCOUNT_SENTINEL);  // always last
            return filtered;
          }}
          ListboxProps={{ style: { maxHeight: 200 } }}
        />
      </TableCell>
    </TableRow>
  );
});

interface UploadRecord {
  id: string;
  filename: string;
  bank_account_code: string;
  bank_account_name: string;
  date_from: string | null;
  date_to: string | null;
  transaction_count: number;
  uploaded_by: string;
  uploaded_at: string;
}

const BankStatements: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const steps = [t('bankStatements.uploadFile'), t('bankStatements.reviewMap'), t('bankStatements.done')];

  const [activeStep, setActiveStep] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [accountMap, setAccountMap] = useState<Map<string, Account>>(new Map());
  const [selectedBank, setSelectedBank] = useState('');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [fileFormat, setFileFormat] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [autoMapping, setAutoMapping] = useState(false);
  const [error, setError] = useState('');
  const [createdCount, setCreatedCount] = useState(0);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);

  // Add Account dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForIndex, setAddForIndex] = useState<number>(-1);
  const [newAcctCode, setNewAcctCode] = useState('');
  const [newAcctName, setNewAcctName] = useState('');
  const [newAcctTypeId, setNewAcctTypeId] = useState('5'); // default Expense
  const [newAcctParentId, setNewAcctParentId] = useState('');
  const [addingSaving, setAddingSaving] = useState(false);
  const [addError, setAddError] = useState('');

  const fetchHistory = () => {
    api.get('/bank-statements/history').then(res => {
      if (res.data.success) setUploadHistory(res.data.data.uploads);
    }).catch(() => {});
  };

  useEffect(() => {
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) {
        const accts: Account[] = res.data.data.accounts.map((a: any) => ({
          ...a,
          label: `${a.code} — ${a.name}`,
        }));
        setAllAccounts([...accts, ADD_ACCOUNT_SENTINEL]);
        setBankAccounts(accts.filter(a => a.code.startsWith('10')));
        const map = new Map<string, Account>();
        accts.forEach((a: Account) => map.set(a.id, a));
        setAccountMap(map);
      }
    });
    fetchHistory();
  }, []);

  const handleUpload = async () => {
    if (!selectedFile || !selectedBank) return;
    const file = selectedFile;

    setError('');
    setDuplicateWarning('');
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bank_account_id', selectedBank);

    try {
      const res = await api.post('/bank-statements/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      if (res.data.success) {
        setTransactions(res.data.data.transactions);
        setFileFormat(res.data.data.format);
        if (res.data.data.duplicate_warning) {
          setDuplicateWarning(res.data.data.duplicate_warning);
        }
        setActiveStep(1);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('bankStatements.errorUploading'));
    } finally {
      setUploading(false);
    }
  };

  const handleAccountChange = useCallback((index: number, account: Account | null) => {
    setTransactions(prev => prev.map((t, i) => {
      if (i !== index) return t;
      return {
        ...t,
        account_id: account?.id || null,
        account_code: account?.code,
        account_name: account?.name,
      };
    }));
  }, []);

  const handleAddAccount = useCallback((index: number, searchText: string) => {
    setAddForIndex(index);
    setNewAcctCode('');
    setNewAcctName(searchText);
    setNewAcctTypeId('5');
    setNewAcctParentId('');
    setAddError('');
    setAddDialogOpen(true);
  }, []);

  const handleSaveNewAccount = async () => {
    if (!newAcctCode || !newAcctName) {
      setAddError(t('bankStatements.codeNameRequired'));
      return;
    }
    setAddError('');
    setAddingSaving(true);
    try {
      const res = await api.post('/accounts', {
        code: newAcctCode,
        name: newAcctName,
        account_type_id: parseInt(newAcctTypeId),
        parent_id: newAcctParentId || undefined,
      });
      if (res.data.success) {
        const created = res.data.data.account;
        const newAcct: Account = { ...created, label: `${created.code} — ${created.name}` };
        setAllAccounts(prev => {
          const real = prev.filter(a => a.id !== '__add__');
          real.push(newAcct);
          real.sort((a, b) => a.code.localeCompare(b.code));
          real.push(ADD_ACCOUNT_SENTINEL);
          return real;
        });
        setAccountMap(prev => new Map(prev).set(newAcct.id, newAcct));
        // Auto-select for the row that triggered the dialog
        if (addForIndex >= 0) {
          handleAccountChange(addForIndex, newAcct);
        }
        setAddDialogOpen(false);
      }
    } catch (err: any) {
      setAddError(err.response?.data?.message || t('bankStatements.errorCreatingAccount'));
    } finally {
      setAddingSaving(false);
    }
  };

  const allMapped = transactions.every(t => t.account_id);

  const totalDebit = transactions.reduce((sum, t) => sum + parseFloat(t.debit || '0'), 0);
  const totalCredit = transactions.reduce((sum, t) => sum + parseFloat(t.credit || '0'), 0);

  const handleAutoMap = async () => {
    setError('');
    setAutoMapping(true);
    try {
      const res = await api.post('/bank-statements/auto-map', {
        bank_account_id: selectedBank,
        transactions,
      }, { timeout: 60000 });
      if (res.data.success) {
        const suggestions = res.data.data.suggestions;
        const mapped = suggestions.filter((s: any, i: number) => s && !transactions[i].account_id).length;
        setTransactions(prev => prev.map((t, i) => {
          const s = suggestions[i];
          if (s && !t.account_id) {
            return { ...t, account_id: s.account_id, account_code: s.account_code, account_name: s.account_name };
          }
          return t;
        }));
        if (mapped === 0) {
          setError(t('bankStatements.noAutoMatches'));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('bankStatements.errorAutoMapping'));
    } finally {
      setAutoMapping(false);
    }
  };

  const handleConfirm = async () => {
    if (!allMapped) return;
    setError('');
    setConfirming(true);

    try {
      const res = await api.post('/bank-statements/confirm', {
        bank_account_id: selectedBank,
        transactions,
        filename: selectedFile?.name || 'bank_statement',
      }, { timeout: 60000 });
      if (res.data.success) {
        setCreatedCount(res.data.data.count);
        setActiveStep(2);
        fetchHistory();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('bankStatements.errorCreatingEntries'));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('bankStatements.title')}</Typography>

      <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
        {steps.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Step 1: Upload */}
      {activeStep === 0 && (
        <>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 500 }}>
            <TextField
              select
              label={t('bankStatements.bankAccount')}
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              size="small"
              fullWidth
            >
              {bankAccounts.map(a => (
                <MenuItem key={a.id} value={a.id}>
                  <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace', mr: 1 }}>{a.code}</Typography>
                  {a.name}
                </MenuItem>
              ))}
            </TextField>

            <Button
              variant="outlined"
              component="label"
              startIcon={<UploadIcon />}
            >
              {selectedFile?.name || t('bankStatements.selectFile')}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                hidden
                onChange={e => {
                  setSelectedFile(e.target.files?.[0] || null);
                }}
              />
            </Button>

            <Button
              variant="contained"
              onClick={handleUpload}
              disabled={!selectedBank || !selectedFile || uploading}
              startIcon={uploading ? <CircularProgress size={16} /> : <UploadIcon />}
              sx={{ bgcolor: '#2e7d32', alignSelf: 'flex-start' }}
            >
              {uploading ? t('bankStatements.uploading') : t('bankStatements.uploadParse')}
            </Button>
          </Box>
        </Paper>

        {/* Upload History */}
        {uploadHistory.length > 0 && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{t('bankStatements.uploadHistory')}</Typography>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.date')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('bankStatements.filename')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('bankStatements.bankAccount')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('bankStatements.period')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('bankStatements.transactions')}</TableCell>
                    <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('bankStatements.uploadedBy')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {uploadHistory.map(u => (
                    <TableRow key={u.id} hover>
                      <TableCell>{u.uploaded_at ? new Date(u.uploaded_at).toLocaleDateString() : ''}</TableCell>
                      <TableCell>{u.filename}</TableCell>
                      <TableCell>{u.bank_account_code} — {u.bank_account_name}</TableCell>
                      <TableCell>{u.date_from} {t('bankStatements.to')} {u.date_to}</TableCell>
                      <TableCell align="right">{u.transaction_count}</TableCell>
                      <TableCell>{u.uploaded_by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
        </>
      )}

      {/* Step 2: Review */}
      {activeStep === 1 && (
        <>
          {duplicateWarning && (
            <Alert severity="warning" sx={{ mb: 2 }}>{duplicateWarning}</Alert>
          )}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('bankStatements.transactionsParsed', { count: transactions.length, format: fileFormat })}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" size="small" onClick={() => { setActiveStep(0); setTransactions([]); setSelectedFile(null);}}>
                {t('common.back')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleAutoMap}
                disabled={autoMapping || allMapped}
                startIcon={autoMapping ? <CircularProgress size={16} /> : <AutoMapIcon />}
                color="secondary"
              >
                {autoMapping ? t('bankStatements.mapping') : t('bankStatements.autoMap')}
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleConfirm}
                disabled={!allMapped || confirming}
                startIcon={confirming ? <CircularProgress size={16} /> : <ConfirmIcon />}
                sx={{ bgcolor: '#2e7d32' }}
              >
                {confirming ? t('bankStatements.creating') : t('bankStatements.confirmCreate')}
              </Button>
            </Box>
          </Box>

          {!allMapped && (
            <Alert severity="warning" sx={{ mb: 1 }}>
              {t('bankStatements.assignAccount')}
            </Alert>
          )}

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.description')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.reference')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('common.debit')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('common.credit')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, py: 0.5, minWidth: 250 }}>{t('common.account')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((txn, i) => (
                  <TxnRow
                    key={i}
                    txn={txn}
                    index={i}
                    accounts={allAccounts}
                    accountMap={accountMap}
                    onAccountChange={handleAccountChange}
                    onAddAccount={handleAddAccount}
                  />
                ))}
                {/* Summary row */}
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 600 }}>{t('common.totals') + ':'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {totalDebit.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {totalCredit.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Step 3: Done */}
      {activeStep === 2 && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <ConfirmIcon sx={{ fontSize: 48, color: '#2e7d32', mb: 1 }} />
          <Typography variant="h6" sx={{ mb: 1 }}>
            {t('bankStatements.entriesCreated', { count: createdCount })}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('bankStatements.entriesPostedBank')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="outlined" onClick={() => { setActiveStep(0); setTransactions([]); setSelectedFile(null); setCreatedCount(0); }}>
              {t('bankStatements.uploadAnother')}
            </Button>
            <Link
              component="button"
              variant="body2"
              onClick={() => navigate('/journal-entries')}
              sx={{ cursor: 'pointer' }}
            >
              {t('bankStatements.viewJournalEntries')}
            </Link>
          </Box>
        </Paper>
      )}
      {/* Add Account Dialog */}
      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('bankStatements.addAccount')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          {addError && <Alert severity="error" sx={{ mb: 1 }}>{addError}</Alert>}
          <TextField
            label={t('bankStatements.accountCode')}
            value={newAcctCode}
            onChange={e => setNewAcctCode(e.target.value)}
            size="small"
            fullWidth
            autoFocus
          />
          <TextField
            label={t('bankStatements.accountName')}
            value={newAcctName}
            onChange={e => setNewAcctName(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            select
            label={t('bankStatements.accountType')}
            value={newAcctTypeId}
            onChange={e => setNewAcctTypeId(e.target.value)}
            size="small"
            fullWidth
          >
            <MenuItem value="1">{t('bankStatements.asset')}</MenuItem>
            <MenuItem value="2">{t('bankStatements.liability')}</MenuItem>
            <MenuItem value="3">{t('bankStatements.equity')}</MenuItem>
            <MenuItem value="4">{t('bankStatements.revenue')}</MenuItem>
            <MenuItem value="5">{t('bankStatements.expense')}</MenuItem>
          </TextField>
          <Autocomplete
            size="small"
            options={allAccounts.filter(a => a.id !== '__add__')}
            value={newAcctParentId ? accountMap.get(newAcctParentId) || null : null}
            onChange={(_, val) => setNewAcctParentId(val?.id || '')}
            getOptionLabel={(o) => o.label}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            renderInput={(params) => <TextField {...params} label={t('bankStatements.parentAccountOptional')} />}
            filterOptions={(options, { inputValue }) => {
              if (!inputValue) return options.slice(0, 50);
              const q = inputValue.toLowerCase();
              return options.filter(o =>
                o.code.toLowerCase().includes(q) || o.name.toLowerCase().includes(q)
              ).slice(0, 50);
            }}
            ListboxProps={{ style: { maxHeight: 200 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleSaveNewAccount}
            disabled={addingSaving || !newAcctCode || !newAcctName}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {addingSaving ? t('common.saving') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BankStatements;
