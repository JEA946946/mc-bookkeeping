import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, Checkbox, Alert, CircularProgress,
  Tabs, Tab, Autocomplete, IconButton, Tooltip,
} from '@mui/material';
import {
  Add as AddIcon, CheckCircle as CompleteIcon, LinkOff as UnmatchedIcon,
  Link as MatchIcon, Refresh as RefreshIcon, ArrowBack as BackIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

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
  date: string;
  description: string;
  debit: string;
  credit: string;
  is_matched: boolean;
  matched_at: string | null;
}

interface ReconciliationDetail extends ReconciliationSession {
  lines: ReconciliationLine[];
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

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('reconciliation.title')}</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Tabs
        value={tabIndex}
        onChange={(_, val) => {
          if (val === 0) handleBackToSessions();
          else if (val === 1 && selectedSession) setTabIndex(1);
        }}
        sx={{ mb: 2 }}
      >
        <Tab label={t('reconciliation.sessions')} />
        <Tab label={t('reconciliation.activeSession')} disabled={!selectedSession} />
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
                    <TableCell>{session.date}</TableCell>
                    <TableCell align="right">
                      {parseFloat(session.statement_balance).toLocaleString(i18n.language, { minimumFractionDigits: 2 })}
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
                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
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
                    {t('common.date')}: {selectedSession.date}
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
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
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
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{line.date}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.description}
                        </TableCell>
                        <TableCell align="right">{formatAmount(line.debit)}</TableCell>
                        <TableCell align="right">{formatAmount(line.credit)}</TableCell>
                      </TableRow>
                    ))}
                    {unmatchedLines.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={selectedSession.status === 'in_progress' ? 5 : 4} align="center" sx={{ py: 3 }}>
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
                      <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.debit')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reconciliation.credit')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('reconciliation.reconciled')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {matchedLines.map(line => (
                      <TableRow key={line.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{line.date}</TableCell>
                        <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.description}
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
                        <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
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

      {/* Loading overlay */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

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
    </Box>
  );
};

export default BankReconciliation;
