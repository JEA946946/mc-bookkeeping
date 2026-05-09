import React, { useState, useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, FormControlLabel, Switch, Alert, LinearProgress,
} from '@mui/material';
import {
  Upload as UploadIcon, Download as DownloadIcon, CheckCircle, Error as ErrorIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { exportToCSV } from '../utils/csvExport';

interface PreviewRow {
  row_number: number;
  status: 'new' | 'duplicate' | 'error';
  existing_id?: string | null;
  errors: string[];
  data: Record<string, string>;
}

interface PreviewSummary {
  new: number;
  duplicate: number;
  error: number;
  total: number;
}

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  previewEndpoint: string;
  confirmEndpoint: string;
  templateColumns: string[];
  entityName: string;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  new: 'success',
  duplicate: 'warning',
  error: 'error',
};

const ImportDialog: React.FC<ImportDialogProps> = ({
  open, onClose, onSuccess, previewEndpoint, confirmEndpoint, templateColumns, entityName,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setPreviewRows([]);
    setSummary(null);
    setError('');
    setUpdateExisting(false);
    setResult(null);
    onClose();
  };

  const handleDownloadTemplate = () => {
    exportToCSV(`${entityName}_template.csv`, templateColumns, []);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError(t('importExport.noFile'));
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('importExport.invalidFormat'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(previewEndpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data;
      if (data.success) {
        setPreviewRows(data.rows || []);
        setSummary(data.summary || null);
        setStep('preview');
      } else {
        setError(data.message || t('importExport.importError'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('importExport.importError'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post(confirmEndpoint, {
        rows: previewRows,
        update_existing: updateExisting,
      });
      const data = res.data;
      if (data.success) {
        setResult({ created: data.created || 0, updated: data.updated || 0 });
        onSuccess();
      } else {
        setError(data.message || t('importExport.importError'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('importExport.importError'));
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case 'new': return t('importExport.statusNew');
      case 'duplicate': return t('importExport.statusDuplicate');
      case 'error': return t('importExport.statusError');
      default: return s;
    }
  };

  const dataColumns = previewRows.length > 0 ? Object.keys(previewRows[0].data) : templateColumns;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>{t('importExport.importCsv')} — {entityName}</DialogTitle>
      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {result ? (
          <Alert severity="success" icon={<CheckCircle />}>
            {t('importExport.importSuccess', { count: result.created + result.updated })}
            {result.updated > 0 && ` (${t('importExport.updateCount', { count: result.updated })})`}
          </Alert>
        ) : step === 'upload' ? (
          <Box>
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}
                size="small"
              >
                {t('importExport.downloadTemplate')}
              </Button>
            </Box>

            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { borderColor: 'primary.main' },
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
              <Typography>{file ? file.name : t('importExport.selectFile')}</Typography>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Box>
          </Box>
        ) : (
          <Box>
            {summary && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Chip label={t('importExport.newCount', { count: summary.new })} color="success" variant="outlined" />
                <Chip label={t('importExport.updateCount', { count: summary.duplicate })} color="warning" variant="outlined" />
                <Chip label={t('importExport.errorCount', { count: summary.error })} color="error" variant="outlined" />
                <Typography variant="body2" sx={{ alignSelf: 'center' }}>
                  ({summary.total} {t('importExport.row')})
                </Typography>
              </Box>
            )}

            {(summary?.duplicate ?? 0) > 0 && (
              <FormControlLabel
                control={<Switch checked={updateExisting} onChange={(_, v) => setUpdateExisting(v)} />}
                label={t('importExport.updateExisting')}
                sx={{ mb: 2 }}
              />
            )}

            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell>{t('common.status')}</TableCell>
                    {dataColumns.map(col => (
                      <TableCell key={col}>{col}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map(row => (
                    <TableRow key={row.row_number} sx={row.status === 'error' ? { bgcolor: 'error.50' } : {}}>
                      <TableCell>{row.row_number}</TableCell>
                      <TableCell>
                        <Chip
                          label={statusLabel(row.status)}
                          color={STATUS_COLORS[row.status] || 'default'}
                          size="small"
                        />
                        {row.errors.length > 0 && (
                          <Typography variant="caption" color="error" display="block">
                            {row.errors.join(', ')}
                          </Typography>
                        )}
                      </TableCell>
                      {dataColumns.map(col => (
                        <TableCell key={col}>{row.data[col] || ''}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{result ? t('common.close') : t('common.cancel')}</Button>
        {!result && step === 'upload' && (
          <Button variant="contained" onClick={handleUpload} disabled={loading || !file}>
            {loading ? t('importExport.uploading') : t('importExport.preview')}
          </Button>
        )}
        {!result && step === 'preview' && (
          <>
            <Button onClick={() => { setStep('upload'); setPreviewRows([]); setSummary(null); }}>
              {t('common.back')}
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={loading || (summary?.new === 0 && (!updateExisting || summary?.duplicate === 0))}
            >
              {loading ? t('importExport.confirming') : t('importExport.confirm')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ImportDialog;
