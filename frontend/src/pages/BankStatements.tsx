import React, { useEffect, useState, useRef } from 'react';
import { formatDate } from '../utils/dateFormat';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, MenuItem, Alert, Stepper, Step,
  StepLabel, CircularProgress, Link,
} from '@mui/material';
import { CloudUpload as UploadIcon, CheckCircle as ConfirmIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface BankAccount {
  id: string;
  code: string;
  name: string;
}

interface ParsedTransaction {
  date: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
}

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

  const steps = [t('bankStatements.uploadFile'), t('bankStatements.reviewConfirm'), t('bankStatements.done')];

  const [activeStep, setActiveStep] = useState(0);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBank, setSelectedBank] = useState('');
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [fileFormat, setFileFormat] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [createdCount, setCreatedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);

  const fetchHistory = () => {
    api.get('/bank-statements/history').then(res => {
      if (res.data.success) setUploadHistory(res.data.data.uploads);
    }).catch(() => {});
  };

  useEffect(() => {
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) {
        const accts = res.data.data.accounts;
        setBankAccounts(accts.filter((a: any) => a.code.startsWith('10')));
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

  const totalDebit = transactions.reduce((sum, t) => sum + parseFloat(t.debit || '0'), 0);
  const totalCredit = transactions.reduce((sum, t) => sum + parseFloat(t.credit || '0'), 0);

  const handleConfirm = async () => {
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
        setSkippedCount(res.data.data.skipped || 0);
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

      {/* Step 2: Review & Confirm */}
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
                variant="contained"
                size="small"
                onClick={handleConfirm}
                disabled={confirming}
                startIcon={confirming ? <CircularProgress size={16} /> : <ConfirmIcon />}
                sx={{ bgcolor: '#2e7d32' }}
              >
                {confirming ? t('bankStatements.creating') : t('bankStatements.confirmCreate')}
              </Button>
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 1 }}>
            {t('bankStatements.accountsAssignedLater')}
          </Alert>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.description')}</TableCell>
                  <TableCell sx={{ fontWeight: 600, py: 0.5 }}>{t('common.reference')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('common.debit')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, py: 0.5 }}>{t('common.credit')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((txn, i) => (
                  <TableRow key={i} hover sx={{ '& td': { py: 0.3 } }}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(txn.date)}</TableCell>
                    <TableCell sx={{ maxWidth: 350, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {txn.description}
                    </TableCell>
                    <TableCell>{txn.reference}</TableCell>
                    <TableCell align="right">
                      {parseFloat(txn.debit) > 0 ? parseFloat(txn.debit).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
                    </TableCell>
                    <TableCell align="right">
                      {parseFloat(txn.credit) > 0 ? parseFloat(txn.credit).toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : ''}
                    </TableCell>
                  </TableRow>
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
          {skippedCount > 0 && (
            <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>
              {t('bankStatements.duplicatesSkipped', { count: skippedCount })}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('bankStatements.entriesPostedBank')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
            <Button variant="outlined" onClick={() => { setActiveStep(0); setTransactions([]); setSelectedFile(null); setCreatedCount(0); setSkippedCount(0); }}>
              {t('bankStatements.uploadAnother')}
            </Button>
            <Link
              component="button"
              variant="body2"
              onClick={() => navigate('/bank-transactions')}
              sx={{ cursor: 'pointer' }}
            >
              {t('bankStatements.viewBankTransactions')}
            </Link>
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default BankStatements;
