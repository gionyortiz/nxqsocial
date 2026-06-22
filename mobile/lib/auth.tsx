import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, User } from './api';
import { unregisterPushToken } from './push';

const TOKEN_KEY = 'nxq.mobile.token';
const USER_KEY = 'nxq.mobile.user';

type AuthState = {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    inviteCode?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken) setToken(storedToken);
        if (storedUser) setUser(JSON.parse(storedUser));
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const persistSession = useCallback(async (nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, nextToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser)),
    ]);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{ access_token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await persistSession(data.access_token, data.user);
  }, [persistSession]);

  const register = useCallback(async (input: {
    email: string;
    username: string;
    displayName: string;
    password: string;
    inviteCode?: string;
  }) => {
    const data = await apiRequest<{ access_token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: input,
    });
    await persistSession(data.access_token, data.user);
  }, [persistSession]);

  const logout = useCallback(async () => {
    const currentToken = token;
    setToken(null);
    setUser(null);
    await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(USER_KEY)]);
    await unregisterPushToken(currentToken);
  }, [token]);

  const value = useMemo(
    () => ({ token, user, loading, login, register, logout }),
    [token, user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
