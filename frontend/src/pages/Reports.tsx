import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Tabs, Tab, TextField, Button, Chip, Link,
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { exportToCSV } from '../utils/csvExport';

interface ReportRow {
  account_code: string;
  account_name: string;
  account_id?: string;
  debit?: string;
  credit?: string;
  balance?: string;
  amount?: string;
}

const Reports: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Report data
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [pnl, setPnl] = useState<any>(null);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [cashFlow, setCashFlow] = useState<any>(null);
  const [generalLedger, setGeneralLedger] = useState<any>(null);
  const [agingReceivable, setAgingReceivable] = useState<any>(null);
  const [agingPayable, setAgingPayable] = useState<any>(null);

  const fetchReport = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';

    if (tab === 0) {
      api.get(`/reports/trial-balance${qs}`).then(res => {
        if (res.data.success) setTrialBalance(res.data.data);
      });
    } else if (tab === 1) {
      api.get(`/reports/profit-and-loss${qs}`).then(res => {
        if (res.data.success) setPnl(res.data.data);
      });
    } else if (tab === 2) {
      api.get(`/reports/balance-sheet${qs}`).then(res => {
        if (res.data.success) setBalanceSheet(res.data.data);
      });
    } else if (tab === 3) {
      api.get(`/reports/cash-flow${qs}`).then(res => {
        if (res.data.success) setCashFlow(res.data);
      });
    } else if (tab === 4) {
      api.get(`/reports/general-ledger${qs}`).then(res => {
        if (res.data.success) setGeneralLedger(res.data);
      });
    } else if (tab === 5) {
      api.get(`/reports/aging-receivable`).then(res => {
        if (res.data.success) setAgingReceivable(res.data);
      });
      api.get(`/reports/aging-payable`).then(res => {
        if (res.data.success) setAgingPayable(res.data);
      });
    }
  };

  useEffect(() => { fetchReport(); }, [tab]);

  const handleExportCSV = () => {
    if (tab === 0 && trialBalance) {
      exportToCSV('trial_balance.csv',
        [t('common.code'), t('common.account'), t('common.type'), t('common.debit'), t('common.credit'), t('common.balance')],
        trialBalance.rows.map((r: any) => [r.account_code, r.account_name, r.account_type, r.debit, r.credit, r.balance])
      );
    } else if (tab === 1 && pnl) {
      const rows: string[][] = [];
      rows.push([`--- ${t('reports.revenueMargin')} ---`, '', '']);
      (pnl.revenue?.rows || []).forEach((r: any) => rows.push([r.account_code, r.account_name, r.amount]));
      rows.push([`${t('reports.revenueMargin')} ${t('common.total')}`, '', pnl.revenue?.total || '0']);
      rows.push([`--- ${t('reports.operatingExpenses')} ---`, '', '']);
      (pnl.operating_expenses?.rows || []).forEach((r: any) => rows.push([r.account_code, r.account_name, r.amount]));
      rows.push([`${t('reports.operatingExpenses')} ${t('common.total')}`, '', pnl.operating_expenses?.total || '0']);
      rows.push([t('reports.netIncome'), '', pnl.net_income]);
      exportToCSV('profit_and_loss.csv', [t('common.code'), t('common.account'), 'Amount'], rows);
    } else if (tab === 2 && balanceSheet) {
      const rows: string[][] = [];
      rows.push([`--- ${t('reports.assets')} ---`, '', '']);
      (balanceSheet.assets?.rows || []).forEach((r: any) => rows.push([r.account_code, r.account_name, r.balance]));
      rows.push([`${t('reports.assets')} ${t('common.total')}`, '', balanceSheet.assets?.total || '0']);
      rows.push([`--- ${t('reports.liabilities')} ---`, '', '']);
      (balanceSheet.liabilities?.rows || []).forEach((r: any) => rows.push([r.account_code, r.account_name, r.balance]));
      rows.push([`${t('reports.liabilities')} ${t('common.total')}`, '', balanceSheet.liabilities?.total || '0']);
      rows.push([`--- ${t('reports.equity')} ---`, '', '']);
      (balanceSheet.equity?.rows || []).forEach((r: any) => rows.push([r.account_code, r.account_name, r.balance]));
      rows.push([`${t('reports.equity')} ${t('common.total')}`, '', balanceSheet.equity?.total || '0']);
      exportToCSV('balance_sheet.csv', [t('common.code'), t('common.account'), t('common.balance')], rows);
    } else if (tab === 3 && cashFlow) {
      const rows: string[][] = [];
      (cashFlow.sections || []).forEach((s: any) => {
        rows.push([`--- ${s.name} ---`, '', '']);
        (s.rows || []).forEach((r: any) => rows.push([r.account_code || '', r.description || r.account_name || '', r.amount]));
        rows.push([`${t('common.total')} ${s.name}`, '', s.total]);
      });
      rows.push([t('reports.netCashFlow'), '', cashFlow.net_cash_flow]);
      exportToCSV('cash_flow.csv', [t('common.code'), 'Description', 'Amount'], rows);
    } else if (tab === 4 && generalLedger) {
      const rows: string[][] = [];
      (generalLedger.accounts || []).forEach((a: any) => {
        rows.push([`--- ${a.account_code} ${a.account_name} ---`, '', '', '', '']);
        (a.entries || []).forEach((e: any) => rows.push([e.date, e.entry_number, e.description, e.debit, e.credit]));
        rows.push(['', '', t('common.total'), a.total_debit, a.total_credit]);
      });
      exportToCSV('general_ledger.csv', [t('reports.date'), t('reports.entry'), t('reports.description'), t('common.debit'), t('common.credit')], rows);
    } else if (tab === 5) {
      const rows: string[][] = [];
      if (agingReceivable) {
        rows.push([`--- ${t('reports.receivableAging')} ---`, '', '', '', '', '']);
        (agingReceivable.rows || []).forEach((r: any) => rows.push([r.customer_name, r.current, r.days_1_30, r.days_31_60, r.days_61_90, r.days_over_90]));
      }
      if (agingPayable) {
        rows.push([`--- ${t('reports.payableAging')} ---`, '', '', '', '', '']);
        (agingPayable.rows || []).forEach((r: any) => rows.push([r.supplier_name, r.current, r.days_1_30, r.days_31_60, r.days_61_90, r.days_over_90]));
      }
      exportToCSV('aging_analysis.csv', ['Name', t('reports.current'), t('reports.days1to30'), t('reports.days31to60'), t('reports.days61to90'), t('reports.daysOver90')], rows);
    }
  };

  const handleDrillDown = (accountId: string) => {
    navigate(`/accounts?ledger=${accountId}`);
  };

  const renderTrialBalance = () => {
    if (!trialBalance) return null;
    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.code')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.account')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.type')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.balance')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {trialBalance.rows.map((row: any, i: number) => (
              <TableRow key={i} hover>
                <TableCell sx={{ fontFamily: 'monospace' }}>
                  <Link
                    component="button"
                    variant="body2"
                    onClick={() => handleDrillDown(row.account_id)}
                    sx={{ fontFamily: 'monospace', cursor: 'pointer' }}
                  >
                    {row.account_code}
                  </Link>
                </TableCell>
                <TableCell>{row.account_name}</TableCell>
                <TableCell>
                  <Typography variant="caption">{row.account_type}</Typography>
                </TableCell>
                <TableCell align="right">{parseFloat(row.debit).toLocaleString(i18n.language)}</TableCell>
                <TableCell align="right">{parseFloat(row.credit).toLocaleString(i18n.language)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{parseFloat(row.balance).toLocaleString(i18n.language)}</TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: '#e8f5e9' }}>
              <TableCell colSpan={3} sx={{ fontWeight: 700 }}>{t('common.totals')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(trialBalance.total_debit).toLocaleString(i18n.language)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(trialBalance.total_credit).toLocaleString(i18n.language)}</TableCell>
              <TableCell align="right">
                <Chip
                  label={trialBalance.is_balanced ? t('reports.balanced') : t('reports.unbalanced')}
                  size="small"
                  color={trialBalance.is_balanced ? 'success' : 'error'}
                  sx={{ height: 20, fontSize: '11px' }}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  const renderPnLSection = (title: string, rows: any[], total: string, color: string, bgColor: string) => (
    <Card sx={{ flex: 1 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color, mb: 1 }}>{title}</Typography>
        <Table size="small">
          <TableBody>
            {rows.map((row: any, i: number) => (
              <TableRow key={i}>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.account_code}</TableCell>
                <TableCell>{row.account_name}</TableCell>
                <TableCell align="right">{parseFloat(row.amount).toLocaleString(i18n.language)}</TableCell>
              </TableRow>
            ))}
            <TableRow sx={{ bgcolor: bgColor }}>
              <TableCell colSpan={2} sx={{ fontWeight: 700 }}>{t('reports.totalLabel', { title })}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(total).toLocaleString(i18n.language)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderPnL = () => {
    if (!pnl) return null;
    const pt = pnl.pass_through;
    const clientFunds = parseFloat(pt?.client_funds_received || '0');
    const supplierCosts = parseFloat(pt?.supplier_costs_paid || '0');
    const margin = parseFloat(pt?.margin || '0');
    const netIncome = parseFloat(pnl.net_income);
    const revenueTotal = parseFloat(pnl.revenue?.total || '0');
    const opexTotal = parseFloat(pnl.operating_expenses?.total || '0');

    return (
      <Box>
        {/* Pass-through summary */}
        <Card sx={{ mb: 2, border: '1px solid #e0e0e0' }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#546e7a', mb: 1 }}>
              {t('reports.passThroughSummary')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                <Typography variant="caption" color="text.secondary">{t('reports.clientFundsReceived')}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#2e7d32' }}>
                  {clientFunds.toLocaleString(i18n.language)} <Typography component="span" variant="caption" color="text.secondary">MAD</Typography>
                </Typography>
              </Box>
              <Typography variant="h5" color="text.secondary">-</Typography>
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                <Typography variant="caption" color="text.secondary">{t('reports.supplierCostsPaid')}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#e65100' }}>
                  {supplierCosts.toLocaleString(i18n.language)} <Typography component="span" variant="caption" color="text.secondary">MAD</Typography>
                </Typography>
              </Box>
              <Typography variant="h5" color="text.secondary">=</Typography>
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                <Typography variant="caption" color="text.secondary">{t('reports.margin')}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 600, color: '#1565c0' }}>
                  {margin.toLocaleString(i18n.language)} <Typography component="span" variant="caption" color="text.secondary">MAD</Typography>
                </Typography>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Revenue (Margin) + Operating Expenses */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {renderPnLSection(t('reports.revenueMargin'), pnl.revenue?.rows || [], pnl.revenue?.total || '0', '#2e7d32', '#e8f5e9')}
          {renderPnLSection(t('reports.operatingExpenses'), pnl.operating_expenses?.rows || [], pnl.operating_expenses?.total || '0', '#d32f2f', '#ffebee')}
        </Box>

        {/* Net Income */}
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
            <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">{t('reports.marginRevenue')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                {revenueTotal.toLocaleString(i18n.language)} <Typography component="span" variant="caption" color="text.secondary">MAD</Typography>
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
            <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">{t('reports.operatingExpenses')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: '#d32f2f' }}>
                {opexTotal.toLocaleString(i18n.language)} <Typography component="span" variant="caption" color="text.secondary">MAD</Typography>
              </Typography>
            </CardContent>
          </Card>
          <Card sx={{ flex: 1, bgcolor: '#f5f5f5' }}>
            <CardContent sx={{ textAlign: 'center', py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">{t('reports.netIncome')}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: netIncome >= 0 ? '#2e7d32' : '#d32f2f' }}>
                {netIncome.toLocaleString(i18n.language)} <Typography component="span" variant="caption" color="text.secondary">MAD</Typography>
              </Typography>
            </CardContent>
          </Card>
        </Box>

        {/* TVA Section */}
        {pnl.tva && (() => {
          const tva = pnl.tva;
          const marginTtc = parseFloat(tva.margin_ttc || '0');
          const collectee = parseFloat(tva.collectee || '0');
          const dedOps = parseFloat(tva.deductible_ops || '0');
          const aPayer = parseFloat(tva.a_payer || '0');
          return (
            <Card sx={{ border: '1px solid #1565c0' }}>
              <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#1565c0', mb: 1 }}>
                  {t('reports.tvaRegime')}
                </Typography>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, border: 0, py: 0.5 }}>{t('reports.tvaCollectee')}</TableCell>
                      <TableCell align="right" sx={{ border: 0, py: 0.5, color: '#666' }}>
                        {marginTtc.toLocaleString(i18n.language)} x 20/120
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, border: 0, py: 0.5, width: 140 }}>
                        {collectee.toLocaleString(i18n.language)}
                      </TableCell>
                    </TableRow>
                    {(tva.deductible_ops_rows || []).length > 0 && (
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, border: 0, py: 0.5 }} colSpan={3}>{t('reports.tvaDeductible')}</TableCell>
                      </TableRow>
                    )}
                    {(tva.deductible_ops_rows || []).map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell sx={{ border: 0, py: 0.3, pl: 4 }}>
                          {r.account_name}
                        </TableCell>
                        <TableCell align="right" sx={{ border: 0, py: 0.3, color: '#666' }}>
                          {parseFloat(r.amount).toLocaleString(i18n.language)} x 20/120
                        </TableCell>
                        <TableCell align="right" sx={{ border: 0, py: 0.3, width: 140 }}>
                          -{(parseFloat(r.amount) * 20 / 120).toLocaleString(i18n.language, { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {dedOps > 0 && (
                      <TableRow>
                        <TableCell sx={{ border: 0, py: 0.3, pl: 4, fontWeight: 600 }}>{t('reports.totalDeductible')}</TableCell>
                        <TableCell sx={{ border: 0 }} />
                        <TableCell align="right" sx={{ border: 0, py: 0.3, fontWeight: 600, width: 140 }}>
                          -{dedOps.toLocaleString(i18n.language, { maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                      <TableCell sx={{ fontWeight: 700, py: 1 }} colSpan={2}>{t('reports.tvaPayer')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, py: 1, fontSize: '1rem', width: 140 }}>
                        {aPayer.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} MAD
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          );
        })()}
      </Box>
    );
  };

  const renderBalanceSheet = () => {
    if (!balanceSheet) return null;

    const renderSection = (title: string, data: any, color: string) => (
      <Card sx={{ flex: 1 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color, mb: 1 }}>{title}</Typography>
          <Table size="small">
            <TableBody>
              {data.rows.map((row: any, i: number) => (
                <TableRow key={i}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.account_code}</TableCell>
                  <TableCell>{row.account_name}</TableCell>
                  <TableCell align="right">{parseFloat(row.balance).toLocaleString(i18n.language)}</TableCell>
                </TableRow>
              ))}
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell colSpan={2} sx={{ fontWeight: 700 }}>{t('reports.totalLabel', { title })}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(data.total).toLocaleString(i18n.language)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    );

    return (
      <Box>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          {renderSection(t('reports.assets'), balanceSheet.assets, '#1976d2')}
          <Box sx={{ flex: 1 }}>
            {renderSection(t('reports.liabilities'), balanceSheet.liabilities, '#e65100')}
            <Box sx={{ mt: 2 }}>
              {renderSection(t('reports.equity'), balanceSheet.equity, '#7b1fa2')}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
          <Chip
            label={balanceSheet.is_balanced ? t('reports.balanceSheetBalanced') : t('reports.balanceSheetNotBalanced')}
            color={balanceSheet.is_balanced ? 'success' : 'error'}
          />
        </Box>
      </Box>
    );
  };

  const renderCashFlow = () => {
    if (!cashFlow) return null;
    const sections = cashFlow.sections || [];
    return (
      <Box>
        {sections.map((section: any, idx: number) => (
          <Card key={idx} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{section.name}</Typography>
              <Table size="small">
                <TableBody>
                  {(section.rows || []).map((row: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>{row.account_code}</TableCell>
                      <TableCell>{row.description || row.account_name}</TableCell>
                      <TableCell align="right">{parseFloat(row.amount).toLocaleString(i18n.language)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 700 }}>{t('reports.totalLabel', { title: section.name })}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(section.total).toLocaleString(i18n.language)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
        <Card sx={{ bgcolor: '#e8f5e9' }}>
          <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary">{t('reports.netCashFlow')}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: parseFloat(cashFlow.net_cash_flow || '0') >= 0 ? '#2e7d32' : '#d32f2f' }}>
              {parseFloat(cashFlow.net_cash_flow || '0').toLocaleString(i18n.language)} MAD
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  };

  const renderGeneralLedger = () => {
    if (!generalLedger) return null;
    const accounts = generalLedger.accounts || [];
    return (
      <Box>
        {accounts.map((acct: any, idx: number) => (
          <Card key={idx} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
                <Link component="button" onClick={() => handleDrillDown(acct.account_id)} sx={{ fontWeight: 600, cursor: 'pointer' }}>
                  {acct.account_code}
                </Link>
                {' '}{acct.account_name}
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>{t('reports.date')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('reports.entry')}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{t('reports.description')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.debit')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.credit')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.balance')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(acct.entries || []).map((e: any, i: number) => (
                      <TableRow key={i} hover>
                        <TableCell>{e.date}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '12px' }}>{e.entry_number}</TableCell>
                        <TableCell>{e.description}</TableCell>
                        <TableCell align="right">{parseFloat(e.debit || '0') > 0 ? parseFloat(e.debit).toLocaleString(i18n.language) : ''}</TableCell>
                        <TableCell align="right">{parseFloat(e.credit || '0') > 0 ? parseFloat(e.credit).toLocaleString(i18n.language) : ''}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{parseFloat(e.running_balance || '0').toLocaleString(i18n.language)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                      <TableCell colSpan={3} sx={{ fontWeight: 700 }}>{t('common.total')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(acct.total_debit || '0').toLocaleString(i18n.language)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(acct.total_credit || '0').toLocaleString(i18n.language)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(acct.balance || '0').toLocaleString(i18n.language)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
            {t('reports.noEntriesForPeriod')}
          </Typography>
        )}
      </Box>
    );
  };

  const renderAgingTable = (title: string, data: any, nameField: string, color: string) => {
    if (!data) return null;
    const rows = data.rows || [];
    const totals = data.totals || {};
    return (
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, color, mb: 1 }}>{title}</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{nameField === 'customer_name' ? t('reports.customer') : t('reports.supplier')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reports.current')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reports.days1to30')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reports.days31to60')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reports.days61to90')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('reports.daysOver90')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.total')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row: any, i: number) => (
                  <TableRow key={i} hover>
                    <TableCell>{row[nameField]}</TableCell>
                    <TableCell align="right">{parseFloat(row.current || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right">{parseFloat(row.days_1_30 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right">{parseFloat(row.days_31_60 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right">{parseFloat(row.days_61_90 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right" sx={{ color: parseFloat(row.days_over_90 || '0') > 0 ? '#d32f2f' : 'inherit' }}>
                      {parseFloat(row.days_over_90 || '0').toLocaleString(i18n.language)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{parseFloat(row.total || '0').toLocaleString(i18n.language)}</TableCell>
                  </TableRow>
                ))}
                {rows.length > 0 && (
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 700 }}>{t('common.total')}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(totals.current || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(totals.days_1_30 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(totals.days_31_60 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(totals.days_61_90 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(totals.days_over_90 || '0').toLocaleString(i18n.language)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{parseFloat(totals.total || '0').toLocaleString(i18n.language)}</TableCell>
                  </TableRow>
                )}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                      {t('reports.noOutstanding')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    );
  };

  const renderAging = () => (
    <Box>
      {renderAgingTable(t('reports.receivableAging'), agingReceivable, 'customer_name', '#1976d2')}
      {renderAgingTable(t('reports.payableAging'), agingPayable, 'supplier_name', '#e65100')}
    </Box>
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>{t('reports.title')}</Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label={t('reports.trialBalance')} />
          <Tab label={t('reports.profitLoss')} />
          <Tab label={t('reports.balanceSheet')} />
          <Tab label={t('reports.cashFlow')} />
          <Tab label={t('reports.generalLedger')} />
          <Tab label={t('reports.agingAnalysis')} />
        </Tabs>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField
            label={t('common.from')} type="date" value={dateFrom} size="small"
            onChange={e => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
          />
          <TextField
            label={t('common.to')} type="date" value={dateTo} size="small"
            onChange={e => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ width: 150 }}
          />
          <Button variant="outlined" onClick={fetchReport} size="small">
            {t('common.apply')}
          </Button>
          <Button
            variant="outlined"
            onClick={handleExportCSV}
            size="small"
            startIcon={<DownloadIcon />}
            color="secondary"
          >
            {t('common.exportCsv')}
          </Button>
        </Box>
      </Box>

      {tab === 0 && renderTrialBalance()}
      {tab === 1 && renderPnL()}
      {tab === 2 && renderBalanceSheet()}
      {tab === 3 && renderCashFlow()}
      {tab === 4 && renderGeneralLedger()}
      {tab === 5 && renderAging()}
    </Box>
  );
};

export default Reports;
