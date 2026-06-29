import React, { useEffect, useState, useCallback } from 'react';
import { formatDate } from '../utils/dateFormat';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, Checkbox, Alert, CircularProgress,
  Tabs, Tab, Autocomplete, IconButton, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, CheckCircle as CompleteIcon, LinkOff as UnmatchedIcon,
  Link as MatchIcon, Refresh as RefreshIcon, ArrowBack as BackIcon,
  CompareArrows as CompareIcon,
  AutoFixHigh as AutoMatchIcon,
  ArrowUpward as SortAscIcon, ArrowDownward as SortDescIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  Receipt as ReceiptIcon,
  AssignmentTurnedIn as AssignmentIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import CategorizeTransactionDialog from '../components/CategorizeTransactionDialog';
import BulkCategorizeDialog from '../components/BulkCategorizeDialog';

interface Account {
  id: string;
  code: string;
  name: string;
  label: string;
}

interface ReconciliationSession {
  id: string;
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
  date: string;
  statement_balance: string;
  status: 'in_progress' | 'completed';
  matched_count: number;
  unmatched_count: number;
  created_at: string;
}

interface ReconciliationLine {
  id: string;
  journal_line_id: string;
  date: string;
  entry_date: string;
  entry_number: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  is_matched: boolean;
  matched_at: string | null;
}

interface ReconciliationDetail extends ReconciliationSession {
  lines: ReconciliationLine[];
}

interface BankTransaction {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  reference: string;
  debit: string;
  credit: string;
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
}

interface BillSuggestion {
  id: string;
  bill_number: string;
  supplier_name: string | null;
  date: string;
  total: string;
  balance_due: string;
  match_score: number;
  status: string;
}

const BankReconciliation: React.FC = () => {
  const { t, i18n } = useTranslation();

  const [tabIndex, setTabIndex] = useState(0);
  const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ReconciliationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [createForm, setCreateForm] = useState({
    bank_account_id: '',
    date: new Date().toISOString().split('T')[0],
    statement_balance: '',
  });
  const [selectedBankAccount, setSelectedBankAccount] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);

  // Match state
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [matching, setMatching] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Bill matching tab state
  const [bmTransactions, setBmTransactions] = useState<BankTransaction[]>([]);
  const [bmSelectedTxn, setBmSelectedTxn] = useState<BankTransaction | null>(null);
  const [bmSuggestions, setBmSuggestions] = useState<BillSuggestion[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [bmSelectedIds, setBmSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bmLoading, setBmLoading] = useState(false);
  const [bmSugLoading, setBmSugLoading] = useState(false);
  const [bmMatchingId, setBmMatchingId] = useState<string | null>(null);
  const [bmFilterAccount, setBmFilterAccount] = useState('');
  const [bmFilterDateFrom, setBmFilterDateFrom] = useState('');
  const [bmFilterDateTo, setBmFilterDateTo] = useState('');
  const [bmAutoMatching, setBmAutoMatching] = useState(false);
  const [bmLinkedIds, setBmLinkedIds] = useState<Set<string>>(new Set());
  const [bmSortField, setBmSortField] = useState<'date' | 'description' | 'reference' | 'credit'>('date');
  const [bmSortDir, setBmSortDir] = useState<'asc' | 'desc'>('desc');
  // Auto-match preview dialog
  const [bmPreviewOpen, setBmPreviewOpen] = useState(false);
  const [bmPreviewMatches, setBmPreviewMatches] = useState<any[]>([]);
  const [bmPreviewSelected, setBmPreviewSelected] = useState<Set<number>>(new Set());
  const [bmConfirming, setBmConfirming] = useState(false);

  const fetchSessions = useCallback(() => {
    api.get('/bank-reconciliations').then(res => {
      if (res.data.success) {
        setSessions(res.data.data.reconciliations || res.data.data.sessions || []);
      }
    }).catch(() => {});
  }, []);

  const fetchAccounts = useCallback(() => {
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) {
        const accts: Account[] = res.data.data.accounts
          .map((a: any) => ({
            ...a,
            label: `${a.code} — ${a.name}`,
          }))
          .filter((a: Account) => a.code.startsWith('10'));
        setBankAccounts(accts);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchAccounts();
  }, [fetchSessions, fetchAccounts]);

  const fetchSessionDetail = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/bank-reconciliations/${id}`);
      if (res.data.success) {
        const detail = res.data.data.reconciliation || res.data.data.session;
        setSelectedSession(detail);
        setSelectedLineIds(new Set());
        setTabIndex(1);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('reconciliation.errorFetching'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOpen = () => {
    setCreateForm({
      bank_account_id: '',
      date: new Date().toISOString().split('T')[0],
      statement_balance: '',
    });
    setSelectedBankAccount(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.bank_account_id || !createForm.date || !createForm.statement_balance) return;
    setCreating(true);
    setError('');
    try {
      const res = await api.post('/bank-reconciliations', {
        bank_account_id: createForm.bank_account_id,
        date: createForm.date,
        statement_balance: parseFloat(createForm.statement_balance),
      });
      if (res.data.success) {
        setCreateOpen(false);
        fetchSessions();
        const newId = res.data.data.reconciliation?.id || res.data.data.session?.id;
        if (newId) {
          await fetchSessionDetail(newId);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('reconciliation.errorCreating'));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleLine = (lineId: string) => {
    setSelectedLineIds(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
  };

  const handleSelectAllUnmatched = () => {
    if (!selectedSession) return;
    const unmatchedIds = selectedSession.lines
      .filter(l => !l.is_matched)
      .map(l => l.id);
    const allSelected = unmatchedIds.every(id => selectedLineIds.has(id));
    if (allSelected) {
      setSelectedLineIds(new Set());
    } else {
      setSelectedLineIds(new Set(unmatchedIds));
    }
  };

  const handleMatch = async () => {
    if (!selectedSession || selectedLineIds.size === 0) return;
    setMatching(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post(`/bank-reconciliations/${selectedSession.id}/match`, {
        line_ids: Array.from(selectedLineIds),
      });
      if (res.data.success) {
        setSuccess(t('reconciliation.linesReconciled', { count: selectedLineIds.size }));
        setSelectedLineIds(new Set());
        await fetchSessionDetail(selectedSession.id);
        fetchSessions();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('reconciliation.errorMatching'));
    } finally {
      setMatching(false);
    }
  };

  const handleComplete = async () => {
    if (!selectedSession) return;
    if (!confirm(t('reconciliation.confirmComplete'))) return;
    setCompleting(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post(`/bank-reconciliations/${selectedSession.id}/complete`);
      if (res.data.success) {
        setSuccess(t('reconciliation.reconciliationCompleted'));
        await fetchSessionDetail(selectedSession.id);
        fetchSessions();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('reconciliation.errorCompleting'));
    } finally {
      setCompleting(false);
    }
  };

  const handleBackToSessions = () => {
    setSelectedSession(null);
    setTabIndex(0);
    setError('');
    setSuccess('');
    fetchSessions();
  };

  // Bill matching functions
  const fetchBmTransactions = useCallback(async () => {
    setBmLoading(true);
    setError('');
    // Ask the server for outgoing transactions only (credit on the bank line).
    const baseParams: Record<string, string> = { page_size: '200', direction: 'out' };
    if (bmFilterAccount) baseParams.bank_account_id = bmFilterAccount;
    if (bmFilterDateFrom) baseParams.date_from = bmFilterDateFrom;
    if (bmFilterDateTo) baseParams.date_to = bmFilterDateTo;

    let allTxns: BankTransaction[] = [];
    let page = 1;
    let hasMore = true;
    let loadError = false;

    // Paginate, but commit whatever we manage to fetch even if a later page
    // fails — never discard everything on a single failed request.
    while (hasMore) {
      const params = { ...baseParams, page: String(page) };
      const query = new URLSearchParams(params).toString();
      try {
        const res = await api.get(`/bank-transactions?${query}`);
        if (res.data.success) {
          const txns: BankTransaction[] = res.data.data.transactions || [];
          allTxns = allTxns.concat(txns);
          const totalCount = res.data.data.total_count || 0;
          hasMore = allTxns.length < totalCount && txns.length > 0;
          page++;
        } else {
          hasMore = false;
          loadError = true;
        }
      } catch (err) {
        console.error('Failed to load bank transactions for matching', err);
        hasMore = false;
        loadError = true;
      }
    }

    // Belt-and-suspenders: keep only outgoing rows even if the server filter
    // is unavailable (older backend).
    setBmTransactions(allTxns.filter(t => parseFloat(t.credit || '0') > 0));

    // Fetch already-linked transaction IDs
    try {
      const linkedRes = await api.get('/bills/linked-transaction-ids');
      if (linkedRes.data.success) {
        setBmLinkedIds(new Set(linkedRes.data.data.linked_ids || []));
      }
    } catch (err) {
      console.error('Failed to load linked transaction ids', err);
      loadError = true;
    }

    if (loadError) setError(t('billMatching.errorLoading'));
    setBmLoading(false);
  }, [bmFilterAccount, bmFilterDateFrom, bmFilterDateTo, t]);

  const fetchBmSuggestions = async (txn: BankTransaction) => {
    setBmSelectedTxn(txn);
    setBmSugLoading(true);
    setBmSuggestions([]);
    try {
      const res = await api.post('/bills/match-suggestions', {
        amount: parseFloat(txn.credit || '0'),
        date: txn.date,
        description: txn.description,
        reference: txn.reference,
      });
      if (res.data.success) {
        setBmSuggestions(res.data.data.suggestions || []);
      }
    } catch {
      // silent
    } finally {
      setBmSugLoading(false);
    }
  };

  const handleBmMatch = async (billId: string) => {
    if (!bmSelectedTxn) return;
    setBmMatchingId(billId);
    setError('');
    setSuccess('');
    try {
      const amount = parseFloat(bmSelectedTxn.credit || '0');
      const res = await api.post(`/bills/${billId}/record-payment`, {
        journal_entry_line_id: bmSelectedTxn.id,
        amount,
      });
      if (res.data.success) {
        setSuccess(t('billMatching.paymentRecorded'));
        // Mark this transaction as linked
        setBmLinkedIds(prev => new Set(prev).add(bmSelectedTxn.id));
        setBmSelectedTxn(null);
        setBmSuggestions([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('billMatching.errorMatching'));
    } finally {
      setBmMatchingId(null);
    }
  };

  const handleBmAutoMatch = async () => {
    if (bmTransactions.length === 0) return;
    setBmAutoMatching(true);
    setError('');
    setSuccess('');
    try {
      // Only send unlinked transactions
      const unlinked = bmTransactions.filter(t => !bmLinkedIds.has(t.id));
      const payload = unlinked.map(txn => ({
        id: txn.id,
        amount: parseFloat(txn.credit || '0'),
        date: txn.date,
        description: txn.description,
        reference: txn.reference,
      }));
      const res = await api.post('/bills/auto-match', {
        transactions: payload,
        min_score: 70,
        preview: true,
      });
      if (res.data.success) {
        const matches = res.data.data.matches || [];
        if (matches.length > 0) {
          setBmPreviewMatches(matches);
          // Select all by default
          setBmPreviewSelected(new Set(matches.map((_: any, i: number) => i)));
          setBmPreviewOpen(true);
        } else {
          setSuccess(t('billMatching.autoMatchNone'));
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('billMatching.errorMatching'));
    } finally {
      setBmAutoMatching(false);
    }
  };

  const handleBmAutoMatchConfirm = async () => {
    // Filter to only selected matches
    const selected = bmPreviewMatches.filter((_, i) => bmPreviewSelected.has(i));
    if (selected.length === 0) return;
    setBmConfirming(true);
    setError('');
    try {
      // Re-send only selected as transactions, without preview flag
      const payload = selected.map((m: any) => ({
        id: m.transaction_id,
        amount: m.amount,
        date: m.transaction_date,
        description: m.transaction_description,
        reference: '',
      }));
      const res = await api.post('/bills/auto-match', {
        transactions: payload,
        min_score: 70,
        preview: false,
      });
      if (res.data.success) {
        const count = res.data.data.count || 0;
        setSuccess(t('billMatching.autoMatchResult', { count }));
        const newIds = (res.data.data.matches || []).map((m: any) => m.transaction_id);
        setBmLinkedIds(prev => {
          const next = new Set(prev);
          newIds.forEach((id: string) => next.add(id));
          return next;
        });
        setBmSelectedTxn(null);
        setBmSuggestions([]);
        setBmPreviewOpen(false);
        setBmPreviewMatches([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('billMatching.errorMatching'));
    } finally {
      setBmConfirming(false);
    }
  };

  const handleBmSort = (field: 'date' | 'description' | 'reference' | 'credit') => {
    if (bmSortField === field) {
      setBmSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setBmSortField(field);
      setBmSortDir('asc');
    }
  };

  const bmSortedTransactions = [...bmTransactions].sort((a, b) => {
    let cmp = 0;
    if (bmSortField === 'date') {
      cmp = a.date.localeCompare(b.date);
    } else if (bmSortField === 'description') {
      cmp = (a.description || '').localeCompare(b.description || '');
    } else if (bmSortField === 'reference') {
      cmp = (a.reference || '').localeCompare(b.reference || '');
    } else if (bmSortField === 'credit') {
      cmp = parseFloat(a.credit || '0') - parseFloat(b.credit || '0');
    }
    return bmSortDir === 'asc' ? cmp : -cmp;
  });

  // Fetch bill matching transactions when switching to tab 2
  useEffect(() => {
    if (tabIndex === 2) {
      fetchBmTransactions();
    }
  }, [tabIndex, fetchBmTransactions]);

  // Computed values for the active session
  const unmatchedLines = selectedSession?.lines.filter(l => !l.is_matched) || [];
  const matchedLines = selectedSession?.lines.filter(l => l.is_matched) || [];

  const totalMatched = matchedLines.reduce(
    (sum, l) => sum + parseFloat(l.debit || '0') - parseFloat(l.credit || '0'), 0
  );
  const totalUnmatched = unmatchedLines.reduce(
    (sum, l) => sum + parseFloat(l.debit || '0') - parseFloat(l.credit || '0'), 0
  );
  const statementBalance = selectedSession ? parseFloat(selectedSession.statement_balance || '0') : 0;
  const difference = statementBalance - totalMatched;

  const formatAmount = (val: string) => {
    const num = parseFloat(val || '0');
    return num > 0 ? num.toLocaleString(i18n.language, { minimumFractionDigits: 2 }) : '';
  };

  // ─── Statistics computations ───────────────────────────────────────
  const statsSessionsTotal = sessions.length;
  const statsSessionsCompleted = sessions.filter(s => s.status === 'completed').length;
  const statsSessionsInProgress = sessions.filter(s => s.status === 'in_progress').length;
  const statsTotalMatchedLines = sessions.reduce((sum, s) => sum + (s.matched_count ?? 0), 0);
  const statsTotalUnmatchedLines = sessions.reduce((sum, s) => sum + (s.unmatched_count ?? 0), 0);
  const statsTotalLines = statsTotalMatchedLines + statsTotalUnmatchedLines;
  const statsReconPct = statsTotalLines > 0 ? Math.round((statsTotalMatchedLines / statsTotalLines) * 100) : 0;

  const statsBmTotal = bmTransactions.length;
  const statsBmLinked = bmTransactions.filter(t => bmLinkedIds.has(t.id)).length;
  const statsBmUnlinked = statsBmTotal - statsBmLinked;
  const statsBmTotalAmount = bmTransactions.reduce((sum, t) => sum + parseFloat(t.credit || '0'), 0);
  const statsBmLinkedAmount = bmTransactions.filter(t => bmLinkedIds.has(t.id)).reduce((sum, t) => sum + parseFloat(t.credit || '0'), 0);
  const statsBmPct = statsBmTotal > 0 ? Math.round((statsBmLinked / statsBmTotal) * 100) : 0;

  const fmtStat = (n: number) => n.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('reconciliation.title')}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ─── Statistics overview ─────────────────────────────────────── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        {/* Sessions overview */}
        <Paper variant="outlined" sx={{ px: 2, py: 1.2, flex: '1 1 140px', minWidth: 140, borderLeft: '3px solid #1976d2' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
            <AccountBalanceIcon sx={{ fontSize: 16, color: '#1976d2' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>
              {t('reconciliation.stats.sessions')}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2 }}>
            {statsSessionsTotal}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary' }}>
            <Box component="span" sx={{ color: '#2e7d32', fontWeight: 600 }}>{statsSessionsCompleted}</Box> {t('reconciliation.stats.completed')}
            {' / '}
            <Box component="span" sx={{ color: '#ed6c02', fontWeight: 600 }}>{statsSessionsInProgress}</Box> {t('reconciliation.stats.inProgress')}
          </Typography>
        </Paper>

        {/* Reconciliation progress */}
        <Paper variant="outlined" sx={{ px: 2, py: 1.2, flex: '1 1 140px', minWidth: 140, borderLeft: '3px solid #2e7d32' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
            <AssignmentIcon sx={{ fontSize: 16, color: '#2e7d32' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>
              {t('reconciliation.stats.reconciledLines')}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2 }}>
            {statsTotalMatchedLines} / {statsTotalLines}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ flex: 1, height: 4, bgcolor: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${statsReconPct}%`, bgcolor: '#2e7d32', borderRadius: 2 }} />
            </Box>
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 600, color: '#2e7d32' }}>
              {statsReconPct}%
            </Typography>
          </Box>
        </Paper>

        {/* Bill matching progress */}
        <Paper variant="outlined" sx={{ px: 2, py: 1.2, flex: '1 1 140px', minWidth: 140, borderLeft: '3px solid #9c27b0' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
            <ReceiptIcon sx={{ fontSize: 16, color: '#9c27b0' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>
              {t('reconciliation.stats.billMatching')}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.2 }}>
            {statsBmLinked} / {statsBmTotal}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ flex: 1, height: 4, bgcolor: '#e0e0e0', borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${statsBmPct}%`, bgcolor: '#9c27b0', borderRadius: 2 }} />
            </Box>
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 600, color: '#9c27b0' }}>
              {statsBmPct}%
            </Typography>
          </Box>
        </Paper>

        {/* Outgoing amount */}
        <Paper variant="outlined" sx={{ px: 2, py: 1.2, flex: '1 1 160px', minWidth: 160, borderLeft: '3px solid #ed6c02' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, mb: 0.3 }}>
            <TrendingUpIcon sx={{ fontSize: 16, color: '#ed6c02' }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase' }}>
              {t('reconciliation.stats.outgoingTotal')}
            </Typography>
          </Box>
          <Typography variant="h6" sx={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.2 }}>
            {fmtStat(statsBmTotalAmount)}
          </Typography>
          <Typography variant="caption" sx={{ fontSize: '10px', color: 'text.secondary' }}>
            <Box component="span" sx={{ color: '#2e7d32', fontWeight: 600 }}>{fmtStat(statsBmLinkedAmount)}</Box> {t('reconciliation.stats.matched')}
            {' / '}
            <Box component="span" sx={{ color: '#d32f2f', fontWeight: 600 }}>{fmtStat(statsBmTotalAmount - statsBmLinkedAmount)}</Box> {t('reconciliation.stats.unmatched')}
          </Typography>
        </Paper>
      </Box>

      <Tabs
        value={tabIndex}
        onChange={(_, val) => {
          if (val === 0) handleBackToSessions();
          else if (val === 1 && selectedSession) setTabIndex(1);
          else if (val === 2) {
            setTabIndex(2);
            setBmSelectedTxn(null);
            setBmSuggestions([]);
          }
        }}
        sx={{ mb: 2 }}
      >
        <Tab label={t('reconciliation.sessions')} />
        <Tab label={t('reconciliation.activeSession')} disabled={!selectedSession} />
        <Tab label={t('billMatching.title')} />
      </Tabs>

      {/* Tab 1: Sessions */}
      {tabIndex === 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {t('reconciliation.reconciliationSessions')} ({sessions.length})
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={fetchSessions}
              >
                {t('reconciliation.refresh')}
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleCreateOpen}
                sx={{ bgcolor: '#2e7d32' }}
              >
                {t('reconciliation.newSession')}
              </Button>
            </Box>
          </Box>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('reconciliation.bankAccount')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.statementBalance')}</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>{t('reconciliation.reconciledLines')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.status')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sessions.map(session => (
                  <TableRow
                    key={session.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => fetchSessionDetail(session.id)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {session.bank_account_code}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {session.bank_account_name}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(session.date)}</TableCell>
                    <TableCell align="right">
                      {parseFloat(session.statement_balance).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="body2" component="span" sx={{ color: '#2e7d32', fontWeight: 600 }}>
                        {session.matched_count ?? 0}
                      </Typography>
                      <Typography variant="body2" component="span" color="text.secondary">
                        {' / '}
                      </Typography>
                      <Typography variant="body2" component="span">
                        {(session.matched_count ?? 0) + (session.unmatched_count ?? 0)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={session.status === 'completed' ? t('reconciliation.completed') : t('reconciliation.inProgress')}
                        size="small"
                        sx={{
                          bgcolor: session.status === 'completed' ? '#2e7d32' : '#ed6c02',
                          color: '#fff',
                          height: 22,
                          fontSize: '11px',
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchSessionDetail(session.id);
                        }}
                      >
                        {t('common.view')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {sessions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('reconciliation.noSessions')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Tab 2: Active Session */}
      {tabIndex === 1 && selectedSession && (
        <>
          {/* Header */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Tooltip title={t('reconciliation.backToSessions')}>
                  <IconButton size="small" onClick={handleBackToSessions}>
                    <BackIcon />
                  </IconButton>
                </Tooltip>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {selectedSession.bank_account_code} — {selectedSession.bank_account_name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('common.date')}: {formatDate(selectedSession.date)}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">{t('reconciliation.statementBalance')}</Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {parseFloat(selectedSession.statement_balance).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                  </Typography>
                </Box>
                <Chip
                  label={selectedSession.status === 'completed' ? t('reconciliation.completed') : t('reconciliation.inProgress')}
                  size="small"
                  sx={{
                    bgcolor: selectedSession.status === 'completed' ? '#2e7d32' : '#ed6c02',
                    color: '#fff',
                    height: 24,
                  }}
                />
              </Box>
            </Box>
          </Paper>

          {/* Summary */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('reconciliation.reconciledTotal')}</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#2e7d32' }}>
                  {totalMatched.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('reconciliation.unreconciledTotal')}</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600, color: '#ed6c02' }}>
                  {totalUnmatched.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('reconciliation.statementDifference')}</Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: 600, color: Math.abs(difference) < 0.01 ? '#2e7d32' : '#d32f2f' }}
                >
                  {difference.toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('reconciliation.reconciledLines')}</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {matchedLines.length}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">{t('reconciliation.unreconciledLines')}</Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {unmatchedLines.length}
                </Typography>
              </Box>
            </Box>
          </Paper>

          {/* Action buttons */}
          {selectedSession.status === 'in_progress' && (
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button
                variant="contained"
                startIcon={matching ? <CircularProgress size={16} /> : <MatchIcon />}
                onClick={handleMatch}
                disabled={selectedLineIds.size === 0 || matching}
                sx={{ bgcolor: '#1976d2' }}
              >
                {matching ? t('reconciliation.reconciling') : `${t('reconciliation.reconcileSelected')} (${selectedLineIds.size})`}
              </Button>
              <Button
                variant="contained"
                startIcon={completing ? <CircularProgress size={16} /> : <CompleteIcon />}
                onClick={handleComplete}
                disabled={completing}
                color="success"
              >
                {completing ? t('reconciliation.completing') : t('reconciliation.completeReconciliation')}
              </Button>
              <Button
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={() => fetchSessionDetail(selectedSession.id)}
              >
                {t('reconciliation.refresh')}
              </Button>
            </Box>
          )}

          {/* Two columns layout */}
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
            {/* Left: Unmatched lines */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <UnmatchedIcon sx={{ fontSize: 18, color: '#ed6c02' }} />
                {t('reconciliation.unreconciledLines')} ({unmatchedLines.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#fff3e0' }}>
                      {selectedSession.status === 'in_progress' && (
                        <TableCell sx={{ p: 0.5, width: 40 }}>
                          <Checkbox
                            size="small"
                            checked={unmatchedLines.length > 0 && unmatchedLines.every(l => selectedLineIds.has(l.id))}
                            indeterminate={
                              unmatchedLines.some(l => selectedLineIds.has(l.id)) &&
                              !unmatchedLines.every(l => selectedLineIds.has(l.id))
                            }
                            onChange={handleSelectAllUnmatched}
                          />
                        </TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.number')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.reference')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.debit')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.credit')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {unmatchedLines.map(line => (
                      <TableRow
                        key={line.id}
                        hover
                        selected={selectedLineIds.has(line.id)}
                        sx={{ cursor: selectedSession.status === 'in_progress' ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (selectedSession.status === 'in_progress') {
                            handleToggleLine(line.id);
                          }
                        }}
                      >
                        {selectedSession.status === 'in_progress' && (
                          <TableCell sx={{ p: 0.5 }}>
                            <Checkbox
                              size="small"
                              checked={selectedLineIds.has(line.id)}
                              onChange={() => handleToggleLine(line.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                        )}
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(line.date)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{line.entry_number}</TableCell>
                        <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Tooltip title={line.description || ''}>
                            <span>{line.description}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {line.reference}
                        </TableCell>
                        <TableCell align="right">{formatAmount(line.debit)}</TableCell>
                        <TableCell align="right">{formatAmount(line.credit)}</TableCell>
                      </TableRow>
                    ))}
                    {unmatchedLines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={selectedSession.status === 'in_progress' ? 7 : 6} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            {t('reconciliation.allLinesReconciled')}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Right: Matched lines */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <MatchIcon sx={{ fontSize: 18, color: '#2e7d32' }} />
                {t('reconciliation.reconciledLines')} ({matchedLines.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.number')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.reference')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.debit')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.credit')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('reconciliation.reconciled')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {matchedLines.map(line => (
                      <TableRow key={line.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(line.date)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'nowrap' }}>{line.entry_number}</TableCell>
                        <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Tooltip title={line.description || ''}>
                            <span>{line.description}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px' }}>
                          {line.reference}
                        </TableCell>
                        <TableCell align="right">{formatAmount(line.debit)}</TableCell>
                        <TableCell align="right">{formatAmount(line.credit)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Typography variant="caption" color="text.secondary">
                            {line.matched_at ? new Date(line.matched_at).toLocaleString(i18n.language) : ''}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    {matchedLines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                          <Typography variant="body2" color="text.secondary">
                            {t('reconciliation.noReconciledLinesYet')}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        </>
      )}

      {/* Tab 3: Bill Matching (Regningsafstemning) */}
      {tabIndex === 2 && (
        <>
          {/* Filter bar */}
          <Paper sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
              <Autocomplete
                size="small"
                options={bankAccounts}
                value={bankAccounts.find(a => a.id === bmFilterAccount) || null}
                onChange={(_, val) => setBmFilterAccount(val?.id || '')}
                getOptionLabel={(o) => o.label}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                renderInput={(params) => (
                  <TextField {...params} label={t('billMatching.bankAccount')} variant="outlined" sx={{ minWidth: 250 }} />
                )}
                sx={{ minWidth: 250 }}
                ListboxProps={{ style: { maxHeight: 200 } }}
              />
              <TextField
                label={t('common.fromDate')}
                type="date"
                size="small"
                value={bmFilterDateFrom}
                onChange={e => setBmFilterDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160 }}
              />
              <TextField
                label={t('common.toDate')}
                type="date"
                size="small"
                value={bmFilterDateTo}
                onChange={e => setBmFilterDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160 }}
              />
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={fetchBmTransactions}
              >
                {t('reconciliation.refresh')}
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={bmAutoMatching ? <CircularProgress size={16} /> : <AutoMatchIcon />}
                onClick={handleBmAutoMatch}
                disabled={bmAutoMatching || bmTransactions.length === 0}
                sx={{ bgcolor: '#1565c0' }}
              >
                {bmAutoMatching ? t('billMatching.autoMatching') : t('billMatching.autoMatch')}
              </Button>
            </Box>
          </Paper>

          {/* Split screen */}
          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
            {/* Left: Bank Transactions (Outgoing) */}
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1, minHeight: 32 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CompareIcon sx={{ fontSize: 18 }} />
                  {t('billMatching.bankTransactions')} ({bmTransactions.length})
                </Typography>
                {bmSelectedIds.size > 0 && (
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<AccountBalanceIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setBulkOpen(true)}
                    sx={{ bgcolor: '#2e7d32', whiteSpace: 'nowrap' }}
                  >
                    {t('billMatching.bulkBook', { count: bmSelectedIds.size })}
                  </Button>
                )}
              </Box>
              {bmLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600, overflow: 'auto' }}>
                  <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '11px', px: 1, py: 0.4 } }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell padding="checkbox">
                          {(() => {
                            const selectable = bmSortedTransactions.filter(x => !bmLinkedIds.has(x.id)).map(x => x.id);
                            const allSel = selectable.length > 0 && selectable.every(id => bmSelectedIds.has(id));
                            const someSel = selectable.some(id => bmSelectedIds.has(id));
                            return (
                              <Checkbox
                                size="small"
                                checked={allSel}
                                indeterminate={someSel && !allSel}
                                disabled={selectable.length === 0}
                                onChange={(e) => setBmSelectedIds(e.target.checked ? new Set(selectable) : new Set())}
                              />
                            );
                          })()}
                        </TableCell>
                        {([['date', t('common.date'), false], ['description', t('common.description'), false], ['reference', t('common.reference'), false], ['credit', t('common.amount'), true]] as const).map(([field, label, isRight]) => (
                          <TableCell
                            key={field}
                            align={isRight ? 'right' : 'left'}
                            sx={{ fontWeight: 600, cursor: 'pointer', userSelect: 'none', '&:hover': { bgcolor: '#e0e0e0' } }}
                            onClick={() => handleBmSort(field)}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isRight ? 'flex-end' : 'flex-start', gap: 0.3 }}>
                              {label}
                              {bmSortField === field && (
                                bmSortDir === 'asc'
                                  ? <SortAscIcon sx={{ fontSize: 14 }} />
                                  : <SortDescIcon sx={{ fontSize: 14 }} />
                              )}
                            </Box>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bmSortedTransactions.map(txn => {
                        const isLinked = bmLinkedIds.has(txn.id);
                        return (
                          <TableRow
                            key={txn.id}
                            hover={!isLinked}
                            selected={bmSelectedTxn?.id === txn.id}
                            sx={{
                              cursor: isLinked ? 'default' : 'pointer',
                              bgcolor: isLinked ? '#e8f5e9' : undefined,
                              opacity: isLinked ? 0.6 : 1,
                              pointerEvents: isLinked ? 'none' : 'auto',
                            }}
                            onClick={() => { if (!isLinked) fetchBmSuggestions(txn); }}
                          >
                            <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                              {!isLinked && (
                                <Checkbox
                                  size="small"
                                  checked={bmSelectedIds.has(txn.id)}
                                  onChange={() => setBmSelectedIds(prev => {
                                    const n = new Set(prev);
                                    if (n.has(txn.id)) n.delete(txn.id); else n.add(txn.id);
                                    return n;
                                  })}
                                />
                              )}
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {isLinked && <CompleteIcon sx={{ fontSize: 12, color: '#2e7d32', mr: 0.5, verticalAlign: 'middle' }} />}
                              {formatDate(txn.date)}
                            </TableCell>
                            <TableCell>
                              <Tooltip title={txn.description}>
                                <span>{txn.description}</span>
                              </Tooltip>
                            </TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{txn.reference}</TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {parseFloat(txn.credit || '0').toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {bmTransactions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              {t('bankTransactions.noTransactions')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>

            {/* Right: Match suggestions */}
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MatchIcon sx={{ fontSize: 18, color: '#2e7d32' }} />
                  {bmSelectedTxn
                    ? `${t('billMatching.matchesFor')}: ${bmSelectedTxn.description.substring(0, 40)}…`
                    : t('billMatching.title')
                  }
                </Typography>
                {bmSelectedTxn && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AccountBalanceIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setCatOpen(true)}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {t('billMatching.bookToAccount')}
                  </Button>
                )}
              </Box>
              {!bmSelectedTxn ? (
                <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('billMatching.selectTransaction')}
                  </Typography>
                </Paper>
              ) : bmSugLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress size={24} />
                </Box>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600, overflow: 'auto' }}>
                  <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '11px', px: 1, py: 0.4 } }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                        <TableCell sx={{ fontWeight: 600 }}>{t('billMatching.score')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{t('bills.billNumber')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{t('bills.supplier')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.total')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{t('payments.balanceDue')}</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {bmSuggestions.map(bill => (
                        <TableRow key={bill.id} hover>
                          <TableCell>
                            <Chip
                              label={`${bill.match_score}%`}
                              size="small"
                              sx={{
                                bgcolor: bill.match_score >= 70 ? '#2e7d32' : bill.match_score >= 40 ? '#ed6c02' : '#d32f2f',
                                color: '#fff',
                                fontWeight: 600,
                                height: 18,
                                fontSize: '10px',
                                '& .MuiChip-label': { px: 0.7 },
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{bill.bill_number}</TableCell>
                          <TableCell>
                            <Tooltip title={bill.supplier_name || ''}>
                              <span>{bill.supplier_name || '—'}</span>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(bill.date)}</TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {parseFloat(bill.total).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            {parseFloat(bill.balance_due).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell align="center" sx={{ px: 0.5 }}>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={bmMatchingId === bill.id}
                              onClick={() => handleBmMatch(bill.id)}
                              startIcon={bmMatchingId === bill.id ? <CircularProgress size={12} /> : <MatchIcon sx={{ fontSize: 14 }} />}
                              sx={{ bgcolor: '#2e7d32', fontSize: '10px', py: 0.2, px: 1, minWidth: 'auto' }}
                            >
                              {t('billMatching.match')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {bmSuggestions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                            <Typography variant="body2" color="text.secondary">
                              {t('billMatching.noMatches')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Box>
        </>
      )}

      {/* Loading overlay */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Categorize (book to account) dialog */}
      <CategorizeTransactionDialog
        open={catOpen}
        txn={bmSelectedTxn}
        onClose={() => setCatOpen(false)}
        onDone={() => {
          if (bmSelectedTxn) setBmLinkedIds(prev => new Set(prev).add(bmSelectedTxn.id));
          setCatOpen(false);
          setBmSelectedTxn(null);
          setBmSuggestions([]);
          setSuccess(t('billMatching.categorized'));
        }}
      />

      {/* Bulk categorize (book several to one account) dialog */}
      <BulkCategorizeDialog
        open={bulkOpen}
        txns={bmTransactions.filter(x => bmSelectedIds.has(x.id))}
        onClose={() => setBulkOpen(false)}
        onDone={(succeededIds) => {
          setBulkOpen(false);
          if (succeededIds.length > 0) {
            setBmLinkedIds(prev => { const n = new Set(prev); succeededIds.forEach(id => n.add(id)); return n; });
            setBmSelectedIds(prev => { const n = new Set(prev); succeededIds.forEach(id => n.delete(id)); return n; });
            setSuccess(t('billMatching.bulkDone', { count: succeededIds.length }));
          }
        }}
      />

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('reconciliation.newSession')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Autocomplete
              size="small"
              options={bankAccounts}
              value={selectedBankAccount}
              onChange={(_, val) => {
                setSelectedBankAccount(val);
                setCreateForm(prev => ({ ...prev, bank_account_id: val?.id || '' }));
              }}
              getOptionLabel={(o) => o.label}
              isOptionEqualToValue={(o, v) => o.id === v.id}
              renderInput={(params) => (
                <TextField {...params} label={t('reconciliation.bankAccount')} variant="outlined" />
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
              label={t('common.date')}
              type="date"
              value={createForm.date}
              onChange={e => setCreateForm(prev => ({ ...prev, date: e.target.value }))}
              size="small"
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={t('reconciliation.statementBalance')}
              type="number"
              value={createForm.statement_balance}
              onChange={e => setCreateForm(prev => ({ ...prev, statement_balance: e.target.value }))}
              size="small"
              fullWidth
              inputProps={{ step: '0.01' }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !createForm.bank_account_id || !createForm.date || !createForm.statement_balance}
            startIcon={creating ? <CircularProgress size={16} /> : undefined}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {creating ? t('common.creating') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Auto-match preview dialog */}
      <Dialog
        open={bmPreviewOpen}
        onClose={() => { if (!bmConfirming) setBmPreviewOpen(false); }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('billMatching.autoMatchPreview')} ({bmPreviewMatches.length})</DialogTitle>
        <DialogContent>
          <TableContainer sx={{ maxHeight: 450 }}>
            <Table size="small" stickyHeader sx={{ '& td, & th': { fontSize: '11px', px: 1, py: 0.4 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                  <TableCell sx={{ p: 0.5, width: 36 }}>
                    <Checkbox
                      size="small"
                      checked={bmPreviewSelected.size === bmPreviewMatches.length && bmPreviewMatches.length > 0}
                      indeterminate={bmPreviewSelected.size > 0 && bmPreviewSelected.size < bmPreviewMatches.length}
                      onChange={() => {
                        if (bmPreviewSelected.size === bmPreviewMatches.length) {
                          setBmPreviewSelected(new Set());
                        } else {
                          setBmPreviewSelected(new Set(bmPreviewMatches.map((_, i) => i)));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('billMatching.score')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('billMatching.transaction')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.amount')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('billMatching.bill')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('billMatching.supplier')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bmPreviewMatches.map((m, idx) => (
                  <TableRow
                    key={idx}
                    hover
                    selected={bmPreviewSelected.has(idx)}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => {
                      setBmPreviewSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx); else next.add(idx);
                        return next;
                      });
                    }}
                  >
                    <TableCell sx={{ p: 0.5 }}>
                      <Checkbox
                        size="small"
                        checked={bmPreviewSelected.has(idx)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => {
                          setBmPreviewSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${m.score}%`}
                        size="small"
                        sx={{
                          bgcolor: m.score >= 70 ? '#2e7d32' : m.score >= 40 ? '#ed6c02' : '#d32f2f',
                          color: '#fff',
                          fontWeight: 600,
                          height: 18,
                          fontSize: '10px',
                          '& .MuiChip-label': { px: 0.7 },
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Tooltip title={m.transaction_description || ''}>
                        <span>{m.transaction_description}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(m.transaction_date)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {parseFloat(m.amount).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{m.bill_number}</TableCell>
                    <TableCell sx={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.supplier_name || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBmPreviewOpen(false)} disabled={bmConfirming}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={handleBmAutoMatchConfirm}
            disabled={bmConfirming || bmPreviewSelected.size === 0}
            startIcon={bmConfirming ? <CircularProgress size={16} /> : <CompleteIcon />}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {bmConfirming
              ? t('billMatching.autoMatchConfirming')
              : t('billMatching.autoMatchConfirm', { count: bmPreviewSelected.size })
            }
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default BankReconciliation;
