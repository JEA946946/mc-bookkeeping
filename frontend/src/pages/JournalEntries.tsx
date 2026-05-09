import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Tooltip, TablePagination,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  CheckCircle as PostIcon, Cancel as UnpostIcon, RemoveRedEye as ViewIcon,
  AddCircleOutline as AddLineIcon, RemoveCircleOutline as RemoveLineIcon,
  Search as SearchIcon, Download as DownloadIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { downloadBlob } from '../utils/csvExport';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface JournalLine {
  id?: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit: string;
  credit: string;
  description: string;
}

interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  reference: string;
  source: string;
  is_posted: boolean;
  total_debit: string;
  total_credit: string;
  is_balanced: boolean;
  lines?: JournalLine[];
}

const EMPTY_LINE: JournalLine = { account_id: '', debit: '0', credit: '0', description: '' };

const JournalEntries: React.FC = () => {
  const { t, i18n } = useTranslation();

  const SOURCE_OPTIONS = [
    { value: '', label: t('journal.allSources') },
    { value: 'manual', label: t('journal.manual') },
    { value: 'bank', label: t('journal.bankSource') },
    { value: 'cmr_invoice', label: t('journal.cmrInvoice') },
    { value: 'cmr_payment', label: t('journal.cmrPayment') },
    { value: 'margin_recognition', label: t('journal.marginRecognition') },
    { value: 'tva_margin', label: t('journal.tvaMargin') },
  ];

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [viewing, setViewing] = useState<JournalEntry | null>(null);
  const [autoRepost, setAutoRepost] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('journalFontSize');
    return saved ? parseFloat(saved) : 0.7;
  });

  // Filter state
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterPosted, setFilterPosted] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Form state
  const [form, setForm] = useState({ date: '', description: '', reference: '' });
  const [lines, setLines] = useState<JournalLine[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  useEffect(() => {
    localStorage.setItem('journalFontSize', fontSize.toString());
  }, [fontSize]);

  const fetchEntries = (p?: number) => {
    const params = new URLSearchParams();
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSource) params.set('source', filterSource);
    if (filterPosted) params.set('is_posted', filterPosted);
    if (filterSearch) params.set('search', filterSearch);
    const currentPage = p !== undefined ? p : page;
    params.set('page', String(currentPage + 1));
    params.set('page_size', String(rowsPerPage));
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/journal-entries${qs}`).then(res => {
      if (res.data.success) {
        setEntries(res.data.data.journal_entries);
        setTotalCount(res.data.data.total_count ?? res.data.data.count ?? 0);
      }
    });
  };

  useEffect(() => {
    fetchEntries();
    api.get('/accounts?is_active=true').then(res => {
      if (res.data.success) setAccounts(res.data.data.accounts);
    });
  }, []);

  const handleApplyFilters = () => {
    setPage(0);
    fetchEntries(0);
  };

  const handleExportJournalEntries = async () => {
    const params = new URLSearchParams();
    if (filterDateFrom) params.set('date_from', filterDateFrom);
    if (filterDateTo) params.set('date_to', filterDateTo);
    if (filterSource) params.set('source', filterSource);
    if (filterPosted) params.set('is_posted', filterPosted);
    if (filterSearch) params.set('search', filterSearch);
    const qs = params.toString() ? `?${params.toString()}` : '';
    try {
      const res = await api.get(`/journal-entries/export${qs}`, { responseType: 'blob' });
      downloadBlob(new Blob([res.data]), 'journal_entries.csv');
    } catch { /* ignore */ }
  };

  const handlePageChange = (_: unknown, newPage: number) => {
    setPage(newPage);
    fetchEntries(newPage);
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSize = parseInt(e.target.value, 10);
    setRowsPerPage(newSize);
    setPage(0);
    setTimeout(() => fetchEntries(0), 0);
  };

  const handleOpen = async (entry?: JournalEntry) => {
    if (entry) {
      const res = await api.get(`/journal-entries/${entry.id}`);
      if (res.data.success) {
        const full = res.data.data.journal_entry;
        setEditing(full);
        setForm({ date: full.date, description: full.description, reference: full.reference });
        setLines(full.lines.map((l: JournalLine) => ({
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })));
      }
    } else {
      setEditing(null);
      setForm({ date: new Date().toISOString().split('T')[0], description: '', reference: '' });
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    }
    setDialogOpen(true);
  };

  const handleEditPosted = async (entry: JournalEntry) => {
    try {
      await api.post(`/journal-entries/${entry.id}/unpost`);
      setAutoRepost(true);
      await handleOpen({ ...entry, is_posted: false });
    } catch (err: any) {
      alert(err.response?.data?.message || t('journal.errorUnposting'));
    }
  };

  const handleView = async (entry: JournalEntry) => {
    const res = await api.get(`/journal-entries/${entry.id}`);
    if (res.data.success) {
      setViewing(res.data.data.journal_entry);
      setViewDialogOpen(true);
    }
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      lines: lines.filter(l => l.account_id),
    };
    try {
      if (editing) {
        await api.put(`/journal-entries/${editing.id}`, payload);
        if (autoRepost) {
          await api.post(`/journal-entries/${editing.id}/post`);
        }
      } else {
        await api.post('/journal-entries', payload);
      }
      setDialogOpen(false);
      setAutoRepost(false);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || t('journal.errorSaving'));
    }
  };

  const handleDialogClose = () => {
    if (autoRepost && editing) {
      // Re-post if user cancels editing a posted entry
      api.post(`/journal-entries/${editing.id}/post`).catch(() => {});
    }
    setDialogOpen(false);
    setAutoRepost(false);
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('journal.deleteConfirm'))) return;
    try {
      await api.delete(`/journal-entries/${id}`);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || t('journal.errorDeleting'));
    }
  };

  const handlePost = async (id: string) => {
    try {
      await api.post(`/journal-entries/${id}/post`);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || t('journal.errorPosting'));
    }
  };

  const handleUnpost = async (id: string) => {
    try {
      await api.post(`/journal-entries/${id}/unpost`);
      fetchEntries();
    } catch (err: any) {
      alert(err.response?.data?.message || t('journal.errorUnpostingEntry'));
    }
  };

  const updateLine = (index: number, field: keyof JournalLine, value: string) => {
    setLines(prev => prev.map((l, i) => i === index ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines(prev => [...prev, { ...EMPTY_LINE }]);
  const removeLine = (index: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== index));
  };

  const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debit || '0'), 0);
  const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.credit || '0'), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('journal.title')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', border: '1px solid #ddd', borderRadius: 1, px: 0.5 }}>
            <IconButton size="small" onClick={() => setFontSize(prev => Math.max(0.5, prev - 0.05))} sx={{ p: 0.3 }}>
              <RemoveLineIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <Typography sx={{ fontSize: '0.7rem', mx: 0.5, minWidth: 20, textAlign: 'center' }}>
              {Math.round(fontSize * 100)}%
            </Typography>
            <IconButton size="small" onClick={() => setFontSize(prev => Math.min(1, prev + 0.05))} sx={{ p: 0.3 }}>
              <AddLineIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExportJournalEntries} size="small">
            {t('importExport.export')}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
            {t('journal.newEntry')}
          </Button>
        </Box>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={t('common.from')} type="date" value={filterDateFrom} size="small"
          onChange={e => setFilterDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 140 }}
        />
        <TextField
          label={t('common.to')} type="date" value={filterDateTo} size="small"
          onChange={e => setFilterDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 140 }}
        />
        <TextField
          select label={t('journal.source')} value={filterSource} size="small"
          onChange={e => setFilterSource(e.target.value)}
          sx={{ width: 150 }}
        >
          {SOURCE_OPTIONS.map(o => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          select label={t('common.status')} value={filterPosted} size="small"
          onChange={e => setFilterPosted(e.target.value)}
          sx={{ width: 120 }}
        >
          <MenuItem value="">{t('common.all')}</MenuItem>
          <MenuItem value="true">{t('journal.posted')}</MenuItem>
          <MenuItem value="false">{t('journal.draft')}</MenuItem>
        </TextField>
        <TextField
          label={t('common.search')} value={filterSearch} size="small"
          onChange={e => setFilterSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
          sx={{ width: 180 }}
          InputProps={{ endAdornment: <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} /> }}
        />
        <Button variant="outlined" size="small" onClick={handleApplyFilters}>
          {t('common.apply')}
        </Button>
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('accounts.entryNumber')}</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.date')}</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.description')}</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.reference')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.debit')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.credit')}</TableCell>
              <TableCell sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.status')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600, fontSize: `${fontSize}rem`, py: 0.5, whiteSpace: 'nowrap' }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map(entry => (
              <TableRow key={entry.id} hover sx={{ '& td': { fontSize: `${fontSize}rem`, py: 0.3, whiteSpace: 'nowrap' } }}>
                <TableCell>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 500, fontSize: `${fontSize}rem` }}>
                    {entry.entry_number}
                  </Typography>
                </TableCell>
                <TableCell>{entry.date}</TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell>{entry.reference}</TableCell>
                <TableCell align="right">{parseFloat(entry.total_debit).toLocaleString(i18n.language)}</TableCell>
                <TableCell align="right">{parseFloat(entry.total_credit).toLocaleString(i18n.language)}</TableCell>
                <TableCell>
                  <Chip
                    label={entry.is_posted ? t('journal.posted') : t('journal.draft')}
                    size="small"
                    sx={{
                      bgcolor: entry.is_posted ? '#2e7d32' : '#ed6c02',
                      color: '#fff', height: `${fontSize * 1.4}rem`, fontSize: `${fontSize - 0.05}rem`,
                      '& .MuiChip-label': { px: 0.8, fontSize: `${fontSize - 0.05}rem` },
                    }}
                  />
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('common.view')}><IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleView(entry)}><ViewIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                  {!entry.is_posted && (
                    <>
                      <Tooltip title={t('common.edit')}><IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleOpen(entry)}><EditIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                      <Tooltip title={t('journal.post')}><IconButton size="small" sx={{ p: 0.3 }} color="success" onClick={() => handlePost(entry.id)}><PostIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                      <Tooltip title={t('common.delete')}><IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(entry.id)}><DeleteIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                    </>
                  )}
                  {entry.is_posted && (
                    <>
                      <Tooltip title={t('journal.editUnpostRepost')}><IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleEditPosted(entry)}><EditIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                      <Tooltip title={t('journal.unpost')}><IconButton size="small" sx={{ p: 0.3 }} color="warning" onClick={() => handleUnpost(entry.id)}><UnpostIcon sx={{ fontSize: 14 }} /></IconButton></Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('journal.noEntries')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handlePageChange}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleRowsPerPageChange}
          rowsPerPageOptions={[25, 50, 100]}
        />
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editing ? t('journal.editEntry', { number: editing.entry_number }) : t('journal.newJournalEntry')}
          {autoRepost && (
            <Chip label={t('journal.willAutoRepost')} size="small" color="info" sx={{ ml: 2, height: 20, fontSize: '11px' }} />
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 2, mt: 1, mb: 2 }}>
            <TextField
              label={t('common.date')} type="date" value={form.date} size="small"
              onChange={e => setForm({ ...form, date: e.target.value })}
              InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
            />
            <TextField
              label={t('common.description')} value={form.description} size="small" fullWidth
              onChange={e => setForm({ ...form, description: e.target.value })}
            />
            <TextField
              label={t('common.reference')} value={form.reference} size="small" sx={{ width: 200 }}
              onChange={e => setForm({ ...form, reference: e.target.value })}
            />
          </Box>

          {/* Lines */}
          <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>{t('journal.entryLines')}</Typography>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600, width: '40%' }}>{t('common.account')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField
                      select value={line.account_id} size="small" fullWidth
                      onChange={e => updateLine(i, 'account_id', e.target.value)}
                    >
                      {accounts.map(a => (
                        <MenuItem key={a.id} value={a.id}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', mr: 1 }}>{a.code}</Typography>
                          {a.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField
                      value={line.description} size="small" fullWidth
                      onChange={e => updateLine(i, 'description', e.target.value)}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField
                      value={line.debit} size="small" type="number" sx={{ width: 100 }}
                      onChange={e => updateLine(i, 'debit', e.target.value)}
                      inputProps={{ min: 0, step: '0.01' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <TextField
                      value={line.credit} size="small" type="number" sx={{ width: 100 }}
                      onChange={e => updateLine(i, 'credit', e.target.value)}
                      inputProps={{ min: 0, step: '0.01' }}
                    />
                  </TableCell>
                  <TableCell sx={{ p: 0.5 }}>
                    <IconButton size="small" onClick={() => removeLine(i)} disabled={lines.length <= 2}>
                      <RemoveLineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {/* Totals row */}
              <TableRow>
                <TableCell colSpan={2} align="right" sx={{ fontWeight: 600 }}>{t('common.totals') + ':'}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{totalDebit.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{totalCredit.toFixed(2)}</TableCell>
                <TableCell />
              </TableRow>
              {!isBalanced && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography variant="caption" color="error">
                      {t('journal.notBalanced', { diff: Math.abs(totalDebit - totalCredit).toFixed(2) })}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Button startIcon={<AddLineIcon />} onClick={addLine} size="small" sx={{ mt: 1 }}>
            {t('journal.addLine')}
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDialogClose}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} disabled={!isBalanced} sx={{ bgcolor: '#2e7d32' }}>
            {editing ? (autoRepost ? t('journal.updateAndRepost') : t('common.update')) : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          {viewing?.entry_number} — {viewing?.date}
          <Chip
            label={viewing?.is_posted ? t('journal.posted') : t('journal.draft')}
            size="small"
            sx={{ ml: 2, bgcolor: viewing?.is_posted ? '#2e7d32' : '#ed6c02', color: '#fff' }}
          />
        </DialogTitle>
        <DialogContent>
          {viewing?.description && (
            <Typography variant="body2" sx={{ mb: 1 }}>{viewing.description}</Typography>
          )}
          {viewing?.reference && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
              Ref: {viewing.reference}
            </Typography>
          )}
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {viewing?.lines?.map((line, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {line.account_code} — {line.account_name}
                    </Typography>
                  </TableCell>
                  <TableCell>{line.description}</TableCell>
                  <TableCell align="right">{parseFloat(line.debit) > 0 ? parseFloat(line.debit).toLocaleString(i18n.language) : ''}</TableCell>
                  <TableCell align="right">{parseFloat(line.credit) > 0 ? parseFloat(line.credit).toLocaleString(i18n.language) : ''}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} align="right" sx={{ fontWeight: 600 }}>{t('common.totals') + ':'}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {viewing ? parseFloat(viewing.total_debit).toLocaleString(i18n.language) : ''}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {viewing ? parseFloat(viewing.total_credit).toLocaleString(i18n.language) : ''}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialogOpen(false)}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default JournalEntries;
