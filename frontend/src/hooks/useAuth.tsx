import React, { useState, useEffect, createContext, useContext } from 'react';
import api from '../services/api';

interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('bk_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('bk_token');
    if (storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          setToken(storedToken);
          // Fetch profile
          api.get('/auth/profile').then((res: any) => {
            if (res.data.success) setUser(res.data.data.user);
          }).catch(() => {
            localStorage.removeItem('bk_token');
            localStorage.removeItem('bk_refreshToken');
            setToken(null);
          }).finally(() => setLoading(false));
          return;
        } else {
          // Token expired — try refresh
          const refreshTk = localStorage.getItem('bk_refreshToken');
          if (refreshTk) {
            api.post('/auth/refresh', { refreshToken: refreshTk }).then((res: any) => {
              if (res.data.success) {
                const newToken = res.data.data.token;
                localStorage.setItem('bk_token', newToken);
                if (res.data.data.refreshToken) {
                  localStorage.setItem('bk_refreshToken', res.data.data.refreshToken);
                }
                setToken(newToken);
                return api.get('/auth/profile');
              }
              throw new Error('Refresh failed');
            }).then((res: any) => {
              if (res.data.success) setUser(res.data.data.user);
            }).catch(() => {
              localStorage.removeItem('bk_token');
              localStorage.removeItem('bk_refreshToken');
              setToken(null);
            }).finally(() => setLoading(false));
            return;
          }
          localStorage.removeItem('bk_token');
          localStorage.removeItem('bk_refreshToken');
          setToken(null);
        }
      } catch {
        localStorage.removeItem('bk_token');
        setToken(null);
      }
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setLoading(true);
    try {
      const response = await api.post('/auth/login', { username, password });
      if (response.data.success) {
        setUser(response.data.data.user);
        setToken(response.data.data.token);
        localStorage.setItem('bk_token', response.data.data.token);
        if (response.data.data.refreshToken) {
          localStorage.setItem('bk_refreshToken', response.data.data.refreshToken);
        }
        return true;
      }
      return false;
    } catch (err) {
      // Re-throw so caller can see the actual error
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('bk_token');
    localStorage.removeItem('bk_refreshToken');
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user && !!token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
