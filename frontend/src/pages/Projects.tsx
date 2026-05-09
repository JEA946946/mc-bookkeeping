import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Tooltip, Autocomplete, Tabs, Tab,
  Checkbox, InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  RemoveRedEye as ViewIcon, Search as SearchIcon, ArrowBack as BackIcon,
  Assignment as AssignIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

/* ---------- interfaces ---------- */

interface Customer {
  id: string;
  code: string;
  name: string;
}

interface Project {
  id: string;
  code: string;
  name: string;
  customer_id: string | null;
  customer_name?: string;
  status: string;
  start_date: string;
  end_date: string;
  budget: string;
  notes: string;
}

interface ProjectLine {
  id: string;
  date: string;
  entry_number: string;
  account_code: string;
  account_name: string;
  description: string;
  debit: string;
  credit: string;
}

interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string;
  lines: JournalEntryLine[];
}

interface JournalEntryLine {
  id: string;
  account_code: string;
  account_name: string;
  description: string;
  debit: string;
  credit: string;
  journal_entry_id: string;
  entry_number?: string;
  date?: string;
}

interface PnlData {
  revenue: number;
  expenses: number;
  profit: number;
  lines?: { account_code: string; account_name: string; total: number }[];
}

/* ---------- constants ---------- */

const EMPTY_FORM = {
  code: '',
  name: '',
  customer_id: '',
  status: 'active',
  start_date: '',
  end_date: '',
  budget: '0',
  notes: '',
};

/* ---------- component ---------- */

const Projects: React.FC = () => {
  const { t, i18n } = useTranslation();

  const STATUS_OPTIONS = [
    { value: '', label: t('common.all') },
    { value: 'active', label: t('projects.activeStatus') },
    { value: 'completed', label: t('projects.completedStatus') },
    { value: 'cancelled', label: t('projects.cancelledStatus') },
  ];

  const STATUS_CHIP: Record<string, { label: string; color: 'success' | 'primary' | 'default' }> = {
    active: { label: t('projects.activeStatus'), color: 'success' },
    completed: { label: t('projects.completedStatus'), color: 'primary' },
    cancelled: { label: t('projects.cancelledStatus'), color: 'default' },
  };

  /* --- list state --- */
  const [projects, setProjects] = useState<Project[]>([]);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);

  /* --- dialog state --- */
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  /* --- detail state --- */
  const [viewing, setViewing] = useState<Project | null>(null);
  const [detailTab, setDetailTab] = useState(0);
  const [projectLines, setProjectLines] = useState<ProjectLine[]>([]);
  const [pnl, setPnl] = useState<PnlData | null>(null);

  /* --- assign state --- */
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [unassignedLines, setUnassignedLines] = useState<JournalEntryLine[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [assignSearch, setAssignSearch] = useState('');

  /* ======================== data fetching ======================== */

  const fetchProjects = () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterSearch.trim()) params.set('search', filterSearch.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/projects${qs}`).then(res => {
      if (res.data.success) {
        setProjects(res.data.data?.projects ?? res.data.projects ?? []);
      }
    });
  };

  const fetchCustomers = () => {
    api.get('/customers?is_active=true').then(res => {
      if (res.data.success) {
        setCustomers(res.data.data?.customers ?? res.data.customers ?? []);
      }
    });
  };

  useEffect(() => {
    fetchProjects();
    fetchCustomers();
  }, []);

  const handleApplyFilters = () => {
    fetchProjects();
  };

  /* ======================== detail helpers ======================== */

  const openDetail = async (project: Project) => {
    setViewing(project);
    setDetailTab(0);
    fetchProjectLines(project.id);
    fetchPnl(project.id);
  };

  const closeDetail = () => {
    setViewing(null);
    setProjectLines([]);
    setPnl(null);
    setUnassignedLines([]);
    setSelectedLineIds([]);
    setAssignSearch('');
  };

  const fetchProjectLines = (projectId: string) => {
    api.get(`/projects/${projectId}/transactions`).then(res => {
      if (res.data.success) {
        setProjectLines(res.data.data?.lines ?? res.data.lines ?? []);
      }
    });
  };

  const fetchPnl = (projectId: string) => {
    api.get(`/projects/${projectId}/pnl`).then(res => {
      if (res.data.success) {
        setPnl(res.data.data ?? res.data.pnl ?? null);
      }
    });
  };

  const fetchJournalEntriesForAssign = () => {
    const params = new URLSearchParams();
    if (assignSearch.trim()) params.set('search', assignSearch.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/journal-entries${qs}`).then(res => {
      if (res.data.success) {
        const entries: JournalEntry[] = res.data.data?.journal_entries ?? res.data.journal_entries ?? [];
        setJournalEntries(entries);
        // Flatten lines with parent entry info for selection
        const allLines: JournalEntryLine[] = [];
        entries.forEach(entry => {
          (entry.lines || []).forEach(line => {
            allLines.push({
              ...line,
              journal_entry_id: entry.id,
              entry_number: entry.entry_number,
              date: entry.date,
            });
          });
        });
        setUnassignedLines(allLines);
      }
    });
  };

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setDetailTab(newValue);
    if (newValue === 1 && viewing) {
      fetchJournalEntriesForAssign();
    }
  };

  const toggleLineSelection = (lineId: string) => {
    setSelectedLineIds(prev =>
      prev.includes(lineId) ? prev.filter(id => id !== lineId) : [...prev, lineId]
    );
  };

  const toggleAllLines = () => {
    if (selectedLineIds.length === unassignedLines.length) {
      setSelectedLineIds([]);
    } else {
      setSelectedLineIds(unassignedLines.map(l => l.id));
    }
  };

  const handleAssign = async () => {
    if (!viewing || selectedLineIds.length === 0) return;
    try {
      await api.post(`/projects/${viewing.id}/assign`, { journal_line_ids: selectedLineIds });
      setSelectedLineIds([]);
      fetchProjectLines(viewing.id);
      fetchPnl(viewing.id);
      fetchJournalEntriesForAssign();
    } catch (err: any) {
      alert(err.response?.data?.message || t('projects.assignError'));
    }
  };

  /* ======================== CRUD handlers ======================== */

  const handleOpen = (project?: Project) => {
    if (project) {
      setEditing(project);
      setForm({
        code: project.code,
        name: project.name,
        customer_id: project.customer_id || '',
        status: project.status,
        start_date: project.start_date || '',
        end_date: project.end_date || '',
        budget: project.budget || '0',
        notes: project.notes || '',
      });
      setSelectedCustomer(
        project.customer_id
          ? customers.find(c => c.id === project.customer_id) || null
          : null
      );
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setSelectedCustomer(null);
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = {
      ...form,
      customer_id: selectedCustomer?.id || null,
      budget: parseFloat(form.budget) || 0,
    };
    try {
      if (editing) {
        await api.put(`/projects/${editing.id}`, payload);
      } else {
        await api.post('/projects', payload);
      }
      setDialogOpen(false);
      fetchProjects();
    } catch (err: any) {
      alert(err.response?.data?.message || t('projects.saveError'));
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(t('projects.deleteConfirm', { name: project.name }))) return;
    try {
      await api.delete(`/projects/${project.id}`);
      fetchProjects();
    } catch (err: any) {
      alert(err.response?.data?.message || t('projects.deleteError'));
    }
  };

  /* ======================== formatters ======================== */

  const fmtNum = (v: string | number) =>
    parseFloat(String(v)).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ======================== render: detail view ======================== */

  if (viewing) {
    const chip = STATUS_CHIP[viewing.status] || { label: viewing.status, color: 'default' as const };

    return (
      <Box>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <IconButton onClick={closeDetail} size="small">
            <BackIcon />
          </IconButton>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {viewing.code} — {viewing.name}
          </Typography>
          <Chip label={chip.label} color={chip.color} size="small" sx={{ ml: 1 }} />
        </Box>

        {/* Project info summary */}
        <Paper sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('projects.customer')}</Typography>
              <Typography variant="body2">{viewing.customer_name || '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('projects.startDate')}</Typography>
              <Typography variant="body2">{viewing.start_date || '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('projects.endDate')}</Typography>
              <Typography variant="body2">{viewing.end_date || '—'}</Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">{t('projects.budget')}</Typography>
              <Typography variant="body2">{fmtNum(viewing.budget)}</Typography>
            </Box>
          </Box>
          {viewing.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {viewing.notes}
            </Typography>
          )}
        </Paper>

        {/* Tabs */}
        <Tabs value={detailTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label={t('projects.entries')} />
          <Tab label={t('projects.assign')} />
          <Tab label={t('projects.pnl')} />
        </Tabs>

        {/* --- Posteringer tab --- */}
        {detailTab === 0 && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('projects.entryNumber')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {projectLines.map(line => (
                  <TableRow key={line.id} hover>
                    <TableCell>{line.date}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {line.entry_number}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {line.account_code} — {line.account_name}
                      </Typography>
                    </TableCell>
                    <TableCell>{line.description}</TableCell>
                    <TableCell align="right">
                      {parseFloat(line.debit) > 0 ? fmtNum(line.debit) : ''}
                    </TableCell>
                    <TableCell align="right">
                      {parseFloat(line.credit) > 0 ? fmtNum(line.credit) : ''}
                    </TableCell>
                  </TableRow>
                ))}
                {projectLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        {t('projects.noEntries')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* --- Tildel tab --- */}
        {detailTab === 1 && (
          <Box>
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <TextField
                label={t('projects.searchEntries')}
                value={assignSearch}
                size="small"
                onChange={e => setAssignSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && fetchJournalEntriesForAssign()}
                sx={{ width: 300 }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={fetchJournalEntriesForAssign} sx={{ p: 0.3 }}>
                        <SearchIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Button
                variant="contained"
                startIcon={<AssignIcon />}
                disabled={selectedLineIds.length === 0}
                onClick={handleAssign}
                sx={{ bgcolor: '#2e7d32' }}
              >
                {t('projects.assignSelected')} ({selectedLineIds.length})
              </Button>
            </Paper>

            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={unassignedLines.length > 0 && selectedLineIds.length === unassignedLines.length}
                        indeterminate={selectedLineIds.length > 0 && selectedLineIds.length < unassignedLines.length}
                        onChange={toggleAllLines}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('projects.entryNumber')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {unassignedLines.map(line => (
                    <TableRow
                      key={line.id}
                      hover
                      selected={selectedLineIds.includes(line.id)}
                      onClick={() => toggleLineSelection(line.id)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          size="small"
                          checked={selectedLineIds.includes(line.id)}
                          onChange={() => toggleLineSelection(line.id)}
                        />
                      </TableCell>
                      <TableCell>{line.date}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {line.entry_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {line.account_code} — {line.account_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{line.description}</TableCell>
                      <TableCell align="right">
                        {parseFloat(line.debit) > 0 ? fmtNum(line.debit) : ''}
                      </TableCell>
                      <TableCell align="right">
                        {parseFloat(line.credit) > 0 ? fmtNum(line.credit) : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                  {unassignedLines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                        <Typography variant="body2" color="text.secondary">
                          {t('projects.noLines')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* --- P&L tab --- */}
        {detailTab === 2 && (
          <Box>
            {pnl ? (
              <>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{t('projects.revenue')}</Typography>
                      <Typography variant="h6" sx={{ color: '#2e7d32', fontWeight: 600 }}>
                        {fmtNum(pnl.revenue)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{t('projects.costs')}</Typography>
                      <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 600 }}>
                        {fmtNum(pnl.expenses)}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary">{t('projects.result')}</Typography>
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: pnl.profit >= 0 ? '#2e7d32' : '#d32f2f' }}
                      >
                        {fmtNum(pnl.profit)}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>

                {pnl.lines && pnl.lines.length > 0 && (
                  <TableContainer component={Paper}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                          <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>{t('projects.accountName')}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.total')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {pnl.lines.map((line, i) => (
                          <TableRow key={i} hover>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                {line.account_code}
                              </Typography>
                            </TableCell>
                            <TableCell>{line.account_name}</TableCell>
                            <TableCell align="right">{fmtNum(line.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            ) : (
              <Paper sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {t('projects.noPnlData')}
                </Typography>
              </Paper>
            )}
          </Box>
        )}
      </Box>
    );
  }

  /* ======================== render: list view ======================== */

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('projects.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()} sx={{ bgcolor: '#2e7d32' }}>
          {t('projects.addProject')}
        </Button>
      </Box>

      {/* Filter Bar */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select
          label={t('common.status')}
          value={filterStatus}
          size="small"
          onChange={e => setFilterStatus(e.target.value)}
          sx={{ width: 150 }}
        >
          {STATUS_OPTIONS.map(o => (
            <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('common.search')}
          value={filterSearch}
          size="small"
          onChange={e => setFilterSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleApplyFilters()}
          sx={{ width: 240 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleApplyFilters} sx={{ p: 0.3 }}>
                  <SearchIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Button variant="outlined" size="small" onClick={handleApplyFilters}>
          {t('common.filter')}
        </Button>
      </Paper>

      {/* Project Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('projects.code')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('projects.customer')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.status')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('projects.startDate')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('projects.endDate')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('projects.budget')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map(project => {
              const chip = STATUS_CHIP[project.status] || { label: project.status, color: 'default' as const };
              return (
                <TableRow key={project.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {project.code}
                    </Typography>
                  </TableCell>
                  <TableCell>{project.name}</TableCell>
                  <TableCell>{project.customer_name || '—'}</TableCell>
                  <TableCell>
                    <Chip label={chip.label} color={chip.color} size="small" />
                  </TableCell>
                  <TableCell>{project.start_date || '—'}</TableCell>
                  <TableCell>{project.end_date || '—'}</TableCell>
                  <TableCell align="right">{fmtNum(project.budget)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={t('common.view')}>
                      <IconButton size="small" sx={{ p: 0.3 }} onClick={() => openDetail(project)}>
                        <ViewIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common.edit')}>
                      <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleOpen(project)}>
                        <EditIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={t('common.delete')}>
                      <IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(project)}>
                        <DeleteIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {projects.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('projects.noProjects')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? t('projects.editProject') : t('projects.addProject')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('projects.code')}
                value={form.code}
                size="small"
                sx={{ width: 140 }}
                onChange={e => setForm({ ...form, code: e.target.value })}
              />
              <TextField
                label={t('common.name')}
                value={form.name}
                size="small"
                fullWidth
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </Box>
            <Autocomplete
              options={customers}
              value={selectedCustomer}
              getOptionLabel={option => `${option.code} — ${option.name}`}
              onChange={(_, val) => {
                setSelectedCustomer(val);
                setForm({ ...form, customer_id: val?.id || '' });
              }}
              renderInput={params => (
                <TextField {...params} label={t('projects.customer')} size="small" />
              )}
              size="small"
              isOptionEqualToValue={(opt, val) => opt.id === val.id}
            />
            <TextField
              select
              label={t('common.status')}
              value={form.status}
              size="small"
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              <MenuItem value="active">{t('projects.activeStatus')}</MenuItem>
              <MenuItem value="completed">{t('projects.completedStatus')}</MenuItem>
              <MenuItem value="cancelled">{t('projects.cancelledStatus')}</MenuItem>
            </TextField>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('projects.startDate')}
                type="date"
                value={form.start_date}
                size="small"
                fullWidth
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label={t('projects.endDate')}
                type="date"
                value={form.end_date}
                size="small"
                fullWidth
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Box>
            <TextField
              label={t('projects.budget')}
              value={form.budget}
              size="small"
              type="number"
              onChange={e => setForm({ ...form, budget: e.target.value })}
              inputProps={{ min: 0, step: '0.01' }}
            />
            <TextField
              label={t('projects.notes')}
              value={form.notes}
              size="small"
              fullWidth
              multiline
              rows={3}
              onChange={e => setForm({ ...form, notes: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleSave} sx={{ bgcolor: '#2e7d32' }}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Projects;
