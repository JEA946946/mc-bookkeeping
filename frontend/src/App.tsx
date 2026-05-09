import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, CircularProgress } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';

import { AuthProvider } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout/Layout';

const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const ChartOfAccounts = React.lazy(() => import('./pages/ChartOfAccounts'));
const JournalEntries = React.lazy(() => import('./pages/JournalEntries'));
const BankStatements = React.lazy(() => import('./pages/BankStatements'));
const Reports = React.lazy(() => import('./pages/Reports'));
const MarginRecognition = React.lazy(() => import('./pages/MarginRecognition'));
const CMRSync = React.lazy(() => import('./pages/CMRSync'));

// New pages
const Customers = React.lazy(() => import('./pages/Customers'));
const Invoices = React.lazy(() => import('./pages/Invoices'));
const CreditNotes = React.lazy(() => import('./pages/CreditNotes'));
const Suppliers = React.lazy(() => import('./pages/Suppliers'));
const Bills = React.lazy(() => import('./pages/Bills'));
const Expenses = React.lazy(() => import('./pages/Expenses'));
const Payments = React.lazy(() => import('./pages/Payments'));
const BankTransactions = React.lazy(() => import('./pages/BankTransactions'));
const BankReconciliation = React.lazy(() => import('./pages/BankReconciliation'));
const BankRules = React.lazy(() => import('./pages/BankRules'));
const Projects = React.lazy(() => import('./pages/Projects'));
const Documents = React.lazy(() => import('./pages/Documents'));
const TaxCodes = React.lazy(() => import('./pages/TaxCodes'));
const TaxReport = React.lazy(() => import('./pages/TaxReport'));
const AuditLog = React.lazy(() => import('./pages/AuditLog'));
const Settings = React.lazy(() => import('./pages/Settings'));
const Users = React.lazy(() => import('./pages/Users'));

const PageLoader = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <CircularProgress />
  </Box>
);

const theme = createTheme({
  palette: {
    primary: { main: '#2e7d32', light: '#4caf50', dark: '#1b5e20' },
    secondary: { main: '#1976d2' },
    background: { default: '#f5f5f5', paper: '#ffffff' },
    text: { primary: '#333333', secondary: '#666666' },
  },
  typography: {
    fontSize: 13,
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    body1: { fontSize: '0.8125rem' },
    body2: { fontSize: '0.8125rem' },
    caption: { fontSize: '0.75rem' },
    button: { fontSize: '0.8125rem', textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderRadius: 8 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 6, padding: '8px 16px' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': { fontSize: '0.8125rem' },
          '& .MuiInputLabel-root': { fontSize: '0.8125rem' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { fontSize: '0.8125rem' },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { fontSize: '0.8125rem' },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: { fontSize: '0.8125rem' },
      },
    },
    MuiChip: {
      styleOverrides: {
        label: { fontSize: '0.8125rem' },
        labelSmall: { fontSize: '0.75rem' },
      },
    },
  },
});

const P = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><Layout>{children}</Layout></ProtectedRoute>
);

function App() {
  return (
    <AuthProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<P><Dashboard /></P>} />
              <Route path="/dashboard" element={<P><Dashboard /></P>} />
              {/* Bookkeeping */}
              <Route path="/accounts" element={<P><ChartOfAccounts /></P>} />
              <Route path="/journal-entries" element={<P><JournalEntries /></P>} />
              {/* Sales */}
              <Route path="/customers" element={<P><Customers /></P>} />
              <Route path="/invoices" element={<P><Invoices /></P>} />
              <Route path="/credit-notes" element={<P><CreditNotes /></P>} />
              {/* Purchases */}
              <Route path="/suppliers" element={<P><Suppliers /></P>} />
              <Route path="/bills" element={<P><Bills /></P>} />
              <Route path="/expenses" element={<P><Expenses /></P>} />
              {/* Bank */}
              <Route path="/bank-statements" element={<P><BankStatements /></P>} />
              <Route path="/bank-transactions" element={<P><BankTransactions /></P>} />
              <Route path="/payments" element={<P><Payments /></P>} />
              <Route path="/bank-reconciliation" element={<P><BankReconciliation /></P>} />
              <Route path="/bank-rules" element={<P><BankRules /></P>} />
              {/* Projects */}
              <Route path="/projects" element={<P><Projects /></P>} />
              {/* Tax */}
              <Route path="/tax-codes" element={<P><TaxCodes /></P>} />
              <Route path="/tax-report" element={<P><TaxReport /></P>} />
              <Route path="/margin-recognition" element={<P><MarginRecognition /></P>} />
              {/* Reports */}
              <Route path="/reports" element={<P><Reports /></P>} />
              {/* System */}
              <Route path="/cmr-sync" element={<P><CMRSync /></P>} />
              <Route path="/documents" element={<P><Documents /></P>} />
              <Route path="/audit-log" element={<P><AuditLog /></P>} />
              <Route path="/settings" element={<P><Settings /></P>} />
              <Route path="/users" element={<P><Users /></P>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
