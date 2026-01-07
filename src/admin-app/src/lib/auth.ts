import { User } from './types';

const AUTH_KEY = 'savon_auth';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

export const getStoredAuth = (): AuthState => {
  try {
    const stored = localStorage.getItem(AUTH_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { user: parsed, isAuthenticated: true };
    }
  } catch {
    // Invalid stored data
  }
  return { user: null, isAuthenticated: false };
};

export const login = async (email: string, password: string): Promise<User> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock authentication - check for @savondesigns.com domain and demo123 password
  if (!email.endsWith('@savondesigns.com')) {
    throw new Error('Invalid email domain. Please use a @savondesigns.com email.');
  }
  
  if (password !== 'demo123') {
    throw new Error('Invalid password.');
  }
  
  const user: User = {
    email,
    name: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  };
  
  localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  
  return user;
};

export const logout = (): void => {
  localStorage.removeItem(AUTH_KEY);
};

export const validateToken = (): boolean => {
  const { isAuthenticated } = getStoredAuth();
  return isAuthenticated;
};
