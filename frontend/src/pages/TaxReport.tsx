import React, { useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, TextField, Card, CardContent, Divider,
} from '@mui/material';
import {
  Download as DownloadIcon, Assessment as ReportIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface TaxReportLine {
  tax_code: string;
  tax_name: string;
  rate: string;
  taxable_amount: string;
  tax_amount: string;
}

interface TaxReportData {
  date_from: string;
  date_to: string;
  sales: TaxReportLine[];
  purchases: TaxReportLine[];
  total_sales_tax: string;
  total_purchase_tax: string;
  tax_payable: string;
}

const exportToCSV = (filename: string, headers: string[], rows: string[][]) => {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const TaxReport: React.FC = () => {
  const { t, i18n } = useTranslation();

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [report, setReport] = useState<TaxReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async () => {
    if (!dateFrom || !dateTo) {
      alert(t('taxReport.errorDateRange'));
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('date_from', dateFrom);
      params.set('date_to', dateTo);
      const res = await api.get(`/reports/tax?${params.toString()}`);
      if (res.data.success) {
        const d = res.data.data;
        // Map backend shape to frontend shape
        const mapRow = (row: any): TaxReportLine => {
          const rate = parseFloat(row.rate || '0');
          const taxAmount = parseFloat(row.amount || '0');
          const taxableAmount = rate > 0 ? taxAmount / (rate / 100) : 0;
          return {
            tax_code: row.tax_code,
            tax_name: row.tax_name,
            rate: row.rate,
            taxable_amount: taxableAmount.toFixed(2),
            tax_amount: taxAmount.toFixed(2),
          };
        };
        setReport({
          date_from: d.period?.date_from || dateFrom,
          date_to: d.period?.date_to || dateTo,
          sales: (d.tax_collected?.rows || d.sales || []).map(mapRow),
          purchases: (d.tax_paid?.rows || d.purchases || []).map(mapRow),
          total_sales_tax: d.tax_collected?.total || d.total_sales_tax || '0',
          total_purchase_tax: d.tax_paid?.total || d.total_purchase_tax || '0',
          tax_payable: d.net_tax_payable || d.tax_payable || '0',
        });
      }
    } catch (err: any) {
      alert(err.response?.data?.message || t('taxReport.errorFetch'));
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!report) return;
    const rows: string[][] = [];
    rows.push([`--- ${t('taxReport.salesTax')} ---`, '', '', '', '']);
    report.sales.forEach(line => {
      rows.push([line.tax_code, line.tax_name, line.rate + '%', line.taxable_amount, line.tax_amount]);
    });
    rows.push([t('taxReport.totalSalesTax'), '', '', '', report.total_sales_tax]);
    rows.push(['', '', '', '', '']);
    rows.push([`--- ${t('taxReport.purchaseTax')} ---`, '', '', '', '']);
    report.purchases.forEach(line => {
      rows.push([line.tax_code, line.tax_name, line.rate + '%', line.taxable_amount, line.tax_amount]);
    });
    rows.push([t('taxReport.totalPurchaseTax'), '', '', '', report.total_purchase_tax]);
    rows.push(['', '', '', '', '']);
    rows.push([t('taxReport.taxPayable'), '', '', '', report.tax_payable]);

    exportToCSV(
      `momsrapport_${dateFrom}_${dateTo}.csv`,
      [t('taxReport.taxCode'), t('common.name'), t('taxReport.rate'), t('taxReport.taxableAmount'), t('taxReport.taxAmount')],
      rows,
    );
  };

  const renderTaxTable = (title: string, lines: TaxReportLine[], total: string, totalLabel: string, color: string, bgColor: string) => (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color, mb: 1 }}>{title}</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600 }}>{t('taxReport.taxCode')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('common.name')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('taxReport.rate')} (%)</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('taxReport.taxableAmount')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('taxReport.taxAmount')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {lines.map((line, i) => (
                <TableRow key={i} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {line.tax_code}
                    </Typography>
                  </TableCell>
                  <TableCell>{line.tax_name}</TableCell>
                  <TableCell align="right">{parseFloat(line.rate).toFixed(2)}%</TableCell>
                  <TableCell align="right">
                    {parseFloat(line.taxable_amount).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 500 }}>
                    {parseFloat(line.tax_amount).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">{t('taxReport.noEntries')}</Typography>
                  </TableCell>
                </TableRow>
              )}
              <TableRow sx={{ bgcolor: bgColor }}>
                <TableCell colSpan={4} sx={{ fontWeight: 700 }}>{totalLabel}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {parseFloat(total).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );

  return (
    <Box>
      {/* Header */}
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>{t('taxReport.title')}</Typography>

      {/* Filters */}
      <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label={t('common.from')} type="date" value={dateFrom} size="small"
          onChange={e => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
        />
        <TextField
          label={t('common.to')} type="date" value={dateTo} size="small"
          onChange={e => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 170 }}
        />
        <Button
          variant="contained"
          startIcon={<ReportIcon />}
          onClick={fetchReport}
          disabled={loading}
          sx={{ bgcolor: '#2e7d32' }}
        >
          {loading ? t('taxReport.generating') : t('taxReport.generate')}
        </Button>
        {report && (
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            color="secondary"
            sx={{ ml: 'auto' }}
          >
            {t('common.exportCsv')}
          </Button>
        )}
      </Paper>

      {/* Report Content */}
      {report && (
        <Box>
          {/* Sales Tax */}
          {renderTaxTable(t('taxReport.salesTax'), report.sales, report.total_sales_tax, t('taxReport.totalSalesTax'), '#2e7d32', '#e8f5e9')}

          {/* Purchase Tax */}
          {renderTaxTable(t('taxReport.purchaseTax'), report.purchases, report.total_purchase_tax, t('taxReport.totalPurchaseTax'), '#1976d2', '#e3f2fd')}

          {/* Summary */}
          <Card sx={{ border: '2px solid #1565c0' }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1565c0', mb: 1.5 }}>
                {t('taxReport.summary')}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                <Card sx={{ flex: 1, bgcolor: '#e8f5e9' }}>
                  <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{t('taxReport.totalSalesTax')}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                      {parseFloat(report.total_sales_tax).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </CardContent>
                </Card>
                <Card sx={{ flex: 1, bgcolor: '#e3f2fd' }}>
                  <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" color="text.secondary">{t('taxReport.totalPurchaseTax')}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#1976d2' }}>
                      {parseFloat(report.total_purchase_tax).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
              <Divider sx={{ mb: 1.5 }} />
              <Card sx={{ bgcolor: '#f5f5f5' }}>
                <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
                  <Typography variant="caption" color="text.secondary">{t('taxReport.taxPayable')}</Typography>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 700,
                      color: parseFloat(report.tax_payable) >= 0 ? '#d32f2f' : '#2e7d32',
                    }}
                  >
                    {parseFloat(report.tax_payable).toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>MAD</Typography>
                  </Typography>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Empty state */}
      {!report && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {t('taxReport.emptyState')}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default TaxReport;
