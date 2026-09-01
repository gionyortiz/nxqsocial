import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest, setUnauthorizedHandler, User } from './api';
import { unregisterPushToken } from './push';
import {
  clearStoredAuthSession,
  readStoredAuthToken,
  storeAuthToken,
  USER_KEY,
} from './secure-auth-storage';

export type AuthOutcome = 'authenticated' | 'email_verification_required';

export type PendingEmailVerification = {
  verificationToken: string;
  user: User;
  codeSent: boolean;
  codeExpiresAt: number;
  resendAvailableAt: number;
};

type RegisterInput = {
  email: string;
  username: string;
  displayName: string;
  password: string;
  turnstileToken: string;
  agreeToTerms: true;
};

type AuthenticatedResponse = {
  access_token: string;
  user: User;
};

type VerificationRequiredResponse = {
  status?: 'EMAIL_VERIFICATION_REQUIRED';
  requiresEmailVerification: true;
  verification_token?: string;
  access_token?: string;
  user: User;
  verification: {
    required: true;
    channel: 'email';
    sent: boolean;
    expiresInMinutes: number;
    resendAfterSeconds: number;
  };
};

type VerifyEmailResponse = {
  verified: true;
  channel: 'email';
  access_token: string;
  user: User;
};

type ResendVerificationResponse = {
  sent: true;
  channel: 'email';
  expiresInMinutes: number;
  resendAfterSeconds: number;
};

type AuthState = {
  token: string | null;
  user: User | null;
  pendingVerification: PendingEmailVerification | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthOutcome>;
  updateUser: (partial: Partial<User>) => Promise<void>;
  register: (input: RegisterInput) => Promise<AuthOutcome>;
  verifyEmail: (code: string) => Promise<void>;
  resendEmailVerification: () => Promise<ResendVerificationResponse>;
  markEmailVerificationCodeConsumed: () => void;
  clearPendingVerification: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function isVerificationRequiredResponse(
  data: AuthenticatedResponse | VerificationRequiredResponse,
): data is VerificationRequiredResponse {
  return 'requiresEmailVerification' in data && data.requiresEmailVerification === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [pendingVerification, setPendingVerification] = useState<PendingEmailVerification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setPendingVerification(null);
      setToken(null);
      setUser(null);
      void clearStoredAuthSession();
    });

    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          readStoredAuthToken(),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } else if (storedToken || storedUser) {
          await clearStoredAuthSession();
        }
      } catch {
        await clearStoredAuthSession();
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  const persistSession = useCallback(async (nextToken: string, nextUser: User) => {
    await Promise.all([
      storeAuthToken(nextToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(nextUser)),
    ]);
    setPendingVerification(null);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const acceptAuthResponse = useCallback(async (
    data: AuthenticatedResponse | VerificationRequiredResponse,
  ): Promise<AuthOutcome> => {
    if (isVerificationRequiredResponse(data)) {
      if (data.status !== undefined && data.status !== 'EMAIL_VERIFICATION_REQUIRED') {
        throw new Error('The authentication response was not recognized. Please try again.');
      }
      const verificationToken = data.verification_token ?? data.access_token;
      if (!verificationToken) {
        throw new Error('Email verification could not be started. Please try again.');
      }

      const now = Date.now();
      const codeSent = data.verification.sent;
      setToken(null);
      setUser(null);
      setPendingVerification({
        verificationToken,
        user: data.user,
        codeSent,
        codeExpiresAt: codeSent ? now + data.verification.expiresInMinutes * 60_000 : 0,
        resendAvailableAt: codeSent ? now + data.verification.resendAfterSeconds * 1000 : now,
      });
      await clearStoredAuthSession();
      return 'email_verification_required';
    }

    if (!data.access_token || !data.user) {
      throw new Error('The authentication response was incomplete. Please try again.');
    }
    await persistSession(data.access_token, data.user);
    return 'authenticated';
  }, [persistSession]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<AuthenticatedResponse | VerificationRequiredResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      retryNetworkErrors: false,
    });
    return acceptAuthResponse(data);
  }, [acceptAuthResponse]);

  const register = useCallback(async (input: RegisterInput) => {
    const data = await apiRequest<AuthenticatedResponse | VerificationRequiredResponse>('/auth/register', {
      method: 'POST',
      body: input,
      retryNetworkErrors: false,
    });
    return acceptAuthResponse(data);
  }, [acceptAuthResponse]);

  const verifyEmail = useCallback(async (code: string) => {
    if (!pendingVerification) {
      throw new Error('Your verification session has expired. Please sign in again.');
    }
    const data = await apiRequest<VerifyEmailResponse>('/auth/verify-email', {
      method: 'POST',
      body: { verificationToken: pendingVerification.verificationToken, code },
      retryNetworkErrors: false,
    });
    await persistSession(data.access_token, data.user);
  }, [pendingVerification, persistSession]);

  const resendEmailVerification = useCallback(async () => {
    if (!pendingVerification) {
      throw new Error('Your verification session has expired. Please sign in again.');
    }
    const data = await apiRequest<ResendVerificationResponse>('/auth/resend-verification', {
      method: 'POST',
      body: { verificationToken: pendingVerification.verificationToken },
      retryNetworkErrors: false,
    });
    const now = Date.now();
    setPendingVerification((current) => current ? {
      ...current,
      codeSent: true,
      codeExpiresAt: now + data.expiresInMinutes * 60_000,
      resendAvailableAt: now + data.resendAfterSeconds * 1000,
    } : current);
    return data;
  }, [pendingVerification]);

  const markEmailVerificationCodeConsumed = useCallback(() => {
    const now = Date.now();
    setPendingVerification((current) => current ? {
      ...current,
      codeSent: false,
      codeExpiresAt: 0,
      resendAvailableAt: now,
    } : current);
  }, []);

  const clearPendingVerification = useCallback(() => {
    setPendingVerification(null);
  }, []);

  const updateUser = useCallback(async (partial: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(USER_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    const currentToken = token;
    setPendingVerification(null);
    setToken(null);
    setUser(null);
    await clearStoredAuthSession();
    await unregisterPushToken(currentToken);
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      pendingVerification,
      loading,
      login,
      register,
      verifyEmail,
      resendEmailVerification,
      markEmailVerificationCodeConsumed,
      clearPendingVerification,
      logout,
      updateUser,
    }),
    [
      token,
      user,
      pendingVerification,
      loading,
      login,
      register,
      verifyEmail,
      resendEmailVerification,
      markEmailVerificationCodeConsumed,
      clearPendingVerification,
      logout,
      updateUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
