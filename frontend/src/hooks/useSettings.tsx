import React, { useState, useEffect, createContext, useContext } from 'react';
import api from '../services/api';

interface AppSettings {
  date_format: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  date_format: 'DD-MM-YYYY',
};

const SettingsContext = createContext<AppSettings>(DEFAULT_SETTINGS);

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const token = localStorage.getItem('bk_token');
    if (!token) return;

    api.get('/settings')
      .then((res: any) => {
        if (res.data.success) {
          const data = res.data.data?.settings || res.data.data || {};
          const fmt = data.date_format || 'DD-MM-YYYY';
          setSettings({ date_format: fmt });
          localStorage.setItem('bk_date_format', fmt);
        }
      })
      .catch(() => {
        // Silently fall back to default
      });
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
};
