import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Hub } from 'aws-amplify/utils';
import { User } from '@/lib/types';
import { 
  checkAuthSession, 
  login as authLogin,
  confirmSignInWithNewPassword as authConfirmNewPassword,
  initiatePasswordReset as authInitiateReset,
  confirmPasswordReset as authConfirmReset,
  logout as authLogout, 
  AuthState,
  SignInStep,
  SignInResult,
} from '@/lib/auth';

// Auth flow states
export type AuthFlow = 
  | 'LOGIN'
  | 'NEW_PASSWORD_REQUIRED'
  | 'FORGOT_PASSWORD'
  | 'CONFIRM_RESET_CODE';

interface AuthContextType extends AuthState {
  // Current auth flow state
  authFlow: AuthFlow;
  pendingEmail: string | null;
  resetCodeDestination: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<SignInResult>;
  confirmNewPassword: (newPassword: string) => Promise<SignInResult>;
  forgotPassword: (email: string) => Promise<void>;
  confirmResetPassword: (code: string, newPassword: string) => Promise<void>;
  startForgotPasswordFlow: () => void;
  cancelAuthFlow: () => void;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isAuthenticated: false });
  const [isLoading, setIsLoading] = useState(true);
  const [authFlow, setAuthFlow] = useState<AuthFlow>('LOGIN');
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resetCodeDestination, setResetCodeDestination] = useState<string | null>(null);

  // Check auth session on mount
  useEffect(() => {
    const initAuth = async () => {
      const state = await checkAuthSession();
      setAuthState(state);
      setIsLoading(false);
    };
    
    initAuth();
  }, []);

  // Listen for Amplify auth events
  useEffect(() => {
    const unsubscribe = Hub.listen('auth', async ({ payload }) => {
      switch (payload.event) {
        case 'signedIn': {
          const state = await checkAuthSession();
          setAuthState(state);
          setAuthFlow('LOGIN');
          setPendingEmail(null);
          break;
        }
        case 'signedOut': {
          setAuthState({ user: null, isAuthenticated: false });
          setAuthFlow('LOGIN');
          setPendingEmail(null);
          break;
        }
        case 'tokenRefresh': {
          const refreshedState = await checkAuthSession();
          setAuthState(refreshedState);
          break;
        }
        case 'tokenRefresh_failure': {
          setAuthState({ user: null, isAuthenticated: false });
          break;
        }
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    const result = await authLogin(email, password);
    
    if (result.isSignedIn && result.user) {
      setAuthState({ user: result.user, isAuthenticated: true });
      setAuthFlow('LOGIN');
      setPendingEmail(null);
    } else if (result.nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      setAuthFlow('NEW_PASSWORD_REQUIRED');
      setPendingEmail(email);
    } else if (result.nextStep === 'RESET_PASSWORD') {
      setAuthFlow('FORGOT_PASSWORD');
      setPendingEmail(email);
    }
    
    return result;
  }, []);

  const confirmNewPassword = useCallback(async (newPassword: string): Promise<SignInResult> => {
    const result = await authConfirmNewPassword(newPassword);
    
    if (result.isSignedIn && result.user) {
      setAuthState({ user: result.user, isAuthenticated: true });
      setAuthFlow('LOGIN');
      setPendingEmail(null);
    }
    
    return result;
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const result = await authInitiateReset(email);
    setPendingEmail(email);
    setResetCodeDestination(result.destination || null);
    setAuthFlow('CONFIRM_RESET_CODE');
  }, []);

  const confirmResetPassword = useCallback(async (code: string, newPassword: string) => {
    if (!pendingEmail) {
      throw new Error('No email set for password reset');
    }
    await authConfirmReset(pendingEmail, code, newPassword);
    // After successful reset, go back to login
    setAuthFlow('LOGIN');
    setPendingEmail(null);
    setResetCodeDestination(null);
  }, [pendingEmail]);

  const cancelAuthFlow = useCallback(() => {
    setAuthFlow('LOGIN');
    setPendingEmail(null);
    setResetCodeDestination(null);
  }, []);

  const startForgotPasswordFlow = useCallback(() => {
    setAuthFlow('FORGOT_PASSWORD');
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setAuthState({ user: null, isAuthenticated: false });
    setAuthFlow('LOGIN');
    setPendingEmail(null);
  }, []);

  return (
    <AuthContext.Provider value={{ 
      ...authState, 
      authFlow,
      pendingEmail,
      resetCodeDestination,
      login, 
      confirmNewPassword,
      forgotPassword,
      confirmResetPassword,
      startForgotPasswordFlow,
      cancelAuthFlow,
      logout, 
      isLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
