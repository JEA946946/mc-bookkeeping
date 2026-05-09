import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, MenuItem, Chip, IconButton,
  TablePagination, Collapse, InputAdornment,
} from '@mui/material';
import {
  Search as SearchIcon, KeyboardArrowDown, KeyboardArrowUp,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  model_name: string;
  record_id: string;
  changes: Record<string, any> | null;
}

interface AuditLogResponse {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  create: { bg: '#2e7d32', color: '#fff' },
  update: { bg: '#1976d2', color: '#fff' },
  delete: { bg: '#d32f2f', color: '#fff' },
  post: { bg: '#7b1fa2', color: '#fff' },
  unpost: { bg: '#e65100', color: '#fff' },
};

const AuditLog: React.FC = () => {
  const { t, i18n } = useTranslation();

  const ACTION_OPTIONS = [
    { value: '', label: t('auditLog.allActions') },
    { value: 'create', label: t('auditLog.actionCreate') },
    { value: 'update', label: t('auditLog.actionUpdate') },
    { value: 'delete', label: t('auditLog.actionDelete') },
    { value: 'post', label: t('auditLog.actionPost') },
    { value: 'unpost', label: t('auditLog.actionUnpost') },
  ];

  const ACTION_LABELS: Record<string, string> = {
    create: t('auditLog.actionCreate'),
    update: t('auditLog.actionUpdate'),
    delete: t('auditLog.actionDelete'),
    post: t('auditLog.actionPost'),
    unpost: t('auditLog.actionUnpost'),
  };

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters
  const [action, setAction] = useState('');
  const [modelName, setModelName] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  const PAGE_SIZE = 50;

  const fetchEntries = useCallback(() => {
    const params = new URLSearchParams();
    if (action) params.set('action', action);
    if (modelName.trim()) params.set('model_name', modelName.trim());
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search.trim()) params.set('search', search.trim());
    params.set('page', String(page + 1));
    params.set('page_size', String(PAGE_SIZE));

    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get(`/audit-log${qs}`).then(res => {
      if (res.data.success) {
        const data: AuditLogResponse = res.data.data || res.data;
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      }
    });
  }, [action, modelName, dateFrom, dateTo, search, page]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSearch = () => {
    setPage(0);
    fetchEntries();
  };

  const handleFilterChange = () => {
    setPage(0);
  };

  const toggleExpand = (id: string) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  const formatTimestamp = (ts: string) => {
    try {
      const date = new Date(ts);
      return date.toLocaleString(i18n.language, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return ts;
    }
  };

  return (
    <Box>
      {/* Header */}
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('auditLog.title')}</Typography>

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={t('auditLog.action')}
          value={action}
          size="small"
          select
          sx={{ width: 150 }}
          onChange={e => { setAction(e.target.value); handleFilterChange(); }}
        >
          {ACTION_OPTIONS.map(opt => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Model"
          value={modelName}
          size="small"
          sx={{ width: 160 }}
          onChange={e => setModelName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <TextField
          label={t('common.from')}
          type="date"
          value={dateFrom}
          size="small"
          onChange={e => { setDateFrom(e.target.value); handleFilterChange(); }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 155 }}
        />
        <TextField
          label={t('common.to')}
          type="date"
          value={dateTo}
          size="small"
          onChange={e => { setDateTo(e.target.value); handleFilterChange(); }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 155 }}
        />
        <TextField
          label={t('common.search')}
          value={search}
          size="small"
          sx={{ width: 200 }}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={handleSearch} sx={{ p: 0.3 }}>
                  <SearchIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600, width: 40 }} />
              <TableCell sx={{ fontWeight: 600 }}>{t('auditLog.timestamp')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('auditLog.user')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('auditLog.action')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('auditLog.entity')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('auditLog.entityId')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map(entry => {
              const actionStyle = ACTION_COLORS[entry.action] || { bg: '#9e9e9e', color: '#fff' };
              const isExpanded = expandedRow === entry.id;
              const hasChanges = entry.changes && Object.keys(entry.changes).length > 0;

              return (
                <React.Fragment key={entry.id}>
                  <TableRow hover>
                    <TableCell sx={{ p: 0.5 }}>
                      {hasChanges && (
                        <IconButton size="small" onClick={() => toggleExpand(entry.id)} sx={{ p: 0.3 }}>
                          {isExpanded ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <KeyboardArrowDown sx={{ fontSize: 18 }} />}
                        </IconButton>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {formatTimestamp(entry.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell>{entry.user}</TableCell>
                    <TableCell>
                      <Chip
                        label={ACTION_LABELS[entry.action] || entry.action}
                        size="small"
                        sx={{
                          bgcolor: actionStyle.bg,
                          color: actionStyle.color,
                          height: 20,
                          fontSize: '11px',
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{entry.model_name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                        {entry.record_id}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  {hasChanges && (
                    <TableRow>
                      <TableCell colSpan={6} sx={{ py: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 1.5, bgcolor: '#fafafa', borderRadius: 1, my: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>
                              {t('auditLog.changes')}:
                            </Typography>
                            <Box
                              component="pre"
                              sx={{
                                bgcolor: '#263238',
                                color: '#e0e0e0',
                                p: 1.5,
                                borderRadius: 1,
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                overflow: 'auto',
                                maxHeight: 300,
                                m: 0,
                              }}
                            >
                              {JSON.stringify(entry.changes, null, 2)}
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('auditLog.noEntries')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} ${t('common.of')} ${count !== -1 ? count : `${t('common.moreThan')} ${to}`}`}
        />
      </TableContainer>
    </Box>
  );
};

export default AuditLog;
