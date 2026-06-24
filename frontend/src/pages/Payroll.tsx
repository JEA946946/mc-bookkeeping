import React, { useEffect, useState } from 'react';
import { formatDate } from '../utils/dateFormat';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Chip, Tabs, Tab, MenuItem, Alert, CircularProgress,
  Autocomplete, Checkbox,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  CheckCircle as ApproveIcon, Print as PrintIcon,
  Refresh as RefreshIcon, People as PeopleIcon, AutoAwesome as SeedIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

// ─── Interfaces ────────────────────────────────────────────────────────────

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Employee {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  cnss_number: string;
  cin: string;
  hire_date: string;
  termination_date: string | null;
  gross_salary: string;
  net_salary: string;
  salary_account_id: string | null;
  salary_account_code: string | null;
  salary_account_name: string | null;
  bank_account_number: string;
  annual_leave_days: string;
  is_active: boolean;
  notes: string;
}

interface PayrollLine {
  id: string;
  employee_id: string;
  employee_number: string;
  employee_name: string;
  gross_salary: string;
  cnss_employee: string;
  cnss_employer: string;
  ir_amount: string;
  net_salary: string;
}

interface PayrollRun {
  id: string;
  year: number;
  month: number;
  run_date: string;
  status: string;
  total_gross: string;
  total_cnss_employee: string;
  total_cnss_employer: string;
  total_ir: string;
  total_net: string;
  journal_entry_id: string | null;
  notes: string;
  created_by: string;
  line_count: number;
  lines?: PayrollLine[];
}

const MONTHS = [
  'Januar', 'Februar', 'Marts', 'April', 'Maj', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'December',
];

const EMPTY_EMPLOYEE = {
  first_name: '',
  last_name: '',
  employee_number: '',
  cnss_number: '',
  cin: '',
  hire_date: '',
  termination_date: '',
  gross_salary: '',
  net_salary: '',
  salary_account_id: '',
  bank_account_number: '',
  annual_leave_days: '18',
  is_active: true,
  notes: '',
};

const compact = { '& td, & th': { fontSize: '11px', px: 1, py: 0.4 } };

// ─── Component ─────────────────────────────────────────────────────────────

const Payroll: React.FC = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Employees
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empLoading, setEmpLoading] = useState(false);
  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [empForm, setEmpForm] = useState(EMPTY_EMPLOYEE);
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);
  const [salaryAccounts, setSalaryAccounts] = useState<Account[]>([]);

  // Payroll Runs
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [newRunYear, setNewRunYear] = useState(new Date().getFullYear());
  const [newRunMonth, setNewRunMonth] = useState(new Date().getMonth() + 1);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteRunId, setDeleteRunId] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingLineField, setEditingLineField] = useState<'gross' | 'net'>('gross');
  const [editGross, setEditGross] = useState<string>('');
  const [editNet, setEditNet] = useState<string>('');
  const [savingLine, setSavingLine] = useState(false);
  const [excludedLines, setExcludedLines] = useState<Set<string>>(new Set());
  const [removingLines, setRemovingLines] = useState(false);

  // Payslip
  const [psEmployee, setPsEmployee] = useState<string>('');
  const [psRun, setPsRun] = useState<string>('');

  // Vacation / leave
  const [vacYear, setVacYear] = useState(new Date().getFullYear());
  const [leaveOverview, setLeaveOverview] = useState<any[]>([]);
  const [leaveEntries, setLeaveEntries] = useState<any[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: '', leave_type: 'annual', start_date: '', end_date: '', days: '', note: '',
  });

  // Public holidays (double pay)
  const [holYear, setHolYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holLoading, setHolLoading] = useState(false);
  const [dayDivisor, setDayDivisor] = useState('26');
  const [holDialogOpen, setHolDialogOpen] = useState(false);
  const [editingHolId, setEditingHolId] = useState<string | null>(null);
  const [holForm, setHolForm] = useState({ date: '', name: '' });
  const [workersDialogOpen, setWorkersDialogOpen] = useState(false);
  const [workersHoliday, setWorkersHoliday] = useState<any | null>(null);
  const [workersSel, setWorkersSel] = useState<Set<string>>(new Set());

  // ─── Fetch data ────────────────────────────────────────────────────

  const fetchEmployees = async () => {
    setEmpLoading(true);
    try {
      const res = await api.get('/payroll/employees');
      setEmployees(res.data.results || []);
    } catch { /* ignore */ }
    setEmpLoading(false);
  };

  const fetchSalaryAccounts = async () => {
    try {
      const res = await api.get('/accounts');
      const all = res.data?.data?.accounts || res.data?.results || [];
      const accts = all.filter((a: Account) => a.code.startsWith('5722'));
      setSalaryAccounts(accts);
    } catch { /* ignore */ }
  };

  const fetchRuns = async () => {
    setRunsLoading(true);
    try {
      const res = await api.get('/payroll/runs');
      setRuns(res.data.results || []);
    } catch { /* ignore */ }
    setRunsLoading(false);
  };

  const fetchRunDetail = async (id: string) => {
    try {
      const res = await api.get(`/payroll/runs/${id}`);
      setSelectedRun(res.data);
    } catch { /* ignore */ }
  };

  const fetchLeave = async (year: number) => {
    setLeaveLoading(true);
    try {
      const [ov, en] = await Promise.all([
        api.get(`/payroll/leave/overview?year=${year}`),
        api.get(`/payroll/leave?year=${year}`),
      ]);
      setLeaveOverview(ov.data.results || []);
      setLeaveEntries(en.data.results || []);
    } catch { /* ignore */ }
    setLeaveLoading(false);
  };

  useEffect(() => {
    fetchEmployees();
    fetchSalaryAccounts();
    fetchRuns();
  }, []);

  useEffect(() => {
    fetchLeave(vacYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacYear]);

  const fetchHolidays = async (year: number) => {
    setHolLoading(true);
    try {
      const res = await api.get(`/payroll/holidays?year=${year}`);
      setHolidays(res.data.results || []);
    } catch { /* ignore */ }
    setHolLoading(false);
  };

  useEffect(() => {
    fetchHolidays(holYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holYear]);

  // ─── Employee handlers ─────────────────────────────────────────────

  const openNewEmployee = () => {
    setEditingEmpId(null);
    setEmpForm({
      ...EMPTY_EMPLOYEE,
      salary_account_id: salaryAccounts.length > 0 ? salaryAccounts[0].id : '',
    });
    setEmpDialogOpen(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmpId(emp.id);
    setEmpForm({
      first_name: emp.first_name,
      last_name: emp.last_name,
      employee_number: emp.employee_number,
      cnss_number: emp.cnss_number,
      cin: emp.cin,
      hire_date: emp.hire_date || '',
      termination_date: emp.termination_date || '',
      gross_salary: emp.gross_salary,
      net_salary: emp.net_salary || '',
      salary_account_id: emp.salary_account_id || '',
      bank_account_number: emp.bank_account_number,
      annual_leave_days: emp.annual_leave_days || '18',
      is_active: emp.is_active,
      notes: emp.notes,
    });
    setEmpDialogOpen(true);
  };

  const saveEmployee = async () => {
    try {
      const payload: any = {
        ...empForm,
        termination_date: empForm.termination_date || null,
      };
      // If net_salary is provided, remove gross_salary from payload so backend uses net calculation
      if (payload.net_salary && payload.net_salary.trim()) {
        delete payload.gross_salary;
      } else {
        delete payload.net_salary;
      }
      if (editingEmpId) {
        await api.put(`/payroll/employees/${editingEmpId}`, payload);
      } else {
        await api.post('/payroll/employees', payload);
      }
      setEmpDialogOpen(false);
      setMsg({ type: 'success', text: t('payroll.employeeSaved') });
      fetchEmployees();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!window.confirm(t('payroll.deleteConfirm'))) return;
    try {
      await api.delete(`/payroll/employees/${id}`);
      setMsg({ type: 'success', text: t('payroll.employeeDeleted') });
      fetchEmployees();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  // ─── Leave / vacation handlers ─────────────────────────────────────

  const businessDays = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const s = new Date(start); const e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    let count = 0;
    const d = new Date(s);
    while (d <= e) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  };

  const openNewLeave = () => {
    setEditingLeaveId(null);
    setLeaveForm({ employee_id: employees[0]?.id || '', leave_type: 'annual', start_date: '', end_date: '', days: '', note: '' });
    setLeaveDialogOpen(true);
  };

  const openEditLeave = (l: any) => {
    setEditingLeaveId(l.id);
    setLeaveForm({
      employee_id: l.employee_id, leave_type: l.leave_type,
      start_date: l.start_date, end_date: l.end_date, days: l.days, note: l.note || '',
    });
    setLeaveDialogOpen(true);
  };

  // Recompute days (weekdays) whenever a date changes — still manually editable after
  const setLeaveDate = (patch: Partial<typeof leaveForm>) => {
    setLeaveForm(prev => {
      const next = { ...prev, ...patch };
      next.days = String(businessDays(next.start_date, next.end_date));
      return next;
    });
  };

  const saveLeave = async () => {
    try {
      const payload = { ...leaveForm, days: parseFloat(leaveForm.days || '0') };
      if (editingLeaveId) await api.put(`/payroll/leave/${editingLeaveId}`, payload);
      else await api.post('/payroll/leave', payload);
      setLeaveDialogOpen(false);
      setMsg({ type: 'success', text: t('payroll.leaveSaved') });
      fetchLeave(vacYear);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  const deleteLeave = async (id: string) => {
    if (!window.confirm(t('payroll.deleteLeaveConfirm'))) return;
    try {
      await api.delete(`/payroll/leave/${id}`);
      setMsg({ type: 'success', text: t('payroll.leaveDeleted') });
      fetchLeave(vacYear);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  // ─── Public holiday handlers ───────────────────────────────────────

  const openNewHoliday = () => { setEditingHolId(null); setHolForm({ date: '', name: '' }); setHolDialogOpen(true); };
  const openEditHoliday = (h: any) => { setEditingHolId(h.id); setHolForm({ date: h.date, name: h.name }); setHolDialogOpen(true); };

  const saveHoliday = async () => {
    if (!holForm.date) { setMsg({ type: 'error', text: t('payroll.holidayDateRequired') }); return; }
    try {
      if (editingHolId) await api.put(`/payroll/holidays/${editingHolId}`, holForm);
      else await api.post('/payroll/holidays', holForm);
      setHolDialogOpen(false);
      fetchHolidays(holYear);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  const deleteHoliday = async (id: string) => {
    if (!window.confirm(t('payroll.deleteHolidayConfirm'))) return;
    try {
      await api.delete(`/payroll/holidays/${id}`);
      fetchHolidays(holYear);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  const seedHolidays = async () => {
    try {
      await api.post('/payroll/holidays/seed', { year: holYear });
      setMsg({ type: 'success', text: t('payroll.holidaysSeeded') });
      fetchHolidays(holYear);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  const openWorkers = (h: any) => { setWorkersHoliday(h); setWorkersSel(new Set(h.worker_ids || [])); setWorkersDialogOpen(true); };
  const toggleWorker = (id: string) => setWorkersSel(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const saveWorkers = async () => {
    if (!workersHoliday) return;
    try {
      await api.put(`/payroll/holidays/${workersHoliday.id}/workers`, { employee_ids: Array.from(workersSel) });
      setWorkersDialogOpen(false);
      fetchHolidays(holYear);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  // ─── PayrollRun handlers ───────────────────────────────────────────

  const createRun = async () => {
    setCreating(true);
    try {
      const res = await api.post('/payroll/runs', { year: newRunYear, month: newRunMonth });
      setNewRunOpen(false);
      setMsg({ type: 'success', text: t('payroll.runCreated') || 'Payroll run created' });
      fetchRuns();
      if (res.data.payroll_run) {
        setSelectedRun(res.data.payroll_run);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
    setCreating(false);
  };

  const approveRun = async () => {
    if (!selectedRun) return;
    setApproving(true);
    try {
      const res = await api.post(`/payroll/runs/${selectedRun.id}/approve`);
      setConfirmApproveOpen(false);
      setMsg({ type: 'success', text: t('payroll.approveSuccess') });
      fetchRuns();
      if (res.data.payroll_run) {
        setSelectedRun(res.data.payroll_run);
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
    setApproving(false);
  };

  const deleteRun = async () => {
    if (!deleteRunId) return;
    try {
      await api.delete(`/payroll/runs/${deleteRunId}`);
      setConfirmDeleteOpen(false);
      setDeleteRunId(null);
      if (selectedRun?.id === deleteRunId) setSelectedRun(null);
      setMsg({ type: 'success', text: 'Payroll run deleted' });
      fetchRuns();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
  };

  // ─── Line edit handler ──────────────────────────────────────────────

  const saveLineGross = async (runId: string, lineId: string, gross: string) => {
    if (!gross || isNaN(parseFloat(gross))) return;
    setSavingLine(true);
    try {
      const res = await api.put(`/payroll/runs/${runId}/lines/${lineId}`, { gross_salary: gross });
      if (res.data.payroll_run) {
        setSelectedRun(res.data.payroll_run);
        setRuns(prev => prev.map(r => r.id === runId ? { ...r, ...res.data.payroll_run, lines: undefined } : r));
      }
      setEditingLineId(null);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
    setSavingLine(false);
  };

  const saveLineNet = async (runId: string, lineId: string, net: string) => {
    if (!net || isNaN(parseFloat(net))) return;
    setSavingLine(true);
    try {
      const res = await api.put(`/payroll/runs/${runId}/lines/${lineId}`, { net_salary: net });
      if (res.data.payroll_run) {
        setSelectedRun(res.data.payroll_run);
        setRuns(prev => prev.map(r => r.id === runId ? { ...r, ...res.data.payroll_run, lines: undefined } : r));
      }
      setEditingLineId(null);
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error' });
    }
    setSavingLine(false);
  };

  const toggleExcludeLine = (lineId: string) => {
    setExcludedLines(prev => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId); else next.add(lineId);
      return next;
    });
  };

  const toggleExcludeAll = (lines: any[]) => {
    if (excludedLines.size === lines.length) {
      setExcludedLines(new Set());
    } else {
      setExcludedLines(new Set(lines.map(l => l.id)));
    }
  };

  const removeExcludedLines = async () => {
    if (!selectedRun || excludedLines.size === 0) return;
    setRemovingLines(true);
    try {
      for (const lineId of excludedLines) {
        await api.delete(`/payroll/runs/${selectedRun.id}/lines/${lineId}`);
      }
      const res = await api.get(`/payroll/runs/${selectedRun.id}`);
      setSelectedRun(res.data);
      setRuns(prev => prev.map(r => r.id === selectedRun.id ? { ...r, ...res.data, lines: undefined } : r));
      setExcludedLines(new Set());
      setMsg({ type: 'success', text: `${excludedLines.size} employee(s) removed` });
    } catch (err: any) {
      setMsg({ type: 'error', text: err.response?.data?.message || 'Error removing lines' });
    }
    setRemovingLines(false);
  };

  // ─── Payslip data ─────────────────────────────────────────────────

  const payslipLine = (() => {
    if (!psEmployee || !psRun) return null;
    const run = runs.find(r => r.id === psRun);
    if (!run) return null;
    // Need to fetch detail if not loaded
    if (!run.lines) {
      fetchRunDetail(psRun);
      return null;
    }
    return run.lines.find(l => l.employee_id === psEmployee) || null;
  })();

  const payslipRun = runs.find(r => r.id === psRun);

  // ─── Format helpers ───────────────────────────────────────────────

  const fmtNum = (v: string | number) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    if (isNaN(n)) return '0';
    const decimals = n % 1 === 0 ? 0 : 2;
    return n.toLocaleString('da-DK', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
  };

  const monthName = (m: number) => MONTHS[m - 1] || '';

  // ─── Render Employees tab ─────────────────────────────────────────

  const renderEmployees = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ fontSize: '16px' }}>{t('payroll.employees')}</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openNewEmployee}>
          {t('payroll.addEmployee')}
        </Button>
      </Box>

      {empLoading ? <CircularProgress size={24} /> : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={compact}>
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.100' }}>
                <TableCell sx={{ fontWeight: 600 }}>Nr.</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('payroll.firstName')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('payroll.lastName')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('payroll.cnssNumber')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('payroll.hireDate')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.grossSalary')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.netSalary')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{t('payroll.salaryAccount')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employees.length === 0 ? (
                <TableRow><TableCell colSpan={10} align="center" sx={{ py: 3 }}>{t('payroll.noEmployees')}</TableCell></TableRow>
              ) : employees.map(emp => (
                <TableRow key={emp.id} hover>
                  <TableCell>{emp.employee_number}</TableCell>
                  <TableCell>{emp.first_name}</TableCell>
                  <TableCell>{emp.last_name}</TableCell>
                  <TableCell>{emp.cnss_number || '—'}</TableCell>
                  <TableCell>{formatDate(emp.hire_date)}</TableCell>
                  <TableCell align="right">{fmtNum(emp.gross_salary)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(emp.net_salary)}</TableCell>
                  <TableCell>{emp.salary_account_code} {emp.salary_account_name}</TableCell>
                  <TableCell>
                    <Chip
                      label={emp.is_active ? t('payroll.active') || 'Active' : t('payroll.inactive') || 'Inactive'}
                      size="small"
                      color={emp.is_active ? 'success' : 'default'}
                      sx={{ fontSize: '10px', height: 20 }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" onClick={() => openEditEmployee(emp)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => deleteEmployee(emp.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Employee Dialog */}
      <Dialog open={empDialogOpen} onClose={() => setEmpDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontSize: '14px' }}>
          {editingEmpId ? t('payroll.editEmployee') : t('payroll.addEmployee')}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('payroll.firstName')} fullWidth size="small"
              value={empForm.first_name} onChange={e => setEmpForm({ ...empForm, first_name: e.target.value })}
            />
            <TextField
              label={t('payroll.lastName')} fullWidth size="small"
              value={empForm.last_name} onChange={e => setEmpForm({ ...empForm, last_name: e.target.value })}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('payroll.employeeNumber')} fullWidth size="small"
              value={empForm.employee_number} onChange={e => setEmpForm({ ...empForm, employee_number: e.target.value })}
              helperText="Auto-generated if empty"
            />
            <TextField
              label={t('payroll.cnssNumber')} fullWidth size="small"
              value={empForm.cnss_number} onChange={e => setEmpForm({ ...empForm, cnss_number: e.target.value })}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('payroll.cin')} fullWidth size="small"
              value={empForm.cin} onChange={e => setEmpForm({ ...empForm, cin: e.target.value })}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <TextField
              label={t('payroll.grossSalary')} fullWidth size="small" type="number"
              value={empForm.gross_salary}
              onChange={e => setEmpForm({ ...empForm, gross_salary: e.target.value, net_salary: '' })}
              helperText={t('payroll.grossSalaryHelper') || 'Salary before deductions'}
              InputProps={{ sx: { fontWeight: empForm.gross_salary && !empForm.net_salary ? 700 : 400 } }}
            />
            <Typography sx={{ mt: 1.2, color: 'text.secondary', fontSize: '14px' }}>eller</Typography>
            <TextField
              label={t('payroll.netSalary')} fullWidth size="small" type="number"
              value={empForm.net_salary}
              onChange={e => setEmpForm({ ...empForm, net_salary: e.target.value, gross_salary: '' })}
              helperText={t('payroll.netSalaryHelper') || 'Desired take-home pay (auto-calculates gross)'}
              InputProps={{ sx: { fontWeight: empForm.net_salary && !empForm.gross_salary ? 700 : 400 } }}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label={t('payroll.hireDate')} fullWidth size="small" type="date"
              value={empForm.hire_date} onChange={e => setEmpForm({ ...empForm, hire_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label={t('payroll.terminationDate')} fullWidth size="small" type="date"
              value={empForm.termination_date} onChange={e => setEmpForm({ ...empForm, termination_date: e.target.value })}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <TextField
            label={t('payroll.salaryAccount')} select fullWidth size="small" required
            value={empForm.salary_account_id}
            onChange={e => setEmpForm({ ...empForm, salary_account_id: e.target.value })}
            error={!empForm.salary_account_id}
          >
            {salaryAccounts.map(a => (
              <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('payroll.bankAccountNumber')} fullWidth size="small"
            value={empForm.bank_account_number} onChange={e => setEmpForm({ ...empForm, bank_account_number: e.target.value })}
          />
          <TextField
            label={t('payroll.annualLeaveDays')} fullWidth size="small" type="number"
            value={empForm.annual_leave_days}
            onChange={e => setEmpForm({ ...empForm, annual_leave_days: e.target.value })}
            inputProps={{ min: 0, step: '0.5' }}
          />
          <TextField
            label={t('payroll.notes') || 'Notes'} fullWidth size="small" multiline rows={2}
            value={empForm.notes} onChange={e => setEmpForm({ ...empForm, notes: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmpDialogOpen(false)}>{t('common.cancel') || 'Cancel'}</Button>
          <Button variant="contained" onClick={saveEmployee} disabled={!empForm.salary_account_id}>{t('common.save') || 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  // ─── Render Payroll Runs tab ───────────────────────────────────────

  const renderRuns = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ fontSize: '16px' }}>{t('payroll.payrollRuns')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" startIcon={<RefreshIcon />} onClick={fetchRuns}>
            {t('common.refresh') || 'Refresh'}
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setNewRunOpen(true)}>
            {t('payroll.newRun')}
          </Button>
        </Box>
      </Box>

      {runsLoading ? <CircularProgress size={24} /> : (
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Runs list */}
          <TableContainer component={Paper} variant="outlined" sx={{ flex: '0 0 45%' }}>
            <Table size="small" sx={compact}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell sx={{ fontWeight: 600 }}>{t('payroll.month')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{t('payroll.runDate')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.totalGross')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.totalNet')}</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="center"></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.length === 0 ? (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 3 }}>{t('payroll.noRuns')}</TableCell></TableRow>
                ) : runs.map(run => (
                  <TableRow
                    key={run.id} hover
                    sx={{
                      cursor: 'pointer',
                      bgcolor: selectedRun?.id === run.id ? 'action.selected' : undefined,
                    }}
                    onClick={() => fetchRunDetail(run.id)}
                  >
                    <TableCell>{monthName(run.month)} {run.year}</TableCell>
                    <TableCell>{formatDate(run.run_date)}</TableCell>
                    <TableCell>
                      <Chip
                        label={run.status === 'approved' ? t('payroll.approved') : t('payroll.draft')}
                        size="small"
                        color={run.status === 'approved' ? 'success' : 'default'}
                        sx={{ fontSize: '10px', height: 20 }}
                      />
                    </TableCell>
                    <TableCell align="right">{fmtNum(run.total_gross)}</TableCell>
                    <TableCell align="right">{fmtNum(run.total_net)}</TableCell>
                    <TableCell align="center">
                      {run.status === 'draft' && (
                        <IconButton size="small" onClick={(e) => {
                          e.stopPropagation();
                          setDeleteRunId(run.id);
                          setConfirmDeleteOpen(true);
                        }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* Run detail */}
          <Box sx={{ flex: 1 }}>
            {!selectedRun ? (
              <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                {t('payroll.selectRun') || 'Select a payroll run to see details'}
              </Paper>
            ) : (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '14px' }}>
                    {monthName(selectedRun.month)} {selectedRun.year}
                    <Chip
                      label={selectedRun.status === 'approved' ? t('payroll.approved') : t('payroll.draft')}
                      size="small"
                      color={selectedRun.status === 'approved' ? 'success' : 'default'}
                      sx={{ ml: 1, fontSize: '10px', height: 20 }}
                    />
                  </Typography>
                  {selectedRun.status === 'draft' && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        variant="contained" color="success" size="small"
                        startIcon={<ApproveIcon />}
                        onClick={() => setConfirmApproveOpen(true)}
                      >
                        {t('payroll.approve')}
                      </Button>
                    </Box>
                  )}
                </Box>

                {/* Info bar for draft */}
                {selectedRun.status === 'draft' && (
                  <Alert
                    severity={excludedLines.size > 0 ? 'warning' : 'info'}
                    sx={{ mb: 2, fontSize: '12px', py: 0.5 }}
                    action={excludedLines.size > 0 ? (
                      <Button
                        color="error" size="small" variant="contained"
                        startIcon={<DeleteIcon />}
                        onClick={removeExcludedLines}
                        disabled={removingLines}
                        sx={{ fontSize: '11px', textTransform: 'none' }}
                      >
                        {removingLines ? 'Fjerner...' : `Fjern ${excludedLines.size} markerede`}
                      </Button>
                    ) : undefined}
                  >
                    {excludedLines.size > 0
                      ? `${excludedLines.size} medarbejder(e) markeret til fjernelse fra denne lønkørsel. Klik "Fjern" for at gemme.`
                      : 'Kladde — markér medarbejdere med checkboks for at fjerne dem fra lønkørslen før godkendelse.'}
                  </Alert>
                )}

                {/* Summary */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                  {[
                    { label: t('payroll.totalGross'), value: selectedRun.total_gross },
                    { label: t('payroll.cnssEmployee'), value: selectedRun.total_cnss_employee },
                    { label: t('payroll.cnssEmployer'), value: selectedRun.total_cnss_employer },
                    { label: t('payroll.irAmount'), value: selectedRun.total_ir },
                    { label: t('payroll.totalNet'), value: selectedRun.total_net },
                  ].map(s => (
                    <Paper key={s.label} variant="outlined" sx={{ px: 2, py: 1, minWidth: 120 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '10px' }}>{s.label}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '13px' }}>{fmtNum(s.value)}</Typography>
                    </Paper>
                  ))}
                </Box>

                {/* Lines */}
                <TableContainer>
                  <Table size="small" sx={compact}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        {selectedRun.status === 'draft' && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={excludedLines.size === (selectedRun.lines || []).length && excludedLines.size > 0}
                              indeterminate={excludedLines.size > 0 && excludedLines.size < (selectedRun.lines || []).length}
                              onChange={() => toggleExcludeAll(selectedRun.lines || [])}
                            />
                          </TableCell>
                        )}
                        <TableCell sx={{ fontWeight: 600 }}>{t('payroll.employeeNumber')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Navn</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.grossSalary')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.cnssEmployee')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.cnssEmployer')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.irAmount')}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">{t('payroll.netSalary')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(selectedRun.lines || []).map(line => (
                        <TableRow key={line.id} sx={{ bgcolor: excludedLines.has(line.id) ? '#fff3e0' : undefined }}>
                          {selectedRun.status === 'draft' && (
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={excludedLines.has(line.id)}
                                onChange={() => toggleExcludeLine(line.id)}
                              />
                            </TableCell>
                          )}
                          <TableCell>{line.employee_number}</TableCell>
                          <TableCell>{line.employee_name}</TableCell>
                          <TableCell align="right">
                            {selectedRun.status === 'draft' ? (
                              editingLineId === line.id && editingLineField === 'gross' ? (
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editGross}
                                  onChange={e => setEditGross(e.target.value)}
                                  onBlur={() => {
                                    if (editGross !== line.gross_salary) {
                                      saveLineGross(selectedRun.id, line.id, editGross);
                                    } else {
                                      setEditingLineId(null);
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    } else if (e.key === 'Escape') {
                                      setEditingLineId(null);
                                    }
                                  }}
                                  autoFocus
                                  disabled={savingLine}
                                  sx={{ width: 100, '& input': { fontSize: '11px', py: 0.3, textAlign: 'right' } }}
                                />
                              ) : (
                                <Box
                                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover', borderRadius: 0.5 }, px: 0.5 }}
                                  onClick={() => { setEditingLineId(line.id); setEditingLineField('gross'); setEditGross(line.gross_salary); }}
                                >
                                  {fmtNum(line.gross_salary)}
                                </Box>
                              )
                            ) : (
                              fmtNum(line.gross_salary)
                            )}
                          </TableCell>
                          <TableCell align="right">{fmtNum(line.cnss_employee)}</TableCell>
                          <TableCell align="right">{fmtNum(line.cnss_employer)}</TableCell>
                          <TableCell align="right">{fmtNum(line.ir_amount)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>
                            {selectedRun.status === 'draft' ? (
                              editingLineId === line.id && editingLineField === 'net' ? (
                                <TextField
                                  size="small"
                                  type="number"
                                  value={editNet}
                                  onChange={e => setEditNet(e.target.value)}
                                  onBlur={() => {
                                    if (editNet !== line.net_salary) {
                                      saveLineNet(selectedRun.id, line.id, editNet);
                                    } else {
                                      setEditingLineId(null);
                                    }
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      (e.target as HTMLInputElement).blur();
                                    } else if (e.key === 'Escape') {
                                      setEditingLineId(null);
                                    }
                                  }}
                                  autoFocus
                                  disabled={savingLine}
                                  sx={{ width: 100, '& input': { fontSize: '11px', py: 0.3, textAlign: 'right' } }}
                                />
                              ) : (
                                <Box
                                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover', borderRadius: 0.5 }, px: 0.5 }}
                                  onClick={() => { setEditingLineId(line.id); setEditingLineField('net'); setEditNet(line.net_salary); }}
                                >
                                  {fmtNum(line.net_salary)}
                                </Box>
                              )
                            ) : (
                              fmtNum(line.net_salary)
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell colSpan={selectedRun.status === 'draft' ? 3 : 2} sx={{ fontWeight: 600 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(selectedRun.total_gross)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(selectedRun.total_cnss_employee)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(selectedRun.total_cnss_employer)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(selectedRun.total_ir)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(selectedRun.total_net)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </Box>
        </Box>
      )}

      {/* New Run Dialog */}
      <Dialog open={newRunOpen} onClose={() => setNewRunOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontSize: '14px' }}>{t('payroll.newRun')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', gap: 2, pt: '8px !important' }}>
          <TextField
            label={t('payroll.year')} type="number" fullWidth size="small"
            value={newRunYear} onChange={e => setNewRunYear(parseInt(e.target.value))}
          />
          <TextField
            label={t('payroll.month')} select fullWidth size="small"
            value={newRunMonth} onChange={e => setNewRunMonth(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => (
              <MenuItem key={i} value={i + 1}>{m}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewRunOpen(false)}>{t('common.cancel') || 'Cancel'}</Button>
          <Button variant="contained" onClick={createRun} disabled={creating}>
            {creating ? <CircularProgress size={20} /> : (t('common.create') || 'Create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Approve Dialog */}
      <Dialog open={confirmApproveOpen} onClose={() => setConfirmApproveOpen(false)}>
        <DialogTitle sx={{ fontSize: '14px' }}>{t('payroll.approve')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{t('payroll.confirmApprove')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmApproveOpen(false)}>{t('common.cancel') || 'Cancel'}</Button>
          <Button variant="contained" color="success" onClick={approveRun} disabled={approving}>
            {approving ? <CircularProgress size={20} /> : t('payroll.approve')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)}>
        <DialogTitle sx={{ fontSize: '14px' }}>{t('payroll.deleteConfirm')}</DialogTitle>
        <DialogActions>
          <Button onClick={() => setConfirmDeleteOpen(false)}>{t('common.cancel') || 'Cancel'}</Button>
          <Button variant="contained" color="error" onClick={deleteRun}>{t('common.delete') || 'Delete'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  // ─── Render Payslip tab ────────────────────────────────────────────

  const renderPayslip = () => (
    <Box>
      <Typography variant="h6" sx={{ fontSize: '16px', mb: 2 }}>{t('payroll.payslip')}</Typography>

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField
          label={t('payroll.selectEmployee')} select size="small" sx={{ minWidth: 250 }}
          value={psEmployee} onChange={e => setPsEmployee(e.target.value)}
        >
          <MenuItem value="">—</MenuItem>
          {employees.map(emp => (
            <MenuItem key={emp.id} value={emp.id}>
              {emp.employee_number} — {emp.first_name} {emp.last_name}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('payroll.selectMonth')} select size="small" sx={{ minWidth: 250 }}
          value={psRun} onChange={e => {
            setPsRun(e.target.value);
            if (e.target.value) fetchRunDetail(e.target.value);
          }}
        >
          <MenuItem value="">—</MenuItem>
          {runs.filter(r => r.status === 'approved').map(r => (
            <MenuItem key={r.id} value={r.id}>
              {monthName(r.month)} {r.year}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {payslipLine && payslipRun ? (
        <Paper variant="outlined" sx={{ p: 3, maxWidth: 600 }} id="payslip-content">
          <Typography variant="h6" sx={{ fontSize: '14px', mb: 2, textAlign: 'center', fontWeight: 600 }}>
            {t('payroll.payslip')} — {monthName(payslipRun.month)} {payslipRun.year}
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            <strong>{payslipLine.employee_name}</strong> ({payslipLine.employee_number})
          </Typography>

          <Table size="small" sx={compact}>
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{t('payroll.grossSalary')}</TableCell>
                <TableCell align="right">{fmtNum(payslipLine.gross_salary)} MAD</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ color: 'error.main' }}>- {t('payroll.cnssEmployee')}</TableCell>
                <TableCell align="right" sx={{ color: 'error.main' }}>-{fmtNum(payslipLine.cnss_employee)} MAD</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ color: 'error.main' }}>- {t('payroll.irAmount')}</TableCell>
                <TableCell align="right" sx={{ color: 'error.main' }}>-{fmtNum(payslipLine.ir_amount)} MAD</TableCell>
              </TableRow>
              <TableRow sx={{ bgcolor: 'success.50' }}>
                <TableCell sx={{ fontWeight: 700, borderTop: '2px solid #333' }}>{t('payroll.netSalary')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, borderTop: '2px solid #333' }}>{fmtNum(payslipLine.net_salary)} MAD</TableCell>
              </TableRow>
              <TableRow><TableCell colSpan={2} sx={{ pt: 2 }}></TableCell></TableRow>
              <TableRow>
                <TableCell sx={{ color: 'text.secondary', fontSize: '10px' }}>{t('payroll.cnssEmployer')}</TableCell>
                <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '10px' }}>{fmtNum(payslipLine.cnss_employer)} MAD</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Box sx={{ mt: 2, textAlign: 'right' }}>
            <Button size="small" startIcon={<PrintIcon />} onClick={() => window.print()}>
              {t('payroll.print')}
            </Button>
          </Box>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
          {t('payroll.selectEmployee')} + {t('payroll.selectMonth')}
        </Paper>
      )}
    </Box>
  );

  // ─── Render Vacation / leave tab ───────────────────────────────────

  const LEAVE_TYPE_OPTS = [
    { value: 'annual', label: t('payroll.leaveAnnual') },
    { value: 'sick', label: t('payroll.leaveSick') },
    { value: 'unpaid', label: t('payroll.leaveUnpaid') },
    { value: 'other', label: t('payroll.leaveOther') },
  ];
  const leaveTypeLabel = (tp: string) => LEAVE_TYPE_OPTS.find(o => o.value === tp)?.label || tp;

  const renderVacation = () => (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2 }}>
        <TextField
          label={t('payroll.year')} type="number" size="small" sx={{ width: 110 }}
          value={vacYear} onChange={e => setVacYear(parseInt(e.target.value) || vacYear)}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={openNewLeave} disabled={employees.length === 0}>
          {t('payroll.registerLeave')}
        </Button>
        {leaveLoading && <CircularProgress size={18} />}
      </Box>

      {/* Overview: entitled / taken / remaining */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('payroll.leaveOverview')} — {vacYear}</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
        <Table size="small" sx={compact}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell>{t('payroll.employeeNumber')}</TableCell>
              <TableCell>{t('payroll.employee')}</TableCell>
              <TableCell align="right">{t('payroll.entitled')}</TableCell>
              <TableCell align="right">{t('payroll.taken')}</TableCell>
              <TableCell align="right">{t('payroll.remaining')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {leaveOverview.map(r => (
              <TableRow key={r.employee_id}>
                <TableCell>{r.employee_number}</TableCell>
                <TableCell>{r.employee_name}</TableCell>
                <TableCell align="right">{fmtNum(r.entitled)}</TableCell>
                <TableCell align="right">{fmtNum(r.taken)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600, color: parseFloat(r.remaining) < 0 ? 'error.main' : 'inherit' }}>
                  {fmtNum(r.remaining)}
                </TableCell>
              </TableRow>
            ))}
            {leaveOverview.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 2, color: 'text.secondary' }}>{t('payroll.noEmployees')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Registered leave periods */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('payroll.leavePeriods')}</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" sx={compact}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell>{t('payroll.employee')}</TableCell>
              <TableCell>{t('payroll.leaveType')}</TableCell>
              <TableCell>{t('payroll.startDate')}</TableCell>
              <TableCell>{t('payroll.endDate')}</TableCell>
              <TableCell align="right">{t('payroll.days')}</TableCell>
              <TableCell>{t('payroll.notes')}</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {leaveEntries.map(l => (
              <TableRow key={l.id}>
                <TableCell>{l.employee_name}</TableCell>
                <TableCell>{leaveTypeLabel(l.leave_type)}</TableCell>
                <TableCell>{formatDate(l.start_date)}</TableCell>
                <TableCell>{formatDate(l.end_date)}</TableCell>
                <TableCell align="right">{fmtNum(l.days)}</TableCell>
                <TableCell>{l.note}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <IconButton size="small" onClick={() => openEditLeave(l)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                  <IconButton size="small" color="error" onClick={() => deleteLeave(l.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {leaveEntries.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ py: 2, color: 'text.secondary' }}>{t('payroll.noLeave')}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Leave dialog */}
      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingLeaveId ? t('payroll.editLeave') : t('payroll.registerLeave')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField select label={t('payroll.selectEmployee')} fullWidth size="small"
            value={leaveForm.employee_id} onChange={e => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}>
            {employees.map(emp => (
              <MenuItem key={emp.id} value={emp.id}>{emp.employee_number} — {emp.first_name} {emp.last_name}</MenuItem>
            ))}
          </TextField>
          <TextField select label={t('payroll.leaveType')} fullWidth size="small"
            value={leaveForm.leave_type} onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}>
            {LEAVE_TYPE_OPTS.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label={t('payroll.startDate')} type="date" fullWidth size="small" InputLabelProps={{ shrink: true }}
              value={leaveForm.start_date} onChange={e => setLeaveDate({ start_date: e.target.value })} />
            <TextField label={t('payroll.endDate')} type="date" fullWidth size="small" InputLabelProps={{ shrink: true }}
              value={leaveForm.end_date} onChange={e => setLeaveDate({ end_date: e.target.value })} />
          </Box>
          <TextField label={t('payroll.days')} type="number" fullWidth size="small"
            value={leaveForm.days} onChange={e => setLeaveForm({ ...leaveForm, days: e.target.value })}
            helperText={t('payroll.daysHelper')} inputProps={{ min: 0, step: '0.5' }} />
          <TextField label={t('payroll.notes')} fullWidth size="small" multiline rows={2}
            value={leaveForm.note} onChange={e => setLeaveForm({ ...leaveForm, note: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={saveLeave}
            disabled={!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );

  // ─── Render Public holidays tab ────────────────────────────────────

  const renderHolidays = () => {
    const divisor = parseFloat(dayDivisor) || 26;
    const empMap: Record<string, Employee> = Object.fromEntries(employees.map(e => [e.id, e]));
    const empName = (id: string) => {
      const e = empMap[id];
      return e ? `${e.first_name} ${e.last_name}`.trim() : '?';
    };
    const dailyExtra = (id: string) => {
      const e = empMap[id];
      return e ? parseFloat(e.gross_salary || '0') / divisor : 0;
    };
    const holidayExtra = (h: any) => (h.worker_ids || []).reduce((s: number, id: string) => s + dailyExtra(id), 0);
    // Per-employee worked-count for overview
    const workedCount: Record<string, number> = {};
    employees.forEach(e => { workedCount[e.id] = 0; });
    holidays.forEach(h => (h.worker_ids || []).forEach((id: string) => {
      if (workedCount[id] !== undefined) workedCount[id] += 1;
    }));
    const overviewRows = employees
      .map(e => ({ emp: e, count: workedCount[e.id] || 0 }))
      .filter(r => r.count > 0);

    return (
      <Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
          <TextField label={t('payroll.year')} type="number" size="small" sx={{ width: 110 }}
            value={holYear} onChange={e => setHolYear(parseInt(e.target.value) || holYear)} />
          <TextField label={t('payroll.dayDivisor')} type="number" size="small" sx={{ width: 150 }}
            value={dayDivisor} onChange={e => setDayDivisor(e.target.value)}
            helperText={t('payroll.dayDivisorHelp')} inputProps={{ min: 1, step: '1' }} />
          <Button variant="outlined" startIcon={<SeedIcon />} onClick={seedHolidays}>{t('payroll.seedHolidays')}</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openNewHoliday}>{t('payroll.addHoliday')}</Button>
          {holLoading && <CircularProgress size={18} />}
        </Box>

        {/* Holidays table */}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('payroll.holidays')} — {holYear}</Typography>
        <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
          <Table size="small" sx={compact}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ width: 110 }}>{t('common.date')}</TableCell>
                <TableCell>{t('payroll.holidayName')}</TableCell>
                <TableCell>{t('payroll.workedEmployees')}</TableCell>
                <TableCell align="right">{t('payroll.extraPay')}</TableCell>
                <TableCell sx={{ width: 110 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {holidays.map(h => (
                <TableRow key={h.id}>
                  <TableCell>{formatDate(h.date)}</TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {(h.worker_ids || []).map((id: string) => (
                        <Chip key={id} label={empName(id)} size="small" sx={{ height: 18, fontSize: 10 }} />
                      ))}
                      {(h.worker_ids || []).length === 0 && <Typography variant="caption" color="text.secondary">—</Typography>}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{holidayExtra(h) > 0 ? `${fmtNum(holidayExtra(h))} MAD` : ''}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" title={t('payroll.registerWork')} onClick={() => openWorkers(h)}><PeopleIcon sx={{ fontSize: 16 }} /></IconButton>
                    <IconButton size="small" onClick={() => openEditHoliday(h)}><EditIcon sx={{ fontSize: 16 }} /></IconButton>
                    <IconButton size="small" color="error" onClick={() => deleteHoliday(h.id)}><DeleteIcon sx={{ fontSize: 16 }} /></IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {holidays.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 2, color: 'text.secondary' }}>{t('payroll.noHolidays')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Per-employee overview */}
        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>{t('payroll.holidayPayOverview')}</Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" sx={compact}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell>{t('payroll.employee')}</TableCell>
                <TableCell align="right">{t('payroll.holidaysWorked')}</TableCell>
                <TableCell align="right">{t('payroll.extraPay')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {overviewRows.map(({ emp, count }) => (
                <TableRow key={emp.id}>
                  <TableCell>{emp.employee_number} — {emp.first_name} {emp.last_name}</TableCell>
                  <TableCell align="right">{count}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{fmtNum(dailyExtra(emp.id) * count)} MAD</TableCell>
                </TableRow>
              ))}
              {overviewRows.length === 0 && (
                <TableRow><TableCell colSpan={3} align="center" sx={{ py: 2, color: 'text.secondary' }}>{t('payroll.noHolidayWork')}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Add/edit holiday dialog */}
        <Dialog open={holDialogOpen} onClose={() => setHolDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{editingHolId ? t('payroll.editHoliday') : t('payroll.addHoliday')}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label={t('common.date')} type="date" fullWidth size="small" InputLabelProps={{ shrink: true }}
              value={holForm.date} onChange={e => setHolForm({ ...holForm, date: e.target.value })} />
            <TextField label={t('payroll.holidayName')} fullWidth size="small"
              value={holForm.name} onChange={e => setHolForm({ ...holForm, name: e.target.value })} />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setHolDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="contained" onClick={saveHoliday} disabled={!holForm.date}>{t('common.save')}</Button>
          </DialogActions>
        </Dialog>

        {/* Workers dialog */}
        <Dialog open={workersDialogOpen} onClose={() => setWorkersDialogOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>
            {t('payroll.registerWork')}
            {workersHoliday && <Typography variant="caption" display="block" color="text.secondary">{formatDate(workersHoliday.date)} — {workersHoliday.name}</Typography>}
          </DialogTitle>
          <DialogContent>
            {employees.map(emp => (
              <Box key={emp.id} sx={{ display: 'flex', alignItems: 'center' }}>
                <Checkbox size="small" checked={workersSel.has(emp.id)} onChange={() => toggleWorker(emp.id)} />
                <Typography variant="body2">{emp.employee_number} — {emp.first_name} {emp.last_name}</Typography>
              </Box>
            ))}
            {employees.length === 0 && <Typography variant="body2" color="text.secondary">{t('payroll.noEmployees')}</Typography>}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setWorkersDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="contained" onClick={saveWorkers}>{t('common.save')}</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  };

  // ─── Main render ───────────────────────────────────────────────────

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2, fontSize: '18px', fontWeight: 600 }}>
        {t('payroll.title')}
      </Typography>

      {msg && (
        <Alert severity={msg.type} onClose={() => setMsg(null)} sx={{ mb: 2 }}>
          {msg.text}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label={t('payroll.employees')} />
        <Tab label={t('payroll.payrollRuns')} />
        <Tab label={t('payroll.payslip')} />
        <Tab label={t('payroll.vacation')} />
        <Tab label={t('payroll.holidaysTab')} />
      </Tabs>

      {tab === 0 && renderEmployees()}
      {tab === 1 && renderRuns()}
      {tab === 2 && renderPayslip()}
      {tab === 3 && renderVacation()}
      {tab === 4 && renderHolidays()}
    </Box>
  );
};

export default Payroll;
