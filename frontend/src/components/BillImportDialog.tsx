import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  Chip, Alert, LinearProgress, Autocomplete, TextField, InputAdornment,
} from '@mui/material';
import {
  Upload as UploadIcon, CheckCircle, Search as SearchIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface Supplier {
  id: string;
  code: string;
  name: string;
}

interface PreviewRow {
  row_number: number;
  status: string;
  errors: string[];
  data: Record<string, string>;
}

interface PreviewSummary {
  new: number;
  duplicate: number;
  error: number;
  total: number;
}

interface BillImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const BillImportDialog: React.FC<BillImportDialogProps> = ({ open, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [result, setResult] = useState<{ created: number } | null>(null);

  // Suppliers from bookkeeping DB
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  // CMR suppliers
  const [cmrSuppliers, setCmrSuppliers] = useState<Supplier[]>([]);
  const [cmrLoading, setCmrLoading] = useState(false);
  const [cmrFetched, setCmrFetched] = useState(false);
  const [cmrSearch, setCmrSearch] = useState('');

  useEffect(() => {
    if (open) {
      api.get('/suppliers').then(res => {
        if (res.data.success) {
          setSuppliers(res.data.data.suppliers.map((s: any) => ({
            id: s.id, code: s.code, name: s.name,
          })));
        }
      });
    }
  }, [open]);

  const allSuppliers = useMemo(() => {
    const map = new Map<string, Supplier>();
    suppliers.forEach(s => map.set(s.id, s));
    cmrSuppliers.forEach(s => { if (!map.has(s.id)) map.set(s.id, s); });
    return Array.from(map.values());
  }, [suppliers, cmrSuppliers]);

  const handleClose = () => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setSummary(null);
    setError('');
    setResult(null);
    setCmrFetched(false);
    setCmrSuppliers([]);
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(''); }
  };

  const handleUpload = async () => {
    if (!file) { setError(t('importExport.noFile')); return; }
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setError(t('importExport.invalidFormat'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/bills/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.success) {
        setRows(res.data.rows || []);
        setSummary(res.data.summary || null);
        setStep('preview');
      } else {
        setError(res.data.message || t('importExport.importError'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('importExport.importError'));
    } finally {
      setLoading(false);
    }
  };

  const handleFetchCmr = async () => {
    setCmrLoading(true);
    try {
      const res = await api.get('/cmr/suppliers');
      if (res.data.success) {
        const mapped = res.data.data.suppliers.map((s: any) => ({
          id: s.id,
          code: '',
          name: s.company_name || s.name,
        }));
        setCmrSuppliers(mapped);
        setCmrFetched(true);
      }
    } catch { /* ignore */ }
    finally { setCmrLoading(false); }
  };

  const handleSupplierChange = (rowIndex: number, supplier: Supplier | null) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== rowIndex) return r;
      return {
        ...r,
        status: r.errors.length > 0 ? 'error' : 'new',
        data: {
          ...r.data,
          supplier: supplier?.name || r.data.supplier,
          supplier_id: supplier?.id || '',
        },
      };
    }));
  };

  const canConfirm = rows.some(r => r.status !== 'error');

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/bills/import/confirm', { rows, update_existing: false });
      if (res.data.success) {
        setResult({ created: res.data.created || 0 });
        setStep('done');
        onSuccess();
      } else {
        setError(res.data.message || t('importExport.importError'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('importExport.importError'));
    } finally {
      setLoading(false);
    }
  };

  const DISPLAY_COLS = ['supplier', 'document_type', 'document_no', 'booking_ref', 'traveler', 'travel_date', 'invoice_date', 'due_date', 'currency', 'amount', 'status', 'notes'];

  const unmappedCount = rows.filter(r => !r.data.supplier_id && r.status !== 'error').length;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xl" fullWidth>
      <DialogTitle>{t('importExport.importFile')} — {t('bills.title')}</DialogTitle>
      <DialogContent>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 'done' && result ? (
          <Alert severity="success" icon={<CheckCircle />}>
            {t('importExport.importSuccess', { count: result.created })}
          </Alert>
        ) : step === 'upload' ? (
          <Box
            sx={{
              border: '2px dashed', borderColor: 'divider', borderRadius: 2,
              p: 4, textAlign: 'center', cursor: 'pointer',
              '&:hover': { borderColor: 'primary.main' },
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
            <Typography>{file ? file.name : t('importExport.selectFileExcel')}</Typography>
            <input
              ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls"
              style={{ display: 'none' }} onChange={handleFileChange}
            />
          </Box>
        ) : (
          <Box>
            {/* Summary chips */}
            {summary && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <Chip label={`${summary.new} ${t('importExport.statusNew').toLowerCase()}`} color="success" variant="outlined" />
                <Chip label={`${summary.duplicate} ${t('importExport.statusDuplicate').toLowerCase()}`} color="warning" variant="outlined" />
                <Chip label={`${summary.error} ${t('importExport.statusError').toLowerCase()}`} color="error" variant="outlined" />
                <Typography variant="body2">({summary.total} {t('importExport.row')})</Typography>
              </Box>
            )}

            {/* Supplier mapping tools */}
            {unmappedCount > 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {t('bills.unmappedSuppliers', { count: unmappedCount })} — {t('bills.supplierAssignLater')}
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
              {!cmrFetched && (
                <Button
                  variant="outlined" size="small" onClick={handleFetchCmr}
                  disabled={cmrLoading} color="success"
                >
                  {cmrLoading ? t('common.loading') : t('bills.fetchCmrSuppliers')}
                </Button>
              )}
              {cmrFetched && (
                <Chip label={`CMR: ${cmrSuppliers.length} ${t('suppliers.title').toLowerCase()}`} color="success" size="small" />
              )}
            </Box>

            {/* Preview table */}
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 450 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>{t('bills.supplier')}</TableCell>
                    {DISPLAY_COLS.slice(1).map(col => (
                      <TableCell key={col} sx={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{col}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={row.row_number} sx={row.status === 'error' ? { bgcolor: '#fff3e0' } : row.status === 'duplicate' ? { bgcolor: '#fff8e1' } : {}}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {row.row_number}
                          {row.status === 'duplicate' && <Chip label="dup" size="small" color="warning" sx={{ height: 18, fontSize: '10px' }} />}
                          {row.status === 'error' && <Chip label="err" size="small" color="error" sx={{ height: 18, fontSize: '10px' }} />}
                        </Box>
                        {row.errors.length > 0 && (
                          <Typography variant="caption" color="error" sx={{ fontSize: '10px' }}>
                            {row.errors.join('; ')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ p: 0.5 }}>
                        {row.data.supplier_id ? (
                          <Chip
                            label={row.data.supplier}
                            size="small"
                            color="success"
                            variant="outlined"
                            sx={{ maxWidth: 200 }}
                            onDelete={() => handleSupplierChange(idx, null)}
                          />
                        ) : (
                          <Autocomplete
                            size="small"
                            options={allSuppliers}
                            getOptionLabel={(o) => o.name}
                            onChange={(_, val) => handleSupplierChange(idx, val)}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                variant="outlined"
                                placeholder={row.data.supplier || t('bills.pickSupplier')}
                                sx={{ minWidth: 200, '& .MuiOutlinedInput-root': { bgcolor: '#fff3e0' } }}
                              />
                            )}
                            renderOption={(props, option) => (
                              <li {...props} key={option.id}>
                                <Typography variant="body2">{option.name}</Typography>
                                {option.code && (
                                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                    ({option.code})
                                  </Typography>
                                )}
                              </li>
                            )}
                            filterOptions={(options, { inputValue }) => {
                              if (!inputValue) return options.slice(0, 30);
                              const q = inputValue.toLowerCase();
                              return options.filter(o =>
                                o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)
                              ).slice(0, 30);
                            }}
                            ListboxProps={{ style: { maxHeight: 200 } }}
                          />
                        )}
                      </TableCell>
                      {DISPLAY_COLS.slice(1).map(col => (
                        <TableCell key={col} sx={{ whiteSpace: 'nowrap', fontSize: '12px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {row.data[col] || ''}
                        </TableCell>
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
        <Button onClick={handleClose}>{step === 'done' ? t('common.close') : t('common.cancel')}</Button>
        {step === 'upload' && (
          <Button variant="contained" onClick={handleUpload} disabled={loading || !file}>
            {loading ? t('importExport.uploading') : t('importExport.preview')}
          </Button>
        )}
        {step === 'preview' && (
          <>
            <Button onClick={() => { setStep('upload'); setRows([]); setSummary(null); }}>
              {t('common.back')}
            </Button>
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={loading || !canConfirm}
              sx={{ bgcolor: '#2e7d32' }}
            >
              {loading ? t('importExport.confirming') : t('importExport.confirm')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BillImportDialog;
