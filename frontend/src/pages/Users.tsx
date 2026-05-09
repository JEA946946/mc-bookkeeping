import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Chip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

interface User {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  role: 'admin' | 'accountant' | 'viewer';
}

const EMPTY_CREATE_FORM = {
  username: '',
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  role: 'viewer' as 'admin' | 'accountant' | 'viewer',
};

const Users: React.FC = () => {
  const { t } = useTranslation();

  const ROLE_CHIP_PROPS: Record<string, { color: 'error' | 'primary' | 'default'; label: string }> = {
    admin: { color: 'error', label: t('users.admin') },
    accountant: { color: 'primary', label: t('users.accountant') },
    viewer: { color: 'default', label: t('users.viewer') },
  };

  const [users, setUsers] = useState<User[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });

  // Edit role dialog
  const [roleOpen, setRoleOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<'admin' | 'accountant' | 'viewer'>('viewer');

  const fetchUsers = () => {
    api.get('/users').then(res => {
      if (res.data.success) {
        setUsers(res.data.data?.users || res.data.users || []);
      }
    });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Create user
  const handleCreateOpen = () => {
    setCreateForm({ ...EMPTY_CREATE_FORM });
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createForm.username || !createForm.password) {
      alert(t('users.usernamePasswordRequired'));
      return;
    }
    try {
      await api.post('/users', createForm);
      setCreateOpen(false);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || t('users.errorCreating'));
    }
  };

  // Edit role
  const handleRoleOpen = (user: User) => {
    setEditingUser(user);
    setNewRole(user.role);
    setRoleOpen(true);
  };

  const handleRoleSave = async () => {
    if (!editingUser) return;
    try {
      await api.put(`/users/${editingUser.id}/role`, { role: newRole });
      setRoleOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || t('users.errorUpdatingRole'));
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{t('users.title')}</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateOpen} sx={{ bgcolor: '#2e7d32' }}>
          {t('users.addUser')}
        </Button>
      </Box>

      {/* Users Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
              <TableCell sx={{ fontWeight: 600 }}>{t('users.username')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('users.firstName')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('users.lastName')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('common.email')}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t('users.role')}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>{t('common.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(user => {
              const roleProps = ROLE_CHIP_PROPS[user.role] || { color: 'default' as const, label: user.role };
              return (
                <TableRow key={user.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{user.username}</Typography>
                  </TableCell>
                  <TableCell>{user.first_name}</TableCell>
                  <TableCell>{user.last_name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={roleProps.label}
                      size="small"
                      color={roleProps.color}
                      sx={{ height: 22, fontSize: '11px' }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => handleRoleOpen(user)} title={t('users.editRole')}>
                      <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('users.noUsers')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('users.addUser')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('users.username')}
              value={createForm.username}
              size="small"
              fullWidth
              required
              onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label={t('users.firstName')}
                value={createForm.first_name}
                size="small"
                fullWidth
                onChange={e => setCreateForm({ ...createForm, first_name: e.target.value })}
              />
              <TextField
                label={t('users.lastName')}
                value={createForm.last_name}
                size="small"
                fullWidth
                onChange={e => setCreateForm({ ...createForm, last_name: e.target.value })}
              />
            </Box>
            <TextField
              label={t('common.email')}
              value={createForm.email}
              size="small"
              fullWidth
              type="email"
              onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
            />
            <TextField
              label={t('users.password')}
              value={createForm.password}
              size="small"
              fullWidth
              type="password"
              required
              onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
            />
            <TextField
              label={t('users.role')}
              value={createForm.role}
              size="small"
              select
              fullWidth
              onChange={e => setCreateForm({ ...createForm, role: e.target.value as 'admin' | 'accountant' | 'viewer' })}
            >
              <MenuItem value="admin">{t('users.admin')}</MenuItem>
              <MenuItem value="accountant">{t('users.accountant')}</MenuItem>
              <MenuItem value="viewer">{t('users.viewer')}</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} sx={{ bgcolor: '#2e7d32' }}>
            {t('common.create')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={roleOpen} onClose={() => setRoleOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('users.editRole')}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            {editingUser && (
              <Typography variant="body2" sx={{ mb: 2 }}>
                {t('users.userLabel')} <strong>{editingUser.username}</strong> ({editingUser.first_name} {editingUser.last_name})
              </Typography>
            )}
            <TextField
              label={t('users.role')}
              value={newRole}
              size="small"
              select
              fullWidth
              onChange={e => setNewRole(e.target.value as 'admin' | 'accountant' | 'viewer')}
            >
              <MenuItem value="admin">{t('users.admin')}</MenuItem>
              <MenuItem value="accountant">{t('users.accountant')}</MenuItem>
              <MenuItem value="viewer">{t('users.viewer')}</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleRoleSave} sx={{ bgcolor: '#2e7d32' }}>
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
