import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Hub } from 'aws-amplify/utils';
import { User } from '@/lib/types';
import { 
  checkAuthSession, 
  login as authLogin, 
  logout as authLogout, 
  AuthState 
} from '@/lib/auth';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, isAuthenticated: false });
  const [isLoading, setIsLoading] = useState(true);

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
        case 'signedIn':
          const state = await checkAuthSession();
          setAuthState(state);
          break;
        case 'signedOut':
          setAuthState({ user: null, isAuthenticated: false });
          break;
        case 'tokenRefresh':
          // Session refreshed, re-check auth state
          const refreshedState = await checkAuthSession();
          setAuthState(refreshedState);
          break;
        case 'tokenRefresh_failure':
          // Token refresh failed, sign out
          setAuthState({ user: null, isAuthenticated: false });
          break;
      }
    });

    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await authLogin(email, password);
    setAuthState({ user, isAuthenticated: true });
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setAuthState({ user: null, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...authState, login, logout, isLoading }}>
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
