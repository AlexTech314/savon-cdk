import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth, AuthFlow } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import savonLogo from '@/assets/savon-logo.png';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { 
    login, 
    confirmNewPassword,
    forgotPassword,
    confirmResetPassword,
    startForgotPasswordFlow,
    cancelAuthFlow,
    isAuthenticated, 
    isLoading: authLoading,
    authFlow,
    pendingEmail,
    resetCodeDestination,
  } = useAuth();
  const { theme } = useTheme();
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const logoClass = theme === 'dark' ? 'invert' : '';

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.isSignedIn) {
        navigate('/');
      }
      // If not signed in, the authFlow state will change and show appropriate form
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setIsLoading(true);

    try {
      const result = await confirmNewPassword(newPassword);
      if (result.isSignedIn) {
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set new password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await forgotPassword(email);
      // Success - authFlow will change to CONFIRM_RESET_CODE
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate password reset');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    
    setIsLoading(true);

    try {
      await confirmResetPassword(resetCode, newPassword);
      setSuccess('Password reset successful! Please sign in with your new password.');
      setNewPassword('');
      setConfirmPassword('');
      setResetCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setError('');
    setSuccess('');
    cancelAuthFlow();
  };

  const renderForm = () => {
    switch (authFlow) {
      case 'NEW_PASSWORD_REQUIRED':
        return (
          <form onSubmit={handleNewPassword} className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold text-foreground">Set New Password</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Please create a new password for your account
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-input"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting password...
                </>
              ) : (
                'Set Password'
              )}
            </Button>
          </form>
        );

      case 'FORGOT_PASSWORD':
        return (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold text-foreground">Reset Password</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your email to receive a reset code
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="resetEmail">Email</Label>
              <Input
                id="resetEmail"
                type="email"
                placeholder="you@savondesigns.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-input"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending code...
                </>
              ) : (
                'Send Reset Code'
              )}
            </Button>

            <Button 
              type="button" 
              variant="ghost" 
              className="w-full" 
              onClick={handleBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </form>
        );

      case 'CONFIRM_RESET_CODE':
        return (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div className="text-center mb-4">
              <h2 className="text-lg font-semibold text-foreground">Enter Reset Code</h2>
              <p className="text-sm text-muted-foreground mt-1">
                A code was sent to {resetCodeDestination || pendingEmail}
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="resetCode">Verification Code</Label>
              <Input
                id="resetCode"
                type="text"
                placeholder="123456"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                required
                autoComplete="one-time-code"
                className="bg-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPasswordReset">New Password</Label>
              <Input
                id="newPasswordReset"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPasswordReset">Confirm Password</Label>
              <Input
                id="confirmPasswordReset"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="bg-input"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting password...
                </>
              ) : (
                'Reset Password'
              )}
            </Button>

            <Button 
              type="button" 
              variant="ghost" 
              className="w-full" 
              onClick={handleBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </form>
        );

      default: // LOGIN
        return (
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="border-green-500 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@savondesigns.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-input"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="bg-input"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>

            <Button 
              type="button" 
              variant="link" 
              className="w-full text-muted-foreground"
              onClick={() => {
                setError('');
                setSuccess('');
                startForgotPasswordFlow();
              }}
            >
              Forgot password?
            </Button>
          </form>
        );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-foreground/10 p-3 shadow-glow-primary">
            <img src={savonLogo} alt="Savon" className={cn("h-full w-full", logoClass)} />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Savon Control Center</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access the admin dashboard
          </p>
        </div>

        {/* Auth form */}
        <div className="card-gradient rounded-xl border border-border p-6 shadow-lg">
          {renderForm()}
        </div>
      </div>
    </div>
  );
};

export default Login;
