import { 
  signIn as amplifySignIn, 
  signOut as amplifySignOut,
  confirmSignIn as amplifyConfirmSignIn,
  resetPassword as amplifyResetPassword,
  confirmResetPassword as amplifyConfirmResetPassword,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth';
import { User } from './types';

// All possible sign-in steps from Amplify v6
// https://docs.amplify.aws/react/build-a-backend/auth/connect-your-frontend/multi-step-sign-in/
export type SignInStep = 
  | 'DONE'
  | 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED'
  | 'CONFIRM_SIGN_IN_WITH_SMS_CODE'
  | 'CONFIRM_SIGN_IN_WITH_TOTP_CODE'
  | 'CONFIRM_SIGN_IN_WITH_CUSTOM_CHALLENGE'
  | 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION'
  | 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP'
  | 'RESET_PASSWORD'
  | 'CONFIRM_SIGN_UP';

export interface SignInResult {
  isSignedIn: boolean;
  user?: User;
  nextStep?: SignInStep;
  codeDeliveryDetails?: {
    destination?: string;
    deliveryMedium?: string;
  };
}

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
 * Returns a result indicating if signed in or what next step is required
 */
export async function login(email: string, password: string): Promise<SignInResult> {
  const result = await amplifySignIn({ username: email, password });
  
  if (result.isSignedIn) {
    const user = await getCurrentAuthUser();
    if (!user) {
      throw new Error('Failed to get user after sign in');
    }
    return { isSignedIn: true, user };
  }
  
  // Return the next step required
  const nextStep = result.nextStep?.signInStep as SignInStep;
  return {
    isSignedIn: false,
    nextStep,
    codeDeliveryDetails: result.nextStep?.codeDeliveryDetails as SignInResult['codeDeliveryDetails'],
  };
}

/**
 * Confirm sign-in with a new password (for first-time login with temp password)
 */
export async function confirmSignInWithNewPassword(newPassword: string): Promise<SignInResult> {
  const result = await amplifyConfirmSignIn({ challengeResponse: newPassword });
  
  if (result.isSignedIn) {
    const user = await getCurrentAuthUser();
    if (!user) {
      throw new Error('Failed to get user after confirming sign in');
    }
    return { isSignedIn: true, user };
  }
  
  // There might be additional steps (e.g., MFA after password change)
  const nextStep = result.nextStep?.signInStep as SignInStep;
  return {
    isSignedIn: false,
    nextStep,
    codeDeliveryDetails: result.nextStep?.codeDeliveryDetails as SignInResult['codeDeliveryDetails'],
  };
}

/**
 * Initiate password reset flow
 */
export async function initiatePasswordReset(email: string): Promise<{ destination?: string }> {
  const result = await amplifyResetPassword({ username: email });
  
  if (result.nextStep.resetPasswordStep === 'CONFIRM_RESET_PASSWORD_WITH_CODE') {
    return {
      destination: result.nextStep.codeDeliveryDetails?.destination,
    };
  }
  
  return {};
}

/**
 * Confirm password reset with code and new password
 */
export async function confirmPasswordReset(
  email: string, 
  confirmationCode: string, 
  newPassword: string
): Promise<void> {
  await amplifyConfirmResetPassword({
    username: email,
    confirmationCode,
    newPassword,
  });
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
