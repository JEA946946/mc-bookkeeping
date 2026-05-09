import React, { useEffect, useState, useRef } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip, Tooltip, Autocomplete,
} from '@mui/material';
import {
  Delete as DeleteIcon, CloudUpload as UploadIcon,
  Download as DownloadIcon, Link as LinkIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

/* ---------- interfaces ---------- */

interface Document {
  id: string;
  filename: string;
  description: string;
  linked_type: string | null;
  linked_id: string | null;
  linked_label: string | null;
  uploaded_by: string;
  created_at: string;
  file_url: string;
}

interface LinkOption {
  id: string;
  label: string;
}

/* ---------- component ---------- */

const Documents: React.FC = () => {
  const { t, i18n } = useTranslation();

  /* ---------- constants (inside component for t()) ---------- */

  const LINK_TYPES = [
    { value: 'journal_entry', label: t('documents.journalEntry') },
    { value: 'invoice', label: t('common.invoice') },
    { value: 'bill', label: t('common.bill') },
    { value: 'expense', label: t('documents.expense') },
  ];

  /* --- list state --- */
  const [documents, setDocuments] = useState<Document[]>([]);

  /* --- upload dialog state --- */
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadLinkType, setUploadLinkType] = useState('');
  const [uploadLinkId, setUploadLinkId] = useState('');
  const [uploadLinkOptions, setUploadLinkOptions] = useState<LinkOption[]>([]);
  const [uploadSelectedLink, setUploadSelectedLink] = useState<LinkOption | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* --- link dialog state --- */
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDocId, setLinkDocId] = useState('');
  const [linkType, setLinkType] = useState('');
  const [linkOptions, setLinkOptions] = useState<LinkOption[]>([]);
  const [linkSelected, setLinkSelected] = useState<LinkOption | null>(null);

  /* ======================== data fetching ======================== */

  const fetchDocuments = () => {
    api.get('/documents').then(res => {
      if (res.data.success) {
        setDocuments(res.data.data?.documents ?? res.data.documents ?? []);
      }
    });
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  /* ======================== link options loader ======================== */

  const fetchLinkOptions = (type: string, setter: (opts: LinkOption[]) => void) => {
    if (!type) {
      setter([]);
      return;
    }
    let endpoint = '';
    switch (type) {
      case 'journal_entry':
        endpoint = '/journal-entries';
        break;
      case 'invoice':
        endpoint = '/invoices';
        break;
      case 'bill':
        endpoint = '/bills';
        break;
      case 'expense':
        endpoint = '/expenses';
        break;
      default:
        setter([]);
        return;
    }
    api.get(endpoint).then(res => {
      if (res.data.success) {
        let items: any[] = [];
        switch (type) {
          case 'journal_entry':
            items = res.data.data?.journal_entries ?? res.data.journal_entries ?? [];
            setter(items.map((e: any) => ({
              id: e.id,
              label: `${e.entry_number} — ${e.date} — ${e.description || ''}`,
            })));
            break;
          case 'invoice':
            items = res.data.data?.invoices ?? res.data.invoices ?? [];
            setter(items.map((e: any) => ({
              id: e.id,
              label: `${e.invoice_number || e.number || e.id} — ${e.customer_name || ''} — ${e.total || ''}`,
            })));
            break;
          case 'bill':
            items = res.data.data?.bills ?? res.data.bills ?? [];
            setter(items.map((e: any) => ({
              id: e.id,
              label: `${e.bill_number || e.number || e.id} — ${e.vendor_name || e.supplier_name || ''} — ${e.total || ''}`,
            })));
            break;
          case 'expense':
            items = res.data.data?.expenses ?? res.data.expenses ?? [];
            setter(items.map((e: any) => ({
              id: e.id,
              label: `${e.expense_number || e.id} — ${e.description || ''} — ${e.amount || ''}`,
            })));
            break;
        }
      }
    }).catch(() => {
      setter([]);
    });
  };

  /* ======================== upload handlers ======================== */

  const openUploadDialog = () => {
    setUploadFile(null);
    setUploadDescription('');
    setUploadLinkType('');
    setUploadLinkId('');
    setUploadLinkOptions([]);
    setUploadSelectedLink(null);
    setDragOver(false);
    setUploadOpen(true);
  };

  const handleUploadLinkTypeChange = (type: string) => {
    setUploadLinkType(type);
    setUploadSelectedLink(null);
    setUploadLinkId('');
    fetchLinkOptions(type, setUploadLinkOptions);
  };

  const handleFileSelect = (file: File | null) => {
    setUploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0] || null;
    handleFileSelect(file);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);
    if (uploadDescription.trim()) formData.append('description', uploadDescription.trim());
    if (uploadLinkType && uploadSelectedLink) {
      formData.append('linked_type', uploadLinkType);
      formData.append('linked_id', uploadSelectedLink.id);
    }
    try {
      await api.post('/documents', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadOpen(false);
      fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.message || t('documents.errorUpload'));
    }
  };

  /* ======================== link handlers ======================== */

  const openLinkDialog = (docId: string) => {
    setLinkDocId(docId);
    setLinkType('');
    setLinkOptions([]);
    setLinkSelected(null);
    setLinkOpen(true);
  };

  const handleLinkTypeChange = (type: string) => {
    setLinkType(type);
    setLinkSelected(null);
    fetchLinkOptions(type, setLinkOptions);
  };

  const handleLink = async () => {
    if (!linkSelected || !linkType) return;
    try {
      await api.post(`/documents/${linkDocId}/link`, {
        linked_type: linkType,
        linked_id: linkSelected.id,
      });
      setLinkOpen(false);
      fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.message || t('documents.errorLink'));
    }
  };

  /* ======================== download / delete ======================== */

  const handleDownload = (doc: Document) => {
    const url = doc.file_url || `/api/v1/documents/${doc.id}/download`;
    window.open(url, '_blank');
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(t('documents.deleteConfirm', { name: doc.filename }))) return;
    try {
      await api.delete(`/documents/${doc.id}`);
      fetchDocuments();
    } catch (err: any) {
      alert(err.response?.data?.message || t('documents.errorDelete'));
    }
  };

  /* ======================== helpers ======================== */

  const formatLinkedLabel = (doc: Document) => {
    if (!doc.linked_type) return '—';
    const typeLabel = LINK_TYPES.find(lt => lt.value === doc.linked_type)?.label || doc.linked_type;
    return doc.linked_label ? `${typeLabel}: ${doc.linked_label}` : typeLabel;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString(i18n.language);
    } catch {
      return dateStr;
    }
  };

  /* ======================== render ======================== */

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('documents.title')}</Typography>
        <Button variant="contained" startIcon={<UploadIcon />} onClick={openUploadDialog} sx={{ bgcolor: '#2e7d32' }}>
          {t('documents.uploadDocument')}
        </Button>
      </Box>

      {/* Documents Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('documents.filename')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.description')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('documents.linkedTo')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('documents.uploadedBy')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.date')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documents.map(doc => (
              <TableRow key={doc.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {doc.filename}
                  </Typography>
                </TableCell>
                <TableCell>{doc.description || '—'}</TableCell>
                <TableCell>
                  {doc.linked_type ? (
                    <Chip
                      label={formatLinkedLabel(doc)}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, fontSize: '11px' }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">—</Typography>
                  )}
                </TableCell>
                <TableCell>{doc.uploaded_by || '—'}</TableCell>
                <TableCell>{formatDate(doc.created_at)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title={t('documents.download')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => handleDownload(doc)}>
                      <DownloadIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('documents.link')}>
                    <IconButton size="small" sx={{ p: 0.3 }} onClick={() => openLinkDialog(doc.id)}>
                      <LinkIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('common.delete')}>
                    <IconButton size="small" sx={{ p: 0.3 }} color="error" onClick={() => handleDelete(doc)}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {documents.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('documents.noDocuments')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('documents.uploadDocument')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {/* Drag & Drop area */}
            <Box
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: dragOver ? '2px dashed #2e7d32' : '2px dashed #ccc',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: dragOver ? '#f0f7f0' : '#fafafa',
                transition: 'all 0.2s',
                '&:hover': { borderColor: '#2e7d32', bgcolor: '#f0f7f0' },
              }}
            >
              <UploadIcon sx={{ fontSize: 40, color: dragOver ? '#2e7d32' : '#999', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {uploadFile
                  ? uploadFile.name
                  : t('documents.dragDrop')
                }
              </Typography>
              {uploadFile && (
                <Typography variant="caption" color="text.secondary">
                  {(uploadFile.size / 1024).toFixed(1)} KB
                </Typography>
              )}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                onChange={e => handleFileSelect(e.target.files?.[0] || null)}
              />
            </Box>

            <TextField
              label={t('common.description')}
              value={uploadDescription}
              size="small"
              fullWidth
              multiline
              rows={2}
              onChange={e => setUploadDescription(e.target.value)}
            />

            <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 1 }}>
              {t('documents.linkOptional')}
            </Typography>

            <TextField
              select
              label={t('documents.linkToType')}
              value={uploadLinkType}
              size="small"
              onChange={e => handleUploadLinkTypeChange(e.target.value)}
            >
              <MenuItem value="">{t('documents.none')}</MenuItem>
              {LINK_TYPES.map(lt => (
                <MenuItem key={lt.value} value={lt.value}>{lt.label}</MenuItem>
              ))}
            </TextField>

            {uploadLinkType && (
              <Autocomplete
                options={uploadLinkOptions}
                value={uploadSelectedLink}
                getOptionLabel={option => option.label}
                onChange={(_, val) => {
                  setUploadSelectedLink(val);
                  setUploadLinkId(val?.id || '');
                }}
                renderInput={params => (
                  <TextField
                    {...params}
                    label={LINK_TYPES.find(lt => lt.value === uploadLinkType)?.label || t('documents.select')}
                    size="small"
                  />
                )}
                size="small"
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={!uploadFile}
            startIcon={<UploadIcon />}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {t('documents.upload')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Link Dialog */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('documents.linkDocument')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              select
              label={t('documents.linkToType')}
              value={linkType}
              size="small"
              onChange={e => handleLinkTypeChange(e.target.value)}
            >
              {LINK_TYPES.map(lt => (
                <MenuItem key={lt.value} value={lt.value}>{lt.label}</MenuItem>
              ))}
            </TextField>

            {linkType && (
              <Autocomplete
                options={linkOptions}
                value={linkSelected}
                getOptionLabel={option => option.label}
                onChange={(_, val) => setLinkSelected(val)}
                renderInput={params => (
                  <TextField
                    {...params}
                    label={LINK_TYPES.find(lt => lt.value === linkType)?.label || t('documents.select')}
                    size="small"
                  />
                )}
                size="small"
                isOptionEqualToValue={(opt, val) => opt.id === val.id}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleLink}
            disabled={!linkSelected}
            startIcon={<LinkIcon />}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {t('documents.link')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Documents;
