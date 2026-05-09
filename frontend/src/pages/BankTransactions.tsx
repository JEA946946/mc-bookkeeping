import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, MenuItem, TablePagination,
} from '@mui/material';
import { Download as DownloadIcon, Search as SearchIcon } from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { downloadBlob } from '../utils/csvExport';

interface BankAccount {
  id: string;
  code: string;
  name: string;
}

interface BankTransaction {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  currency: string;
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
}

interface Summary {
  total_debit: string;
  total_credit: string;
  net: string;
}

const BankTransactions: React.FC = () => {
  const { t } = useTranslation();

  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [summary, setSummary] = useState<Summary>({ total_debit: '0', total_credit: '0', net: '0' });
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Filter state
  const [filterBankAccount, setFilterBankAccount] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const fetchTransactions = useCallback(async (p: number) => {
    const params = new URLSearchParams();
    params.set('page', String(p + 1));
    params.set('page_size', String(rowsPerPage));
    if (filterBankAccount) params.set('bank_account_id', filterBankAccount);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);

    try {
      const res = await api.get(`/bank-transactions?${params.toString()}`);
      const data = res.data.data;
      setTransactions(data.transactions);
      setTotalCount(data.total_count);
      setSummary(data.summary);
      if (data.bank_accounts) {
        setBankAccounts(data.bank_accounts);
      }
    } catch { /* ignore */ }
  }, [rowsPerPage, filterBankAccount, filterDateFrom, filterDateTo, filterSearch]);

  useEffect(() => {
    fetchTransactions(page);
  }, [page, fetchTransactions]);

  const handleApplyFilters = () => {
    setPage(0);
    fetchTransactions(0);
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filterBankAccount) params.set('bank_account_id', filterBankAccount);
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSearch) params.set('search', filterSearch);
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      const res = await api.get(`/bank-transactions/export${qs}`, { responseType: 'blob' });
      downloadBlob(new Blob([res.data]), 'bank_transactions.csv');
    } catch { /* ignore */ }
  };

  const fmt = (val: string) => {
    const n = parseFloat(val);
    if (!n) return '';
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtSummary = (val: string) => {
    const n = parseFloat(val);
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">{t('bankTransactions.title')}</Typography>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} size="small">
          {t('common.exportCsv')}
        </Button>
      </Box>

      {/* Filter bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select
          size="small"
          label={t('bankTransactions.bankAccount')}
          value={filterBankAccount}
          onChange={(e) => setFilterBankAccount(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">{t('bankTransactions.allAccounts')}</MenuItem>
          {bankAccounts.map((a) => (
            <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          type="date"
          label={t('common.fromDate')}
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          type="date"
          label={t('common.toDate')}
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 150 }}
        />
        <TextField
          size="small"
          label={t('common.search')}
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApplyFilters()}
          sx={{ width: 180 }}
        />
        <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={handleApplyFilters}>
          {t('common.apply')}
        </Button>
      </Paper>

      {/* Summary bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 3, alignItems: 'center' }}>
        <Box>
          <Typography variant="caption" color="text.secondary">{t('bankTransactions.totalDebits')}</Typography>
          <Typography variant="body2" fontWeight={600}>{fmtSummary(summary.total_debit)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">{t('bankTransactions.totalCredits')}</Typography>
          <Typography variant="body2" fontWeight={600}>{fmtSummary(summary.total_credit)}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary">{t('bankTransactions.net')}</Typography>
          <Typography variant="body2" fontWeight={600}>{fmtSummary(summary.net)}</Typography>
        </Box>
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('common.date')}</TableCell>
              <TableCell>{t('accounts.entryNumber')}</TableCell>
              <TableCell>{t('common.description')}</TableCell>
              <TableCell>{t('common.reference')}</TableCell>
              <TableCell>{t('bankTransactions.bankAccount')}</TableCell>
              <TableCell align="right">{t('common.debit')}</TableCell>
              <TableCell align="right">{t('common.credit')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  {t('bankTransactions.noTransactions')}
                </TableCell>
              </TableRow>
            ) : (
              transactions.map((txn) => (
                <TableRow key={txn.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.date}</TableCell>
                  <TableCell>{txn.entry_number}</TableCell>
                  <TableCell>{txn.description}</TableCell>
                  <TableCell>{txn.reference}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.bank_account_code} - {txn.bank_account_name}</TableCell>
                  <TableCell align="right">{fmt(txn.debit)}</TableCell>
                  <TableCell align="right">{fmt(txn.credit)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100]}
          labelRowsPerPage={t('common.rowsPerPage')}
          labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
        />
      </TableContainer>
    </Box>
  );
};

export default BankTransactions;
