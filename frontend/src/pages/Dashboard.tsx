import React, { useEffect, useState } from 'react';
import { formatDate } from '../utils/dateFormat';
import { Box, Card, CardContent, Typography, Grid, TextField, Button } from '@mui/material';
import {
  AccountBalance as AssetsIcon,
  TrendingUp as RevenueIcon,
  TrendingDown as ExpenseIcon,
  AccountBalanceWallet as NetIcon,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface SummaryCard {
  label: string;
  value: string;
  color: string;
  icon: React.ReactNode;
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [pnl, setPnl] = useState<any>(null);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchData = (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';

    api.get(`/reports/profit-and-loss${qs}`).then(res => {
      if (res.data.success) setPnl(res.data.data);
    }).catch(() => {});

    const jeParams = new URLSearchParams();
    jeParams.set('is_posted', 'true');
    if (from) jeParams.set('date_from', from);
    if (to) jeParams.set('date_to', to);
    api.get(`/journal-entries?${jeParams.toString()}`).then(res => {
      if (res.data.success) setRecentEntries(res.data.data.journal_entries.slice(0, 10));
    }).catch(() => {});
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleApply = () => {
    fetchData(dateFrom, dateTo);
  };

  const revenue = pnl ? parseFloat(pnl.revenue?.total || '0') : 0;
  const operatingExpenses = pnl ? parseFloat(pnl.operating_expenses?.total || '0') : 0;
  const netIncome = pnl ? parseFloat(pnl.net_income || '0') : 0;

  const cards: SummaryCard[] = [
    { label: t('dashboard.marginRevenue'), value: `${revenue.toLocaleString(i18n.language)} MAD`, color: '#2e7d32', icon: <RevenueIcon /> },
    { label: t('dashboard.operatingExpenses'), value: `${operatingExpenses.toLocaleString(i18n.language)} MAD`, color: '#d32f2f', icon: <ExpenseIcon /> },
    { label: t('dashboard.netIncome'), value: `${netIncome.toLocaleString(i18n.language)} MAD`, color: netIncome >= 0 ? '#1976d2' : '#d32f2f', icon: <NetIcon /> },
  ];

  const chartData = [
    { name: t('dashboard.marginRevenue'), amount: revenue },
    { name: t('dashboard.operatingExpenses'), amount: operatingExpenses },
    { name: t('dashboard.netIncome'), amount: netIncome },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('dashboard.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
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
          <Button variant="outlined" size="small" onClick={handleApply}>{t('common.apply')}</Button>
        </Box>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {cards.map((card) => (
          <Grid item xs={12} sm={4} key={card.label}>
            <Card
              sx={{ cursor: 'pointer', '&:hover': { boxShadow: 4 } }}
              onClick={() => navigate('/reports')}
            >
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ color: card.color, display: 'flex' }}>{card.icon}</Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: card.color }}>{card.value}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 600 }}>{t('dashboard.financialOverview')}</Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="amount" fill="#2e7d32" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, cursor: 'pointer' }}
                onClick={() => navigate('/journal-entries')}
              >
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('dashboard.recentJournalEntries')}</Typography>
                <Typography variant="caption" color="primary">{t('dashboard.viewAll')}</Typography>
              </Box>
              {recentEntries.length === 0 ? (
                <Typography variant="body2" color="text.secondary">{t('dashboard.noPostedEntries')}</Typography>
              ) : (
                recentEntries.map((entry) => (
                  <Box
                    key={entry.id}
                    sx={{
                      display: 'flex', justifyContent: 'space-between', py: 0.75,
                      borderBottom: '1px solid #eee', cursor: 'pointer',
                      '&:hover': { bgcolor: '#f5f5f5' },
                    }}
                    onClick={() => navigate('/journal-entries')}
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{entry.entry_number}</Typography>
                      <Typography variant="caption" color="text.secondary">{entry.description || formatDate(entry.date)}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{parseFloat(entry.total_debit).toLocaleString(i18n.language)} MAD</Typography>
                  </Box>
                ))
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
