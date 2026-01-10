import { 
  signIn as amplifySignIn, 
  signOut as amplifySignOut, 
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';
import { User } from './types';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

/**
 * Get the current authenticated user
 */
export async function getCurrentAuthUser(): Promise<User | null> {
  try {
    const user = await getCurrentUser();
    return {
      email: user.signInDetails?.loginId || user.username,
      name: user.username,
    };
  } catch {
    return null;
  }
}

/**
 * Check if there's a valid session
 */
export async function checkAuthSession(): Promise<AuthState> {
  try {
    const session = await fetchAuthSession();
    if (session.tokens?.idToken) {
      const user = await getCurrentAuthUser();
      return { user, isAuthenticated: !!user };
    }
    return { user: null, isAuthenticated: false };
  } catch {
    return { user: null, isAuthenticated: false };
  }
}

/**
 * Sign in with email and password
 */
export async function login(email: string, password: string): Promise<User> {
  const result = await amplifySignIn({ username: email, password });
  
  if (result.isSignedIn) {
    const user = await getCurrentAuthUser();
    if (!user) {
      throw new Error('Failed to get user after sign in');
    }
    return user;
  }
  
  // Handle MFA or other challenges if needed
  if (result.nextStep) {
    throw new Error(`Additional step required: ${result.nextStep.signInStep}`);
  }
  
  throw new Error('Sign in failed');
}

/**
 * Sign out the current user
 */
export async function logout(): Promise<void> {
  await amplifySignOut();
}

/**
 * Get the ID token for API authorization
 */
export async function getIdToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}

/**
 * Get the access token
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}
