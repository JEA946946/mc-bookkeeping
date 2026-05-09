import React, { useState } from 'react';
import { Box, TextField, Button, Typography, Alert, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError(t('login.required'));
      return;
    }
    const success = await login(username, password);
    if (success) {
      navigate('/dashboard');
    } else {
      setError(t('login.invalid'));
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', bgcolor: '#f5f5f5' }}>
      <Paper sx={{ p: 4, maxWidth: 400, width: '100%' }}>
        <Typography variant="h5" align="center" sx={{ mb: 3, fontWeight: 600, color: '#2e7d32' }}>
          {t('login.title')}
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <form onSubmit={handleSubmit}>
          <TextField
            fullWidth label={t('login.username')} value={username}
            onChange={(e) => setUsername(e.target.value)}
            sx={{ mb: 2 }} size="small" autoFocus
          />
          <TextField
            fullWidth label={t('login.password')} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3 }} size="small"
          />
          <Button
            fullWidth type="submit" variant="contained"
            disabled={loading}
            sx={{ bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}
          >
            {loading ? t('login.signingIn') : t('login.signIn')}
          </Button>
        </form>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
          {t('login.credentialsNote')}
        </Typography>
      </Paper>
    </Box>
  );
};

export default Login;
